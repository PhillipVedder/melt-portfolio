import { test, expect } from '@playwright/test';

test('optional real-provider smoke test and documentation screenshots', async ({ page }) => {
  test.skip(
    process.env.MELT_CAPTURE_LIVE !== '1',
    'Requires a configured Finnhub key and live provider access.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await page.mouse.move(10, 10);
  await page.screenshot({ path: 'docs/images/sandbox.png', fullPage: true });
  await page.getByRole('button', { name: 'Holdings', exact: true }).click();
  await page.screenshot({ path: 'docs/images/holdings.png', fullPage: true });
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await page.getByRole('button', { name: 'Technology −20%', exact: true }).click();
  await page.screenshot({ path: 'docs/images/scenarios.png', fullPage: true });
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000.00');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.screenshot({ path: 'docs/images/transfer.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.locator('canvas').evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let pixels = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) pixels++;
        return pixels / (c.width * c.height);
      }),
    )
    .toBeGreaterThan(0.15);
  await page.screenshot({ path: 'docs/images/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
