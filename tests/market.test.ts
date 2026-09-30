import { describe, expect, it } from 'vitest';
import { Market, parseQuote, parseSymbols } from '../server/market';

describe('provider boundary', () => {
  it('validates and deduplicates only supported symbols', () => {
    expect(parseSymbols('AAPL,NVDA,AAPL')).toEqual(['AAPL', 'NVDA']);
    expect(() => parseSymbols('AAPL,https://evil.test')).toThrow();
    expect(() => parseSymbols('aapl')).toThrow();
    expect(() => parseSymbols('')).toThrow();
  });
  it('normalizes real quote timestamps without calling old trades live', () => {
    const q = parseQuote('AAPL', { c: 200, pc: 190, t: 1700000000 }, 1800000000000);
    expect(q?.tradeAt).toBe(1700000000000);
    expect(q?.receivedAt).toBe(1800000000000);
  });
  it.each([
    {},
    null,
    { c: 0, pc: 100, t: 1700000000 },
    { c: Infinity, pc: 100, t: 1700000000 },
    { c: 10, pc: 0, t: 1700000000 },
    { c: 10, pc: 100, t: Infinity },
  ])('rejects invalid upstream payloads', (raw) => {
    expect(parseQuote('AAPL', raw)).toBeNull();
  });
  it('starts unconfigured without pretending to be live', () => {
    const market = new Market('');
    market.start();
    expect(market.state.configured).toBe(false);
    expect(market.state.transport).toBe('offline');
    expect(market.state.quotes).toEqual({});
    market.stop();
  });
});
