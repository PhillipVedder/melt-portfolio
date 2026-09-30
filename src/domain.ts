import Decimal from 'decimal.js';
import { z } from 'zod';

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_EVEN });
export const MAX_POSITIONS = 12;
export const CASH = 'CASH';
export const COLORS = [
  '#b4e89b',
  '#baa9ec',
  '#8ebbef',
  '#f5a58e',
  '#e5d489',
  '#8cdbd2',
  '#eeb7d8',
  '#acb9ca',
];
export const CATALOG = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla', sector: 'Consumer discretionary' },
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer discretionary' },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'V', name: 'Visa', sector: 'Financials' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
  { symbol: 'COST', name: 'Costco', sector: 'Consumer staples' },
];
export const STARTER = [
  { ...CATALOG[0], amount: 6000 },
  { ...CATALOG[1], amount: 4500 },
  { ...CATALOG[2], amount: 4000 },
  { ...CATALOG[3], amount: 3000 },
  { ...CATALOG[4], amount: 2500 },
];
const decimalString = z
  .string()
  .max(70)
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((v) => new Decimal(v).lte(1e12), 'Value exceeds limit');
const symbolSchema = z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/);
const positionSchema = z.object({
  symbol: symbolSchema.refine((s) => s !== CASH),
  name: z.string().min(1).max(80),
  sector: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shares: decimalString,
});
const eventSchema = z.object({
  id: z.string().max(80),
  at: z.number().finite().nonnegative(),
  from: symbolSchema,
  to: symbolSchema,
  amount: decimalString,
  fromUnits: decimalString,
  toUnits: decimalString,
  fromPrice: decimalString,
  toPrice: decimalString,
  undone: z.boolean(),
});
export const portfolioSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.number().finite().nonnegative(),
    initialValue: z.literal('25000'),
    cash: decimalString,
    positions: z.array(positionSchema).max(MAX_POSITIONS),
    events: z.array(eventSchema).max(100),
  })
  .refine(
    (p) => new Set(p.positions.map((v) => v.symbol)).size === p.positions.length,
    'Duplicate position',
  );
export type Portfolio = z.infer<typeof portfolioSchema>;
export type Position = Portfolio['positions'][number];
export type Quote = {
  symbol: string;
  price: number;
  previousClose: number;
  tradeAt: number;
  receivedAt: number;
};
export type Quotes = Record<string, Quote>;
export type Feed = {
  configured: boolean;
  transport: 'connecting' | 'streaming' | 'polling' | 'offline';
  market: 'open' | 'closed' | 'unknown';
  quotes: Quotes;
  error: string | null;
};
export type Holding = Position & {
  value: number;
  price: number | null;
  weight: number;
  changePct: number | null;
  quoted: boolean;
};
export const EMPTY_FEED: Feed = {
  configured: false,
  transport: 'connecting',
  market: 'unknown',
  quotes: {},
  error: null,
};

