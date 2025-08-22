import { test, expect } from '@playwright/test';

// Helpers to find elements in the right pane
const pane = '#app-root';
const btn = (label: string) => `${pane} button:has-text("${label}")`;
const statusChip = '#app-root div >> text=/^(Available|Checked out|Finalized)/';

test.describe('Smoke: web right-pane actions', () => {
  test('checkout -> checkin -> finalize -> unfinalize updates banner', async ({ page }) => {
    await page.goto('/view');

    // Wait for pane to mount
    await page.waitForSelector(pane);

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
      await expect(page.locator('#app-root')).toContainText(/Finalized/);
    }

    // Unfinalize
    if (await page.locator(btn('Unfinalize')).isVisible().catch(() => false)) {
      await page.click(btn('Unfinalize'));
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
});
