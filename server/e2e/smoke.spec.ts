import { test, expect } from '@playwright/test';

// Helpers to find elements in the right pane
const pane = '#app-root, #react-root';
const btn = (label: string) => `${pane} button:has-text("${label}")`;
const statusChip = '#app-root div >> text=/^(Available|Checked out|Finalized)/';

test.describe('Smoke: web right-pane actions', () => {
  test('checkout -> release -> finalize -> unfinalize (button states)', async ({ page }) => {
    // Precondition: unfinalize and ensure not checked out
    await page.request.post('/api/v1/unfinalize', { data: { userId: 'e2e' } }).catch(() => {});
    const m = await page.request.get('/api/v1/state-matrix?platform=web&userId=e2e');
    try {
      const j = await m.json();
      const holder = j?.config?.checkoutStatus?.checkedOutUserId;
      if (holder) await page.request.post('/api/v1/checkin', { data: { userId: holder } });
    } catch {}

    await page.goto('/view');
    await page.waitForSelector(pane);
    await expect(page.locator(`${pane} >> text=Exhibits`)).toBeVisible();

    // Checkout -> expect Cancel Checkout
    if (await page.locator(btn('Checkout')).isVisible().catch(() => false)) {
      await page.click(btn('Checkout'));
      await expect(page.locator(btn('Cancel Checkout'))).toBeVisible();
      // Release via Cancel Checkout -> expect Checkout visible again
      await page.click(btn('Cancel Checkout'));
      await expect(page.locator(btn('Checkout'))).toBeVisible({ timeout: 10000 });
    }

    // Finalize -> expect Unfinalize visible and Finalize hidden
    if (await page.locator(btn('Finalize')).isVisible().catch(() => false)) {
      await page.click(btn('Finalize'));
      if (await page.locator(`${pane} >> text=Confirm`).isVisible().catch(() => false)) {
        await page.click(`${pane} button:has-text("Confirm")`);
      }
      await expect(page.locator(btn('Unfinalize'))).toBeVisible();
    }

    // Unfinalize -> expect Finalize visible again
    if (await page.locator(btn('Unfinalize')).isVisible().catch(() => false)) {
      await page.click(btn('Unfinalize'));
      if (await page.locator(`${pane} >> text=Confirm`).isVisible().catch(() => false)) {
        await page.click(`${pane} button:has-text("Confirm")`);
      }
      await expect(page.locator(btn('Finalize'))).toBeVisible();
    }
  });

  test('viewer shows view-only banner content is present', async ({ page }) => {
    await page.goto('/view');
    await page.waitForSelector(pane);
    // Wait a moment for banner render
    await page.waitForTimeout(300);
    // Expect the banner chip text to be rendered (Available/Checked out/Finalized)
    await expect(page.locator(statusChip)).toBeVisible();
  });

  test('web export returns bytes (capture and suppress download)', async ({ page }) => {
    await page.goto('/view');
    await page.waitForSelector(pane);
    // Ensure SuperDoc is ready and export API is present
    await page.waitForFunction(() => !!(window as any).superdocInstance && !!(window as any).superdocAPI?.export, undefined, { timeout: 15000 });
    // Ask the page to export and return base64 via our API, with retries
    const size = await page.evaluate(async () => {
      const api = (window as any).superdocAPI;
      for (let i = 0; i < 3; i++) {
        try {
          const b64 = await api.export('docx');
          const n = b64 ? atob(b64).length : 0;
          if (n > 1024) return n;
        } catch {}
        await new Promise(r => setTimeout(r, 600));
      }
      return 0;
    });
    expect(size).toBeGreaterThan(1024);
  });

  test('Admin upload (API) replaces working copy and switches source', async ({ page }) => {
    await page.goto('/view');
    await page.waitForSelector(pane);

    // Upload a 16KB PK-prefixed buffer via API (no UI button for replace)
    const size = 16384;
    const buf = Buffer.alloc(size, 0);
    buf[0] = 0x50; buf[1] = 0x4b;
    const upload = await page.request.post('/api/v1/document/upload', {
      multipart: {
        file: { name: 'default.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf }
      }
    });
    expect(upload.ok()).toBeTruthy();

    // Verify working doc HEAD reflects new size
    const head = await page.request.head('/documents/working/default.docx');
    expect(head.ok()).toBeTruthy();
    const len = Number(head.headers()['content-length'] || '0');
    expect(len).toBe(size);
  });

  test('client falls back to canonical when working doc is tiny', async ({ page }) => {
    // Prepare tiny working overlay via upload API
    const small = Buffer.alloc(2048, 0); small[0] = 0x50; small[1] = 0x4b;
    await page.request.post('/api/v1/document/upload', {
      multipart: {
        file: { name: 'default.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: small }
      }
    });

    await page.goto('/view');
    await page.waitForSelector(pane);

    // Expect the document fetch to target canonical (working is too small)
    const resp = await page.waitForResponse(r => r.url().includes('/documents/canonical/default.docx') && r.request().method() === 'GET');
    expect(resp.ok()).toBeTruthy();

    // Cleanup
    await page.request.post('/api/v1/document/revert', { data: {} });
  });

  test('client prefers working when overlay is large enough', async ({ page }) => {
    // Prepare large working overlay via upload API
    const large = Buffer.alloc(16384, 0); large[0] = 0x50; large[1] = 0x4b;
    await page.request.post('/api/v1/document/upload', {
      multipart: {
        file: { name: 'default.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: large }
      }
    });

    await page.goto('/view');
    await page.waitForSelector(pane);

    // Expect the document fetch to target working
    const resp = await page.waitForResponse(r => r.url().includes('/documents/working/default.docx') && r.request().method() === 'GET');
    expect(resp.ok()).toBeTruthy();

    // Cleanup
    await page.request.post('/api/v1/document/revert', { data: {} });
  });
});