export function validQuote(q: Quote | undefined): q is Quote {
  return (
    !!q &&
    Number.isFinite(q.price) &&
    q.price > 0 &&
    Number.isFinite(q.previousClose) &&
    q.previousClose > 0
  );
}
export function usableQuote(q: Quote | undefined, now = Date.now()): q is Quote {
  return validQuote(q) && q.receivedAt <= now + 5000 && now - q.receivedAt < 90_000;
}
export function seedPortfolio(quotes: Quotes, now = Date.now()): Portfolio {
  if (!STARTER.every((p) => usableQuote(quotes[p.symbol], now)))
    throw new Error('Waiting for all five opening quotes.');
  return {
    version: 1,
    createdAt: now,
    initialValue: '25000',
    cash: '5000',
    events: [],
    positions: STARTER.map((p, i) => ({
      symbol: p.symbol,
      name: p.name,
      sector: p.sector,
      color: COLORS[i],
      shares: new Decimal(p.amount).div(quotes[p.symbol].price).toFixed(),
    })),
  };
}
export function holdings(portfolio: Portfolio, quotes: Quotes): Holding[] {
  const rows = portfolio.positions.map((p) => {
    const q = quotes[p.symbol];
    return {
      ...p,
      value: validQuote(q) ? new Decimal(p.shares).mul(q.price).toNumber() : 0,
      price: validQuote(q) ? q.price : null,
      changePct: validQuote(q) ? (q.price / q.previousClose - 1) * 100 : null,
      quoted: validQuote(q) || new Decimal(p.shares).isZero(),
      weight: 0,
    };
  });
  rows.push({
    symbol: CASH,
    name: 'US Dollar',
    sector: 'Cash',
    color: '#b4bdba',
    shares: portfolio.cash,
    value: Number(portfolio.cash),
    price: 1,
    changePct: null,
    quoted: true,
    weight: 0,
  });
  const total = rows.every((r) => r.quoted) ? rows.reduce((s, r) => s + r.value, 0) : 0;
  return rows.map((r) => ({ ...r, weight: total ? (r.value / total) * 100 : 0 }));
}
export function totalValue(p: Portfolio, q: Quotes): number {
  return holdings(p, q).reduce((s, r) => s + r.value, 0);
}

