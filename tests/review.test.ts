import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Decimal from 'decimal.js';
import { App } from '../src/App';
import { TransferReview, TransferTicket } from '../src/components';
import {
  CATALOG,
  EMPTY_FEED,
  holdings,
  parseBackup,
  previewTransfer,
  seedPortfolio,
  totalValue,
  transfer,
  undo,
  usableQuote,
  type Portfolio,
  type Quotes,
} from '../src/domain';
import * as portfolioHook from '../src/usePortfolio';
import { Market } from '../server/market';

const now = 1_800_000_000_000;
const quotes: Quotes = Object.fromEntries(
  CATALOG.map((stock, i) => [
    stock.symbol,
    {
      symbol: stock.symbol,
      price: [200.13, 137.37, 401.17, 299.11, 251.03][i % 5],
      previousClose: 190,
      tradeAt: now - 1000,
      receivedAt: now,
    },
  ]),
);
const seed = () => seedPortfolio(quotes, now);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  // A missed network mock must fail locally, never reach the quote provider.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected review network request');
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockPortfolio(portfolio: Portfolio, feedQuotes = quotes) {
  vi.spyOn(portfolioHook, 'usePortfolio').mockReturnValue({
    portfolio,
    setPortfolio: vi.fn(),
    now,
    storageError: '',
    recovery: null,
    clearRecovery: vi.fn(),
    feed: { ...EMPTY_FEED, configured: true, transport: 'polling', quotes: feedQuotes },
  });
}

describe('independent review: accounting safeguards', () => {
  it('conserves value across fractional transfers and restores units in reverse order', () => {
    const original = seed();
    let p = original;
    for (let i = 0; i < 80; i++) {
      p = transfer(
        p,
        quotes,
        i % 2 ? 'NVDA' : 'AAPL',
        i % 2 ? 'AAPL' : 'NVDA',
        '13.17',
        now,
        String(i),
      );
      expect(totalValue(p, quotes)).toBeCloseTo(25000, 8);
    }
    for (let i = 0; i < 80; i++) p = undo(p);
    for (const [i, position] of p.positions.entries()) {
      expect(
        new Decimal(position.shares).minus(original.positions[i].shares).abs().lt('1e-24'),
      ).toBe(true);
    }
    expect(p.cash).toBe(original.cash);
  });

  it('does not replay journal entries when importing the same backup again', () => {
    const moved = transfer(seed(), quotes, 'CASH', 'AAPL', '50.00', now, 'import');
    const imported = parseBackup(JSON.stringify(moved));
    expect(parseBackup(JSON.stringify(imported))).toEqual(imported);
    expect(() => undo(imported)).toThrow('No transfer to undo');
  });

  it('executes at the captured price while the snapshot is still fresh', () => {
    const snapshot = structuredClone(quotes);
    const p = seed();
    const preview = previewTransfer(p, snapshot, 'CASH', 'AAPL', '50.00', now);
    const result = transfer(p, snapshot, 'CASH', 'AAPL', '50.00', now + 20_000, 'locked');
    expect(result.events[0].toUnits).toBe(preview.toUnits.toFixed());
    expect(result.events[0].toPrice).toBe(String(snapshot.AAPL.price));
  });
});

