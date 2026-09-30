import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  addPosition,
  csvCell,
  CATALOG,
  holdings,
  parseBackup,
  previewTransfer,
  removePosition,
  scenarioValue,
  seedPortfolio,
  totalValue,
  transfer,
  undo,
  usableQuote,
  type Quotes,
} from '../src/domain';

const now = 1_800_000_000_000;
export const quotes = Object.fromEntries(
  CATALOG.map((s, i) => [
    s.symbol,
    {
      symbol: s.symbol,
      price: [200, 150, 400, 300, 250, 160, 500, 200, 280, 150, 100, 850][i],
      previousClose: 190,
      tradeAt: now - 3600000,
      receivedAt: now,
    },
  ]),
) as Quotes;
const seed = () => seedPortfolio(quotes, now);

describe('portfolio accounting', () => {
  it('starts with exactly $25,000 funded only from genuine validated quotes', () => {
    expect(totalValue(seed(), quotes)).toBe(25000);
    expect(seed().cash).toBe('5000');
    expect(() => seedPortfolio({}, now)).toThrow();
  });
  it('moves exact fractional shares and conserves marked portfolio value', () => {
    const p = seed();
    const next = transfer(p, quotes, 'CASH', 'AAPL', '1250.25', now, 'a');
    expect(next.cash).toBe('3749.75');
    expect(new Decimal(next.positions[0].shares).minus(p.positions[0].shares).toNumber()).toBe(
      6.25125,
    );
    expect(totalValue(next, quotes)).toBeCloseTo(totalValue(p, quotes), 8);
  });
  it('conserves value across hundreds of stock-to-stock transfers', () => {
    let p = seed();
    for (let i = 0; i < 500; i++)
      p = transfer(
        p,
        quotes,
        i % 2 ? 'NVDA' : 'MSFT',
        i % 2 ? 'MSFT' : 'NVDA',
        '12.73',
        now,
        String(i),
      );
    expect(totalValue(p, quotes)).toBeCloseTo(25000, 8);
    expect(p.events).toHaveLength(100);
    expect(p.positions.every((h) => new Decimal(h.shares).gte(0))).toBe(true);
  });
  it('supports a full exact cash transfer without negative balances', () => {
    const p = transfer(seed(), quotes, 'CASH', 'NVDA', '5000.00', now, 'a');
    expect(p.cash).toBe('0');
    expect(totalValue(p, quotes)).toBeCloseTo(25000, 8);
  });
  it.each(['-1', 'NaN', 'Infinity', '0', '1e3', '1.001', '', '5000.01'])(
    'rejects invalid amount %s',
    (amount) => {
      expect(() => transfer(seed(), quotes, 'CASH', 'AAPL', amount, now)).toThrow();
    },
  );
  it('rejects invalid symbols, same-asset transfers, missing and stale quotes', () => {
    expect(() => transfer(seed(), quotes, 'CASH', 'CASH', '1', now)).toThrow();
    expect(() => transfer(seed(), quotes, 'CASH', 'FAKE', '1', now)).toThrow();
    expect(() => transfer(seed(), {}, 'CASH', 'AAPL', '1', now)).toThrow();
    expect(() => transfer(seed(), quotes, 'AAPL', 'CASH', '1', now + 90_001)).toThrow();
  });
  it('allows a recent provider confirmation of an older last trade', () => {
    expect(usableQuote(quotes.AAPL, now)).toBe(true);
    expect(usableQuote({ ...quotes.AAPL, receivedAt: now + 10000 }, now)).toBe(false);
  });
  it('undo restores units, not old prices, even if prices have changed', () => {
    const p = seed(),
      moved = transfer(p, quotes, 'AAPL', 'NVDA', '123.45', now, 'a');
    const next = undo(moved);
    for (let i = 0; i < p.positions.length; i++)
      expect(Number(next.positions[i].shares)).toBeCloseTo(Number(p.positions[i].shares), 10);
    expect(next.events[0].undone).toBe(true);
    expect(() => undo(next)).toThrow();
  });
  it('undo works in reverse chronological order', () => {
    const moved = transfer(
      transfer(seed(), quotes, 'CASH', 'AAPL', '100', now, '1'),
      quotes,
      'AAPL',
      'MSFT',
      '50',
      now,
      '2',
    );
    const restored = undo(undo(moved));
    expect(restored.cash).toBe('5000');
    expect(totalValue(restored, quotes)).toBeCloseTo(25000, 8);
  });
  it('rejects an internally consistent forged journal that reprices USD cash', () => {
    const p = transfer(seed(), quotes, 'CASH', 'AAPL', '1', now, 'forged');
    p.events[0].fromPrice = '0.000001';
    p.events[0].fromUnits = '1000000';
    expect(() => undo(p)).toThrow('not safe to undo');
  });
  it('has preview quantities identical to execution quantities', () => {
    const p = seed(),
      preview = previewTransfer(p, quotes, 'AAPL', 'NVDA', '58.23', now);
    const event = transfer(p, quotes, 'AAPL', 'NVDA', '58.23', now).events[0];
    expect(event.toUnits).toBe(preview.toUnits.toFixed());
    expect(event.fromPrice).toBe('200');
  });
});

describe('positions and portability', () => {
  it('neutralizes CSV formula prefixes and preserves quoted text', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('  @SUM(1,2)')).toBe('"\'  @SUM(1,2)"');
    expect(csvCell('A "quoted" name')).toBe('"A ""quoted"" name"');
  });
  it('does not invent weights when a nonzero holding is unpriced', () => {
    const partial = { ...quotes };
    delete partial.AAPL;
    expect(holdings(seed(), partial).every((r) => r.weight === 0)).toBe(true);
  });
  it('adds zero-value positions without creating capital and removes only empty positions', () => {
    const p = addPosition(seed(), CATALOG[5]);
    expect(p.positions[5].shares).toBe('0');
    expect(totalValue(p, quotes)).toBe(25000);
    expect(removePosition(p, 'GOOGL').positions).toHaveLength(5);
    expect(() => removePosition(p, 'AAPL')).toThrow();
    expect(() => addPosition(p, CATALOG[5])).toThrow();
  });
  it('validates backups and disables imported undo deltas', () => {
    const p = transfer(seed(), quotes, 'CASH', 'AAPL', '100', now, 'a');
    const restored = parseBackup(JSON.stringify(p));
    expect(restored.cash).toBe('4900');
    expect(restored.events[0].undone).toBe(true);
    expect(() => parseBackup(JSON.stringify({ ...p, cash: '-1' }))).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ ...p, positions: [...p.positions, p.positions[0]] })),
    ).toThrow();
    expect(() => parseBackup('x'.repeat(200001))).toThrow();
    expect(() => parseBackup('{bad')).toThrow();
  });
  it('does not modify real holdings during scenario calculations and keeps cash unchanged', () => {
    const p = seed(),
      before = JSON.stringify(p),
      rows = holdings(p, quotes);
    const shocks = Object.fromEntries(rows.map((r) => [r.symbol, -10]));
    expect(scenarioValue(rows, shocks)).toBe(23000);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('computes allocations that sum to 100 percent', () => {
    expect(holdings(seed(), quotes).reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(100, 10);
  });
});
