import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';

const stockNames = [
  'AAPL',
  'NVDA',
  'MSFT',
  'TSLA',
  'AMZN',
  'GOOGL',
  'META',
  'JPM',
  'V',
  'JNJ',
  'XOM',
  'COST',
];
async function setup(page: Page, options: { stale?: boolean; configured?: boolean } = {}) {
  const now = Date.now();
  const quotes =
    options.configured === false
      ? {}
      : Object.fromEntries(
          stockNames.map((symbol, i) => [
            symbol,
            {
              symbol,
              price: [200, 150, 400, 300, 250, 160, 500, 200, 280, 150, 100, 850][i],
              previousClose: [195, 155, 390, 308, 248, 158, 495, 198, 275, 149, 98, 845][i],
              receivedAt: options.stale ? now - 120000 : now,
              tradeAt: now - 60_000,
            },
          ]),
        );
  await page.route('**/api/feed?**', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ configured: options.configured !== false, transport: 'streaming', market: 'closed', quotes, error: options.configured === false ? 'Market data is not configured.' : null })}\n\n`,
    }),
  );
  await page.goto('/');
  if (options.configured !== false && !options.stale)
    await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
}

test('precise transfer, journal, undo and persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.getByLabel('From', { exact: true }).selectOption('CASH');
  await page.getByLabel('To', { exact: true }).selectOption('AAPL');
  await page.getByLabel('Amount', { exact: true }).fill('1250.25');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('6.25125');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  await expect(page.locator('.toast')).toContainText('$1,250.25 moved');
  await page.reload();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('$1,250.25');
  await page.getByRole('button', { name: 'Undo last transfer' }).click();
  await expect(page.getByRole('table')).toContainText('Inactive');
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  expect(errors).toEqual([]);
});

test('invalid inputs, swap, add stock, cancel and reset', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Amount', { exact: true }).fill('999999');
  await expect(page.getByRole('button', { name: 'Review transfer', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('exceeds');
  await page.getByRole('button', { name: 'Add stock', exact: true }).click();
  await page.getByLabel('Search supported US stocks').fill('Alphabet');
  await page.getByRole('button', { name: /GOOGL/ }).click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('GOOGL');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await page.getByRole('button', { name: 'Reset sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Reset sandbox', exact: true }).click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('AAPL');
});

test('scenarios change only hypothetical values', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await page.getByRole('button', { name: 'Market −10%', exact: true }).click();
  await expect(page.locator('.scenario-result h2')).toHaveText('$23,000.00');
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  await page.getByRole('button', { name: 'Reset scenario', exact: true }).click();
  await expect(page.locator('.scenario-result h2')).toHaveText('$25,000.00');
});

test('no API key means no fictional values or enabled transfers', async ({ page }) => {
  await setup(page, { configured: false });
  await expect(page.getByText('Waiting for market data')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review transfer', exact: true })).toBeDisabled();
  await expect(page.getByTestId('portfolio-total')).not.toContainText('$25,000.00');
});

test('desktop, tablet and mobile render meaningful canvas without overflow', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [1440, 1050],
    [820, 1180],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/melt-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          right: e.getBoundingClientRect().right,
        })),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      JSON.stringify({ width, overflow }),
    ).toBe(true);
    const ink = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
      return painted / (canvas.width * canvas.height);
    });
    expect(ink).toBeGreaterThan(0.15);
    await page.screenshot({ path: `test-results/melt-${width}.png`, fullPage: true });
  }
});

test('keyboard modal focus and automated accessibility checks', async ({ page }) => {
  await setup(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Workspace settings' })).toBeFocused();
  for (const name of ['Holdings', 'Scenarios', 'Activity']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
});

test('drag and Space stage a transfer without moving money until confirmed', async ({ page }) => {
  await page.addInitScript(() => {
    const labels: Record<string, { x: number; y: number }> = {};
    Object.assign(window, { __testCanvasLabels: labels });
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (['CASH', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN'].includes(text))
        labels[text] = { x, y: y + 15 };
      if (maxWidth === undefined) fillText.call(this, text, x, y);
      else fillText.call(this, text, x, y, maxWidth);
    };
  });
  await setup(page);
  await page.waitForFunction(
    () =>
      Object.keys((window as unknown as { __testCanvasLabels: object }).__testCanvasLabels)
        .length === 6,
  );
  const canvas = page.locator('canvas'),
    box = (await canvas.boundingBox())!;
  const coords = await page.evaluate(
    () =>
      (window as unknown as { __testCanvasLabels: Record<string, { x: number; y: number }> })
        .__testCanvasLabels,
  );
  const start = coords.CASH,
    end = coords.AAPL;
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('CASH');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('AAPL');
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('250.00');
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  await page.getByRole('button', { name: /^NVDA/, exact: false }).click();
  await canvas.focus();
  await page.mouse.move(box.x + end.x, box.y + end.y);
  await canvas.press('Space');
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('NVDA');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('AAPL');
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('225.00');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('$225.00 moved');
});

test('backup export, validated import confirmation, and CSV download', async ({ page }) => {
  await setup(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('melt-holdings.csv');
  const backup = await page.evaluate(() => localStorage.getItem('melt.portfolio.v1')!);
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(page.locator('.toast')).toContainText('not a valid Melt backup');
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole('dialog')).toContainText('Replace this portfolio?');
  await page.getByRole('button', { name: 'Replace portfolio', exact: true }).click();
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
});

test('reduced motion freezes organic wobble', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.waitForTimeout(800);
  const before = await page
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(300);
  const after = await page
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(createHash('sha256').update(before).digest('hex')).toBe(
    createHash('sha256').update(after).digest('hex'),
  );
});

test('corrupt browser storage is preserved until explicit reset', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('melt.portfolio.v1', '{recoverable-but-invalid'),
  );
  await setup(page, { configured: false });
  await expect(page.getByText(/saved portfolio could not be read/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('melt.portfolio.v1'))).toBe(
    '{recoverable-but-invalid',
  );
  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await expect(page.getByRole('button', { name: 'Export recovery data' })).toBeEnabled();
});

test('corrupt storage is not overwritten when valid quotes arrive', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('melt.portfolio.v1', '{invalid'));
  const now = Date.now();
  await page.route('**/api/feed?**', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ configured: true, transport: 'polling', market: 'unknown', error: null, quotes: Object.fromEntries(stockNames.map((symbol) => [symbol, { symbol, price: 100, previousClose: 99, receivedAt: now, tradeAt: now }])) })}\n\n`,
    }),
  );
  await page.goto('/');
  await expect(page.getByText(/saved portfolio could not be read/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('melt.portfolio.v1'))).toBe('{invalid');
  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await page.getByRole('button', { name: 'Reset sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Reset sandbox', exact: true }).click();
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('melt.portfolio.v1')!).version),
  ).toBe(1);
});