// Regression checks from the independent first-pass review, retained after remediation.
describe('independent review: regression tests', () => {
  it('R2: an older REST response must not freshen a retained newer price', async () => {
    const market = new Market('synthetic-review-key');
    const receivedAt = now - 120_000;
    market.state.quotes.AAPL = { ...quotes.AAPL, tradeAt: receivedAt, receivedAt };
    expect(usableQuote(market.state.quotes.AAPL, now)).toBe(false);
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            c: 190,
            pc: 189,
            t: (now - 600_000) / 1000,
            isOpen: true,
          }),
          { status: 200 },
        ),
    );
    await market.refresh();
    expect(market.state.quotes.AAPL.price).toBe(quotes.AAPL.price);
    expect(market.state.quotes.AAPL.receivedAt).toBe(receivedAt);
    expect(usableQuote(market.state.quotes.AAPL, now)).toBe(false);
    market.stop();
  });

  it('R3: browser-restored journals must not authorize arbitrary undo credits', () => {
    const forged = seed();
    forged.events = [
      {
        id: 'forged',
        at: now,
        from: 'CASH',
        to: 'AAPL',
        amount: '1',
        fromUnits: '1000000',
        toUnits: '0',
        fromPrice: '1',
        toPrice: '200',
        undone: false,
      },
    ];
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(forged) });
    let restored: Portfolio | null = null;
    function ReadStorage() {
      restored = portfolioHook.usePortfolio().portfolio;
      return null;
    }
    renderToStaticMarkup(createElement(ReadStorage));
    expect(restored).not.toBeNull();
    expect(() => undo(restored!)).toThrow();
  });

  it('R4: a schema-valid imported sector must not crash the workspace', () => {
    const p = seed();
    p.positions[0].sector = 'constructor';
    const imported = parseBackup(JSON.stringify(p));
    mockPortfolio(imported);
    expect(() => renderToStaticMarkup(createElement(App))).not.toThrow();
  });

  it.each([
    { label: 'R5: imported names do not become CSV formulas', unquoted: false },
    {
      label: 'R12: unquoted zero-share positions export with a blank price and timestamp',
      unquoted: true,
    },
  ])('$label', async ({ unquoted }) => {
    const p = seed();
    p.positions[0].name = '=1+1';
    const feedQuotes = { ...quotes };
    if (unquoted) {
      p.positions.push({ ...p.positions[0], ...CATALOG[5], shares: '0' });
      delete feedQuotes.GOOGL;
    }
    mockPortfolio(parseBackup(JSON.stringify(p)), feedQuotes);
    let exportCSV: (() => void) | undefined;
    let downloaded: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloaded = blob as Blob;
      return 'blob:review';
    });
    vi.stubGlobal('document', { createElement: () => ({ click: vi.fn() }) });
    function captureExport(node: ReactNode): void {
      if (Array.isArray(node)) {
        node.forEach(captureExport);
        return;
      }
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
      const children = node.props.children;
      if (
        node.type === 'button' &&
        Array.isArray(children) &&
        children.some((child) => typeof child === 'string' && child.trim() === 'Export')
      )
        exportCSV = node.props.onClick;
      captureExport(children);
    }
    function CaptureApp() {
      const tree = App();
      captureExport(tree);
      return tree;
    }
    renderToStaticMarkup(createElement(CaptureApp));
    expect(exportCSV).toBeTypeOf('function');
    exportCSV!();
    expect(downloaded).toBeInstanceOf(Blob);
    expect(await downloaded!.text()).not.toContain('"=1+1"');
    if (unquoted)
      expect(await downloaded!.text()).toContain('"GOOGL","Alphabet","0","","0.00","0.0000",""');
  });

  it('R6: Max must permit closing a position whose value has fractions of a cent', () => {
    const p = seed();
    const changedQuotes = { ...quotes, AAPL: { ...quotes.AAPL, price: 201.17 } };
    const result = transfer(p, changedQuotes, 'AAPL', 'CASH', 'ALL', now, 'max');
    expect(result.positions[0].shares).toBe('0');
    expect(totalValue(result, changedQuotes)).toBeCloseTo(totalValue(p, changedQuotes), 8);
  });

  it('R7: crossing freshness between the ticket and review must not crash rendering', () => {
    const p = seed();
    const aging = { ...quotes, AAPL: { ...quotes.AAPL, receivedAt: now - 89_000 } };
    expect(() => previewTransfer(p, aging, 'CASH', 'AAPL', '50', now)).not.toThrow();
    expect(() =>
      renderToStaticMarkup(
        createElement(TransferReview, {
          portfolio: p,
          quotes: aging,
          from: 'CASH',
          to: 'AAPL',
          amount: '50',
          at: now + 2000,
          onClose: vi.fn(),
          onConfirm: vi.fn(),
          error: '',
        }),
      ),
    ).not.toThrow();
  });

  it('R8: an advertised 30-second lock must survive aging of its captured quote', () => {
    const p = seed();
    const snapshot = { ...quotes, AAPL: { ...quotes.AAPL, receivedAt: now - 89_000 } };
    expect(() => previewTransfer(p, snapshot, 'CASH', 'AAPL', '50', now)).not.toThrow();
    // The current feed passes App.confirmTransfer's separate freshness guard.
    expect(usableQuote({ ...quotes.AAPL, receivedAt: now + 2000 }, now + 2000)).toBe(true);
    expect(() =>
      transfer(p, snapshot, 'CASH', 'AAPL', '50', now + 2000, 'lock', now),
    ).not.toThrow();
    expect(() => transfer(p, snapshot, 'CASH', 'AAPL', '50', now + 31000, 'lock', now)).toThrow();
  });

  it('R9: the loading ticket must not present an invented 50000% allocation', () => {
    const html = renderToStaticMarkup(
      createElement(TransferTicket, {
        portfolio: null,
        quotes: {},
        rows: [],
        from: 'CASH',
        to: 'AAPL',
        amount: '500.00',
        setFrom: vi.fn(),
        setTo: vi.fn(),
        setAmount: vi.fn(),
        onReview: vi.fn(),
      }),
    );
    expect(html).not.toContain('50000.0%');
  });
});
