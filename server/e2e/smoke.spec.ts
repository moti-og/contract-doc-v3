import { test, expect } from '@playwright/test';

// Helpers to find elements in the right pane
const pane = '#app-root, #react-root';
const btn = (label: string) => `${pane} button:has-text("${label}")`;
const statusChip = '#app-root div >> text=/^(Available|Checked out|Finalized)/';

test.describe('Smoke: web right-pane actions', () => {
  test('checkout -> checkin -> finalize -> unfinalize updates banner (React)', async ({ page }) => {
    await page.goto('/view');

    // Wait for pane to mount
    await page.waitForSelector(pane);
    // Ensure React elements present
    await expect(page.locator(`${pane} >> text=Exhibits`)).toBeVisible();

    // Ensure starting state loads
    await page.waitForTimeout(500);

    // Try Checkout (may be hidden if final). If present, click and expect banner update.
    if (await page.locator(btn('Checkout')).isVisible().catch(() => false)) {
      await page.click(btn('Checkout'));
      await expect(page.locator('#app-root')).toContainText(/Checked out|by/);
      // Checkin
      if (await page.locator(btn('Checkin')).isVisible().catch(() => false)) {
        await page.click(btn('Checkin'));
        await expect(page.locator('#app-root')).toContainText(/Available to check out|No one is editing/);
      }
    }

    // Finalize
    if (await page.locator(btn('Finalize')).isVisible().catch(() => false)) {
      await page.click(btn('Finalize'));
      // Confirm modal (React)
      if (await page.locator(`${pane} >> text=Confirm`).isVisible().catch(() => false)) {
        await page.click(`${pane} button:has-text("Confirm")`);
      }
      // Wait for buttons to reflect finalized state (Unfinalize appears)
      await expect(page.locator(btn('Unfinalize'))).toBeVisible();
    }

    // Unfinalize
    if (await page.locator(btn('Unfinalize')).isVisible().catch(() => false)) {
      await page.click(btn('Unfinalize'));
      if (await page.locator(`${pane} >> text=Confirm`).isVisible().catch(() => false)) {
        await page.click(`${pane} button:has-text("Confirm")`);
      }
      await expect(page.locator('#app-root')).toContainText(/Available to check out|No one is editing/);
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
    await page.waitForFunction(() => !!(window as any).superdocInstance && !!(window as any).superdocAPI?.export, undefined, { timeout: 10000 });
    // Ask the page to export and return base64 via our API
    const size = await page.evaluate(async () => {
      try {
        const api = (window as any).superdocAPI;
        let b64 = await api.export('docx');
        if (!b64 || b64.length < 100) {
          // Retry once after a brief delay to allow any lazy initialization
          await new Promise(r => setTimeout(r, 500));
          b64 = await api.export('docx');
        }
        return b64 ? atob(b64).length : 0;
      } catch { return 0; }
    });
    expect(size).toBeGreaterThan(1024);
  });

  test('client falls back to canonical when working doc is tiny', async ({ page }) => {
    // Prepare: ensure tiny working overlay via API
    await page.request.post('/api/v1/unfinalize', { data: { userId: 'e2e' } });
    await page.request.post('/api/v1/checkout', { data: { userId: 'e2e' } });
    const small = Buffer.alloc(2048, 0); small[0] = 0x50; small[1] = 0x4b;
    await page.request.post('/api/v1/save-progress', { data: { userId: 'e2e', base64: small.toString('base64') } });

    await page.goto('/view');
    await page.waitForSelector(pane);
    // Wait for SuperDoc mount logs to appear
    const msg = await page.waitForEvent('console', { predicate: (m) => /SuperDoc ready/.test(m.text()) });
    expect(msg).toBeTruthy();
    // The React logs print source changes; check for canonical
    const seen = new Set<string>();
    page.on('console', m => seen.add(m.text()));
    await page.waitForTimeout(300);
    const hasCanonical = Array.from(seen).some(t => /doc open \[canonical] url/.test(t) || /doc src set .*\/documents\/canonical\//.test(t));
    expect(hasCanonical).toBeTruthy();

    // Cleanup
    await page.request.post('/api/v1/document/revert', { data: {} });
    await page.request.post('/api/v1/checkin', { data: { userId: 'e2e' } });
  });

  test('client prefers working when overlay is large enough', async ({ page }) => {
    // Prepare: write larger working overlay
    await page.request.post('/api/v1/unfinalize', { data: { userId: 'e2e' } });
    await page.request.post('/api/v1/checkout', { data: { userId: 'e2e' } });
    const large = Buffer.alloc(16384, 0); large[0] = 0x50; large[1] = 0x4b;
    await page.request.post('/api/v1/save-progress', { data: { userId: 'e2e', base64: large.toString('base64') } });

    await page.goto('/view');
    await page.waitForSelector(pane);
    const seen = new Set<string>();
    page.on('console', m => seen.add(m.text()));
    await page.waitForFunction(() => !!(window as any).superdocInstance, undefined, { timeout: 10000 });
    await page.waitForTimeout(300);
    const hasWorking = Array.from(seen).some(t => /doc open \[working] url/.test(t) || /doc src set .*\/documents\/working\//.test(t));
    expect(hasWorking).toBeTruthy();

    // Cleanup
    await page.request.post('/api/v1/document/revert', { data: {} });
    await page.request.post('/api/v1/checkin', { data: { userId: 'e2e' } });
  });
});