test('a storage read error never overwrites an inaccessible portfolio', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'melt.portfolio.v1') throw new DOMException('Denied', 'SecurityError');
      return originalGet.call(this, key);
    };
    const writes: string[] = [];
    Object.assign(window, { __testWrites: writes });
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      writes.push(key);
      originalSet.call(this, key, value);
    };
  });
  await setup(page, { configured: false });
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __testWrites: string[] }).__testWrites),
  ).not.toContain('melt.portfolio.v1');
});

test('Max sells all units and the UI preserves value', async ({ page }) => {
  await setup(page);
  await page.getByLabel('From', { exact: true }).selectOption('AAPL');
  await page.getByLabel('To', { exact: true }).selectOption('CASH');
  await page.getByRole('button', { name: 'Max', exact: true }).click();
  await expect(page.getByText('ALL UNITS · USD')).toBeVisible();
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Entire position value');
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('melt.portfolio.v1')!).positions.find(
          (p: { symbol: string }) => p.symbol === 'AAPL',
        ).shares,
    ),
  ).toBe('0');
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
});

test('the expired quote lock cannot execute', async ({ page }) => {
  await setup(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('dialog')).toContainText('Expired');
  await expect(page.getByRole('button', { name: 'Confirm transfer', exact: true })).toBeDisabled();
  await expect(page.getByTestId('portfolio-total')).toContainText('$25,000.00');
});