function priceFor(p: Portfolio, q: Quotes, symbol: string, now: number): Decimal {
  if (symbol === CASH) return new Decimal(1);
  if (!p.positions.some((h) => h.symbol === symbol))
    throw new Error('Choose a position in this portfolio.');
  if (!usableQuote(q[symbol], now))
    throw new Error(`A recent quote for ${symbol} is required. Refresh the feed and try again.`);
  return new Decimal(q[symbol].price);
}
function unitsFor(p: Portfolio, symbol: string): Decimal {
  return new Decimal(
    symbol === CASH ? p.cash : (p.positions.find((h) => h.symbol === symbol)?.shares ?? '0'),
  );
}
export function previewTransfer(
  p: Portfolio,
  q: Quotes,
  from: string,
  to: string,
  amount: string,
  now = Date.now(),
) {
  if (from === to) throw new Error('Choose two different holdings.');
  if (
    amount !== 'ALL' &&
    (amount.length > 30 || !/^\d+(?:\.\d{1,2})?$/.test(amount) || !new Decimal(amount).gt(0))
  )
    throw new Error('Enter a positive dollar amount with no more than two decimal places.');
  const fromPrice = priceFor(p, q, from, now),
    toPrice = priceFor(p, q, to, now);
  const available = unitsFor(p, from).mul(fromPrice);
  const dollars = amount === 'ALL' ? available : new Decimal(amount);
  if (!dollars.gt(0)) throw new Error('The source position is empty.');
  if (dollars.gt(available)) throw new Error('The amount exceeds the available balance.');
  return {
    dollars,
    fromPrice,
    toPrice,
    fromUnits: amount === 'ALL' ? unitsFor(p, from) : dollars.div(fromPrice),
    toUnits: dollars.div(toPrice),
    available,
  };
}
function applyUnits(p: Portfolio, symbol: string, delta: Decimal): Portfolio {
  const units = unitsFor(p, symbol).add(delta);
  // Decimal division can leave a sub-cent, sub-unit rounding residue after a full sale.
  const value = units.abs().lt('1e-24') ? '0' : units.toFixed();
  if (new Decimal(value).isNegative()) throw new Error('Insufficient units.');
  return symbol === CASH
    ? { ...p, cash: value }
    : {
        ...p,
        positions: p.positions.map((h) => (h.symbol === symbol ? { ...h, shares: value } : h)),
      };
}
export function transfer(
  p: Portfolio,
  q: Quotes,
  from: string,
  to: string,
  amount: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
  reviewedAt = now,
): Portfolio {
  if (reviewedAt > now || now - reviewedAt > 30_000)
    throw new Error('The quote lock expired. Review the transfer again.');
  const t = previewTransfer(p, q, from, to, amount, reviewedAt);
  const next = applyUnits(applyUnits(p, from, t.fromUnits.neg()), to, t.toUnits);
  return {
    ...next,
    events: [
      {
        id,
        at: now,
        from,
        to,
        amount: t.dollars.toFixed(),
        fromUnits: t.fromUnits.toFixed(),
        toUnits: t.toUnits.toFixed(),
        fromPrice: t.fromPrice.toFixed(),
        toPrice: t.toPrice.toFixed(),
        undone: false,
      },
      ...p.events,
    ].slice(0, 100),
  };
}
export function undo(p: Portfolio): Portfolio {
  const event = p.events.find((e) => !e.undone);
  if (!event) throw new Error('No transfer to undo.');
  const amount = new Decimal(event.amount);
  const tolerance = Decimal.max(amount.mul('1e-24'), '1e-24');
  if (
    !amount.gt(0) ||
    event.from === event.to ||
    (event.from === CASH && !new Decimal(event.fromPrice).eq(1)) ||
    (event.to === CASH && !new Decimal(event.toPrice).eq(1)) ||
    [
      [event.fromUnits, event.fromPrice],
      [event.toUnits, event.toPrice],
    ].some(
      ([units, price]) =>
        !new Decimal(price).gt(0) ||
        !new Decimal(units).gt(0) ||
        new Decimal(units).mul(price).minus(amount).abs().gt(tolerance),
    ) ||
    p.events.filter((e) => e.id === event.id).length !== 1
  )
    throw new Error('This journal entry is not safe to undo.');
  if ([event.from, event.to].some((s) => s !== CASH && !p.positions.some((h) => h.symbol === s)))
    throw new Error('A position in this transfer has been removed.');
  const next = applyUnits(
    applyUnits(p, event.to, new Decimal(event.toUnits).neg()),
    event.from,
    new Decimal(event.fromUnits),
  );
  return { ...next, events: p.events.map((e) => (e.id === event.id ? { ...e, undone: true } : e)) };
}
export function addPosition(p: Portfolio, stock: (typeof CATALOG)[number]): Portfolio {
  if (p.positions.length >= MAX_POSITIONS)
    throw new Error(`A sandbox can hold up to ${MAX_POSITIONS} stocks.`);
  if (p.positions.some((h) => h.symbol === stock.symbol))
    throw new Error('This stock is already in your portfolio.');
  const candidate = { ...stock, shares: '0', color: COLORS[p.positions.length % COLORS.length] };
  return { ...p, positions: [...p.positions, positionSchema.parse(candidate)] };
}
export function removePosition(p: Portfolio, symbol: string): Portfolio {
  const position = p.positions.find((h) => h.symbol === symbol);
  if (!position || !new Decimal(position.shares).isZero())
    throw new Error('Move the full position to cash before removing it.');
  if (p.events.some((e) => !e.undone && (e.from === symbol || e.to === symbol)))
    throw new Error(
      'This position is part of your undo history. Keep it until the next sandbox reset.',
    );
  return { ...p, positions: p.positions.filter((h) => h.symbol !== symbol) };
}
export function scenarioValue(rows: Holding[], shocks: Record<string, number>): number {
  return rows.reduce(
    (sum, r) => sum + r.value * (1 + (r.symbol === CASH ? 0 : (shocks[r.symbol] ?? 0)) / 100),
    0,
  );
}
export function parseBackup(raw: string): Portfolio {
  const p = restorePortfolio(raw);
  // Imported journals are descriptive only; never trust externally supplied unit deltas for undo.
  return { ...p, events: p.events.map((e) => ({ ...e, undone: true })) };
}
export function restorePortfolio(raw: string): Portfolio {
  if (raw.length > 200_000) throw new Error('Backup is too large.');
  const p = portfolioSchema.parse(JSON.parse(raw));
  return {
    ...p,
    positions: p.positions.map((position) => {
      const stock = CATALOG.find((s) => s.symbol === position.symbol);
      if (!stock) throw new Error('Unsupported stock in backup.');
      return { ...position, ...stock };
    }),
  };
}
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r\n]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export const money = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
export const percent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const sharesText = (n: string | number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(n));
