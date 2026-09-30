import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Droplets,
  FlaskConical,
  Grid2X2,
  History,
  List,
  Maximize2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import Decimal from 'decimal.js';
import {
  addPosition,
  CASH,
  CATALOG,
  csvCell,
  holdings,
  money,
  parseBackup,
  percent,
  removePosition,
  scenarioValue,
  seedPortfolio,
  sharesText,
  transfer,
  undo,
  usableQuote,
  type Quotes,
} from './domain';
import { usePortfolio } from './usePortfolio';
import {
  AddStock,
  AllocationBar,
  Change,
  IconButton,
  Modal,
  StockMark,
  TransferReview,
  TransferTicket,
} from './components';
import { BlobField } from './BlobField';

type View = 'sandbox' | 'holdings' | 'scenarios' | 'activity';
type Review = { from: string; to: string; amount: string; quotes: Quotes; at: number };
const NAV = [
  { id: 'sandbox', label: 'Sandbox', icon: Droplets },
  { id: 'holdings', label: 'Holdings', icon: List },
  { id: 'scenarios', label: 'Scenarios', icon: FlaskConical },
  { id: 'activity', label: 'Activity', icon: History },
] as const;

function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dateLabel(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function App() {
  const { portfolio, setPortfolio, feed, now, storageError, recovery, clearRecovery } =
    usePortfolio();
  const [view, setView] = useState<View>('sandbox');
  const [selected, setSelected] = useState('AAPL');
  const [from, setFrom] = useState('CASH'),
    [to, setTo] = useState('AAPL'),
    [amount, setAmount] = useState('500.00');
  const [paused, setPaused] = useState(false),
    [resetField, setResetField] = useState(0);
  const [modal, setModal] = useState<'add' | 'settings' | 'reset' | 'import' | null>(null);
  const [review, setReview] = useState<Review | null>(null),
    [reviewError, setReviewError] = useState('');
  const [toast, setToast] = useState('');
  const [burst, setBurst] = useState<{ from: string; to: string; id: string } | null>(null);
  const [shocks, setShocks] = useState<Record<string, number>>({});
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState<'value' | 'symbol'>('value');
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = portfolio ? holdings(portfolio, feed.quotes) : [];
  const complete = !!portfolio && rows.every((r) => r.quoted);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const selectedRow = rows.find((r) => r.symbol === selected);
  const stocks = rows.filter((r) => r.symbol !== CASH);
  const largest = [...stocks].sort((a, b) => b.value - a.value)[0];
  const sectors = Object.entries(
    rows.reduce<Record<string, number>>((a, r) => {
      a[r.sector] = (a[r.sector] ?? 0) + r.weight;
      return a;
    }, Object.create(null)),
  ).sort((a, b) => b[1] - a[1]);
  const stale = portfolio?.positions.some((p) => !usableQuote(feed.quotes[p.symbol], now)) ?? true;
  const feedTimes = Object.values(feed.quotes).map((q) => q.receivedAt);
  const checkedAgo = feedTimes.length
    ? Math.max(0, Math.floor((now - Math.min(...feedTimes)) / 1000))
    : null;
  const quoteTimes = Object.values(feed.quotes).map((q) => q.tradeAt);
  const feedLabel =
    feed.transport === 'streaming'
      ? 'Stream connected'
      : feed.transport === 'polling'
        ? 'Quote polling'
        : feed.transport === 'connecting'
          ? 'Connecting'
          : 'Feed offline';
  const scenarioTotal = scenarioValue(rows, shocks);
  const currentTitle = NAV.find((n) => n.id === view)!.label;
  useEffect(() => {
    document.title = `${currentTitle} | Melt`;
  }, [currentTitle]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  function attempt(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'This action could not be completed.');
    }
  }
  function stage(source: string, target: string) {
    setFrom(source);
    setTo(target);
    setSelected(source);
    const value = rows.find((r) => r.symbol === source)?.value ?? 0;
    setAmount(new Decimal(value).mul(0.05).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2));
    document.getElementById('amount')?.focus({ preventScroll: true });
    if (window.innerWidth < 900)
      document.getElementById('transfer-title')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'center',
      });
  }
  function openReview() {
    setReviewError('');
    setReview({ from, to, amount, at: Date.now(), quotes: structuredClone(feed.quotes) });
  }
  function confirmTransfer() {
    if (!review || !portfolio) return;
    try {
      if (Date.now() - review.at > 30_000)
        throw new Error('The quote lock expired. Close this preview and review again.');
      if ([review.from, review.to].some((s) => s !== CASH && !usableQuote(feed.quotes[s])))
        throw new Error('The feed is stale. Refresh quotes before confirming.');
      const updated = transfer(
        portfolio,
        review.quotes,
        review.from,
        review.to,
        review.amount,
        Date.now(),
        crypto.randomUUID(),
        review.at,
      );
      setPortfolio(updated);
      setBurst({ from: review.from, to: review.to, id: updated.events[0].id });
      setToast(
        `${money(Number(updated.events[0].amount))} moved from ${review.from} to ${review.to}.`,
      );
      setReview(null);
      setAmount('0.00');
    } catch (e) {
      setReviewError((e as Error).message);
    }
  }
  function exportCSV() {
    if (!complete) return;
    const body = [
      ['Symbol', 'Name', 'Shares', 'Price USD', 'Value USD', 'Weight percent', 'Trade timestamp'],
      ...rows.map((r) => [
        r.symbol,
        r.name,
        r.shares,
        r.price,
        r.value.toFixed(2),
        r.weight.toFixed(4),
        feed.quotes[r.symbol] ? new Date(feed.quotes[r.symbol].tradeAt).toISOString() : '',
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    download('melt-holdings.csv', body, 'text/csv');
    setToast('Holdings exported.');
  }
  async function readImport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error('Backup is too large.');
      const next = parseBackup(await file.text());
      if (next.positions.some((p) => !CATALOG.some((c) => c.symbol === p.symbol)))
        throw new Error('The backup includes unsupported stocks.');
      setPendingImport(next);
      setModal('import');
    } catch {
      setToast('This file is not a valid Melt backup. Your portfolio has not changed.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('sandbox');
          }}
          aria-label="Melt home"
        >
          <Droplets size={29} strokeWidth={1.7} />
          <span>
            melt<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="main-nav" aria-label="Workspace">
          {NAV.map((n) => (
            <button
              key={n.id}
              aria-current={view === n.id ? 'page' : undefined}
              className={view === n.id ? 'active' : ''}
              onClick={() => setView(n.id)}
            >
              <n.icon size={16} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="header-end">
          <span className="sandbox-badge">
            <span /> Paper portfolio
          </span>
          <IconButton label="Workspace settings" onClick={() => setModal('settings')}>
            <Settings2 size={19} />
          </IconButton>
          <span className="avatar" aria-label="Personal workspace">
            P
          </span>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              PERSONAL WORKSPACE <span>/</span> USD
            </div>
            <h1>
              {view === 'sandbox'
                ? 'Portfolio sandbox'
                : view === 'holdings'
                  ? 'Your holdings'
                  : view === 'scenarios'
                    ? 'What if the market moves?'
                    : 'Transfer activity'}
            </h1>
          </div>
          <div className="page-actions">
            <button className="button secondary" onClick={exportCSV} disabled={!complete}>
              <ArrowDownToLine size={16} /> Export
            </button>
            <button
              className="button primary"
              onClick={() => setModal('add')}
              disabled={!portfolio || portfolio.positions.length >= 12}
            >
              <Plus size={17} /> Add stock
            </button>
          </div>
        </div>
        <section className="metrics" aria-label="Portfolio summary">
          <div className="total-metric">
            <span className="metric-label">Portfolio value</span>
            <div className="total-value" data-testid="portfolio-total">
              {complete ? money(total) : '—'}
              <span>USD</span>
            </div>
            <span
              className={
                complete && total >= 25000 ? 'positive metric-caption' : 'muted metric-caption'
              }
            >
              {complete
                ? `${money(total - 25000)} (${percent((total / 25000 - 1) * 100)})`
                : '$25,000 starting capital'}
              <span className="muted"> {complete ? 'since start' : '· awaiting quotes'}</span>
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Invested capital</span>
            <strong>{complete ? money(total - Number(portfolio?.cash ?? 0), 0) : '—'}</strong>
            <span className="metric-caption muted">{stocks.length || 5} stock positions</span>
          </div>
          <div className="metric">
            <span className="metric-label">Available cash</span>
            <strong>{portfolio ? money(Number(portfolio.cash), 0) : '—'}</strong>
            <span className="metric-caption muted">
              {complete
                ? `${((Number(portfolio?.cash) / total) * 100).toFixed(1)}% of portfolio`
                : 'US Dollar'}
            </span>
          </div>
          <div className="metric concentration-metric">
            <span className="metric-label">
              Largest position{' '}
              <CircleHelp size={12}>
                <title>Individual position concentration, not a risk score</title>
              </CircleHelp>
            </span>
            <strong>
              {complete && largest ? `${largest.weight.toFixed(1)}%` : '—'}
              <span className="ticker-tag">{largest?.symbol ?? 'AAPL'}</span>
            </strong>
            <span className="metric-caption muted">
              {complete ? largest?.name : 'Awaiting allocation'}
            </span>
          </div>
        </section>
        {(feed.error || storageError) && (
          <div className="notice" role="status">
            <WifiOff size={16} />
            <span>{storageError || feed.error}</span>
            <IconButton
              label="Retry market data"
              onClick={() => {
                void fetch('/api/refresh', { method: 'POST' }).catch(() =>
                  setToast('The data service is unavailable.'),
                );
              }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </div>
        )}
        {portfolio && stale && !feed.error && (
          <div className="notice" role="status">
            <Activity size={16} />
            <span>Some quotes are stale or missing. Affected transfers are paused.</span>
          </div>
        )}

        {view === 'sandbox' && (
          <div className="workspace-grid">
            <section className="field-section">
              <div className="field-toolbar">
                <div className="section-heading">
                  <h2>Allocation field</h2>
                  <span className="count-badge">{rows.length || 6} assets</span>
                </div>
                <div className="field-tools">
                  <IconButton
                    label={paused ? 'Resume motion' : 'Pause motion'}
                    pressed={paused}
                    onClick={() => setPaused((p) => !p)}
                  >
                    {paused ? <Play size={15} /> : <Pause size={15} />}
                  </IconButton>
                  <IconButton label="Recenter field" onClick={() => setResetField((n) => n + 1)}>
                    <Maximize2 size={16} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <Grid2X2 size={15} />
                  <span className="muted small-text">Value</span>
                </div>
              </div>
              <BlobField
                rows={complete ? rows : []}
                selected={selected}
                onSelect={(symbol) => {
                  setSelected(symbol);
                  setFrom(symbol);
                  if (symbol === to) setTo(symbol === CASH ? (stocks[0]?.symbol ?? 'AAPL') : CASH);
                }}
                onPour={stage}
                paused={paused}
                reset={resetField}
                burst={burst}
              />
              <div className="asset-legend" aria-label="Select a holding">
                {rows.map((r) => (
                  <button
                    key={r.symbol}
                    className={selected === r.symbol ? 'selected' : ''}
                    aria-pressed={selected === r.symbol}
                    onClick={() => {
                      setSelected(r.symbol);
                      setFrom(r.symbol);
                      if (r.symbol === to)
                        setTo(r.symbol === CASH ? (stocks[0]?.symbol ?? 'AAPL') : CASH);
                    }}
                  >
                    <span style={{ background: r.color }} />
                    {r.symbol === CASH ? 'Cash' : r.symbol}
                    <small>{complete ? `${r.weight.toFixed(1)}%` : '—'}</small>
                  </button>
                ))}
              </div>
              <AllocationBar rows={complete ? rows : []} />
              <div className="field-detail">
                {selectedRow ? (
                  <>
                    <StockMark row={selectedRow} small />
                    <strong>{selectedRow.name}</strong>
                    <span className="muted">
                      {selectedRow.symbol === CASH
                        ? 'USD balance'
                        : `${sharesText(selectedRow.shares)} shares`}
                    </span>
                    <span className="detail-price">
                      {selectedRow.price !== null ? money(selectedRow.price) : 'Unpriced'}
                    </span>
                    <Change value={selectedRow.changePct} />
                  </>
                ) : (
                  <span className="muted">Finnhub · Real market prices</span>
                )}
              </div>
            </section>
            <TransferTicket
              portfolio={portfolio}
              quotes={feed.quotes}
              rows={rows}
              from={from}
              to={to}
              amount={amount}
              setFrom={setFrom}
              setTo={setTo}
              setAmount={setAmount}
              onReview={openReview}
            />
          </div>
        )}

        {view === 'holdings' && (
          <section className="holdings-section">
            <div className="section-toolbar">
              <h2>
                Positions <span className="count-badge">{rows.length}</span>
              </h2>
              <div className="search-input compact">
                <Search size={15} />
                <label htmlFor="holdings-search" className="sr-only">
                  Filter holdings
                </label>
                <input
                  id="holdings-search"
                  placeholder="Find a holding"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Holdings with latest price, daily quote change, fractional shares and allocation
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <button onClick={() => setSort('symbol')}>
                        Asset {sort === 'symbol' && <Check size={12} />}
                      </button>
                    </th>
                    <th scope="col">Price</th>
                    <th scope="col">Day change</th>
                    <th scope="col">Shares</th>
                    <th scope="col">
                      <button onClick={() => setSort('value')}>
                        Market value {sort === 'value' && <Check size={12} />}
                      </button>
                    </th>
                    <th scope="col">Weight</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows]
                    .filter((r) =>
                      `${r.symbol} ${r.name}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .sort((a, b) =>
                      sort === 'value' ? b.value - a.value : a.symbol.localeCompare(b.symbol),
                    )
                    .map((r) => (
                      <tr key={r.symbol}>
                        <th scope="row">
                          <div className="asset-cell">
                            <StockMark row={r} />
                            <span>
                              <strong>{r.symbol}</strong>
                              <small>{r.name}</small>
                            </span>
                          </div>
                        </th>
                        <td>{r.price !== null ? money(r.price) : '—'}</td>
                        <td>
                          <Change value={r.changePct} />
                        </td>
                        <td className="numeric muted">
                          {r.symbol === CASH ? '—' : sharesText(r.shares)}
                        </td>
                        <td className="numeric">{r.quoted ? money(r.value) : 'Unpriced'}</td>
                        <td>
                          <div className="weight-cell">
                            <span>{complete ? `${r.weight.toFixed(1)}%` : '—'}</span>
                            <div>
                              <span style={{ width: `${r.weight}%`, background: r.color }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <IconButton
                              label={`Move capital from ${r.symbol}`}
                              onClick={() => {
                                setView('sandbox');
                                setFrom(r.symbol);
                                setSelected(r.symbol);
                                setTo(r.symbol === CASH ? (stocks[0]?.symbol ?? 'AAPL') : CASH);
                              }}
                            >
                              <ArrowUpRight size={16} />
                            </IconButton>
                            {r.symbol !== CASH && r.shares === '0' && (
                              <IconButton
                                label={`Remove ${r.symbol}`}
                                onClick={() =>
                                  attempt(() => setPortfolio(removePosition(portfolio!, r.symbol)))
                                }
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="empty-text">Your holdings will appear when opening quotes arrive.</p>
            )}
            <div className="holdings-summary">
              <span>Portfolio total</span>
              <strong>{complete ? money(total) : 'Unpriced'}</strong>
            </div>
          </section>
        )}

        {view === 'scenarios' && (
          <div className="scenario-layout">
            <section className="scenario-controls">
              <div className="section-toolbar">
                <div>
                  <h2>Price shocks</h2>
                  <span className="muted small-text">
                    Hypothetical · Current holdings held constant
                  </span>
                </div>
                <IconButton label="Reset scenario" onClick={() => setShocks({})}>
                  <RotateCcw size={17} />
                </IconButton>
              </div>
              <div className="scenario-presets">
                <button
                  className="button secondary"
                  onClick={() => setShocks(Object.fromEntries(stocks.map((r) => [r.symbol, -10])))}
                  disabled={!complete}
                >
                  Market −10%
                </button>
                <button
                  className="button secondary"
                  onClick={() => setShocks(Object.fromEntries(stocks.map((r) => [r.symbol, 10])))}
                  disabled={!complete}
                >
                  Market +10%
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    setShocks(
                      Object.fromEntries(
                        stocks.map((r) => [r.symbol, r.sector === 'Technology' ? -20 : 0]),
                      ),
                    )
                  }
                  disabled={!complete}
                >
                  Technology −20%
                </button>
              </div>
              {stocks.map((r) => (
                <div className="shock-row" key={r.symbol}>
                  <div className="shock-label">
                    <StockMark row={r} small />
                    <label htmlFor={`shock-${r.symbol}`}>
                      {r.symbol}
                      <small>{r.name}</small>
                    </label>
                    <output
                      htmlFor={`shock-${r.symbol}`}
                      className={(shocks[r.symbol] ?? 0) < 0 ? 'negative' : 'positive'}
                    >
                      {percent(shocks[r.symbol] ?? 0)}
                    </output>
                  </div>
                  <input
                    id={`shock-${r.symbol}`}
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={shocks[r.symbol] ?? 0}
                    onChange={(e) =>
                      setShocks((s) => ({ ...s, [r.symbol]: Number(e.target.value) }))
                    }
                    disabled={!complete}
                  />
                  <div className="range-scale">
                    <span>−50%</span>
                    <span>0%</span>
                    <span>+50%</span>
                  </div>
                </div>
              ))}
            </section>
            <aside className="scenario-result">
              <span className="eyebrow">HYPOTHETICAL OUTCOME</span>
              <h2>{complete ? money(scenarioTotal) : '—'}</h2>
              <span className={scenarioTotal >= total ? 'positive' : 'negative'}>
                {complete
                  ? `${money(scenarioTotal - total)} (${percent(total ? (scenarioTotal / total - 1) * 100 : 0)})`
                  : 'Awaiting prices'}
              </span>
              <div className="scenario-comparison">
                {rows.map((r) => (
                  <div key={r.symbol}>
                    <span>{r.symbol}</span>
                    <div className="comparison-track">
                      <span style={{ width: `${r.weight}%`, background: r.color + '50' }} />
                      <span
                        style={{
                          width: `${Math.min(100, r.weight * (1 + (shocks[r.symbol] ?? 0) / 100))}%`,
                          background: r.color,
                        }}
                      />
                    </div>
                    <strong>
                      {money(
                        r.value * (1 + (r.symbol === CASH ? 0 : (shocks[r.symbol] ?? 0)) / 100),
                        0,
                      )}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="scenario-key">
                <span>
                  <i className="key-before" />
                  Current
                </span>
                <span>
                  <i />
                  Scenario
                </span>
              </div>
              <p className="modal-note">
                Price-shock estimate, not a forecast. No trades, correlations, dividends, taxes, or
                fees. Cash is unchanged.
              </p>
            </aside>
          </div>
        )}

        {view === 'activity' && (
          <section className="activity-section">
            <div className="section-toolbar">
              <h2>
                Transfer journal{' '}
                <span className="count-badge">{portfolio?.events.length ?? 0}</span>
              </h2>
              <button
                className="button secondary"
                disabled={!portfolio?.events.some((e) => !e.undone)}
                onClick={() =>
                  attempt(() => {
                    setPortfolio(undo(portfolio!));
                    setToast('The last transfer was undone. Original share quantities restored.');
                  })
                }
              >
                <RotateCcw size={15} /> Undo last transfer
              </button>
            </div>
            {portfolio?.events.length ? (
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">Virtual transfer history</caption>
                  <thead>
                    <tr>
                      <th scope="col">Transfer</th>
                      <th scope="col">Time</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Units received</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.events.map((e) => (
                      <tr key={e.id}>
                        <th scope="row">
                          <span className="journal-route">
                            {e.from}
                            <ArrowRight size={15} />
                            {e.to}
                          </span>
                        </th>
                        <td className="muted">{dateLabel(e.at)}</td>
                        <td>{money(Number(e.amount))}</td>
                        <td className="numeric muted">
                          {sharesText(e.toUnits)} {e.to === CASH ? 'USD' : 'shares'}
                        </td>
                        <td>
                          <span
                            className={e.undone ? 'event-status muted' : 'event-status positive'}
                          >
                            {e.undone ? 'Inactive' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="journal-empty">
                <History size={38} strokeWidth={1} />
                <h3>No transfers yet</h3>
                <p>Your portfolio starts here.</p>
                <button className="button secondary" onClick={() => setView('sandbox')}>
                  Open sandbox <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
        )}

        <section className="bottom-band">
          <div>
            <div className="section-heading">
              <h2>Exposure</h2>
              <span className="muted small-text">By sector</span>
            </div>
            <div className="exposure-list">
              {sectors.length ? (
                sectors.map(([sector, weight], i) => (
                  <div key={sector}>
                    <span>
                      <i
                        style={{
                          background: ['#b4e89b', '#baa9ec', '#b4bdba', '#8ebbef', '#f5a58e'][
                            i % 5
                          ],
                        }}
                      />
                      {sector}
                    </span>
                    <strong>{complete ? `${weight.toFixed(1)}%` : '—'}</strong>
                  </div>
                ))
              ) : (
                <span className="muted">Awaiting opening quotes</span>
              )}
            </div>
          </div>
          <div className="recent-transfer">
            <div className="section-heading">
              <h2>Last move</h2>
              <button className="text-button" onClick={() => setView('activity')}>
                View activity <ArrowUpRight size={14} />
              </button>
            </div>
            {portfolio?.events[0] ? (
              <div className="last-move">
                <span className="move-icon">
                  <ArrowUpRight size={20} />
                </span>
                <span>
                  <strong>
                    {portfolio.events[0].from} <ArrowRight size={12} /> {portfolio.events[0].to}
                  </strong>
                  <small>
                    {dateLabel(portfolio.events[0].at)} ·{' '}
                    {portfolio.events[0].undone ? 'Inactive' : 'Completed'}
                  </small>
                </span>
                <strong>{money(Number(portfolio.events[0].amount))}</strong>
              </div>
            ) : (
              <div className="last-move">
                <span className="move-icon">
                  <Droplets size={20} />
                </span>
                <span>
                  <strong>A fresh start</strong>
                  <small>
                    {portfolio
                      ? 'Portfolio funded with $25,000 virtual USD'
                      : 'Waiting for opening quotes'}
                  </small>
                </span>
              </div>
            )}
          </div>
        </section>
        <footer className="app-footer">
          <div>
            <span className={`feed-dot ${feed.transport === 'offline' ? 'offline' : ''}`} />
            {feed.transport === 'offline' ? <WifiOff size={12} /> : <Wifi size={12} />}
            <span>Finnhub · {feedLabel}</span>
            <span className="footer-divider">/</span>
            <span>
              {feed.market === 'open'
                ? 'US market open'
                : feed.market === 'closed'
                  ? 'US market closed'
                  : 'Market session unconfirmed'}
            </span>
          </div>
          <div>
            <span
              title={
                quoteTimes.length
                  ? `Oldest last trade: ${new Date(Math.min(...quoteTimes)).toLocaleString()}`
                  : undefined
              }
            >
              {checkedAgo === null ? 'No quotes yet' : `Quotes checked ${checkedAgo}s ago`}
            </span>
            <span className="footer-divider">/</span>
            <ShieldCheck size={12} />
            <span>Local sandbox</span>
          </div>
        </footer>
      </main>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Import portfolio backup"
        onChange={(e) => void readImport(e.target.files?.[0])}
      />
      {modal === 'add' && portfolio && (
        <AddStock
          portfolio={portfolio}
          onClose={() => setModal(null)}
          onAdd={(s) =>
            attempt(() => {
              setPortfolio(addPosition(portfolio, s));
              setTo(s.symbol);
              setFrom(CASH);
              setAmount('500.00');
              setView('sandbox');
              setModal(null);
              setToast(`${s.symbol} added. Awaiting its quote before funding.`);
            })
          }
        />
      )}
      {review && portfolio && (
        <TransferReview
          {...review}
          portfolio={portfolio}
          onClose={() => setReview(null)}
          onConfirm={confirmTransfer}
          error={reviewError}
        />
      )}
      {modal === 'settings' && (
        <Modal title="Workspace settings" onClose={() => setModal(null)}>
          <dl className="detail-list">
            <div>
              <dt>Market data</dt>
              <dd>Finnhub</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>{feed.configured ? 'Configured on server' : 'Not configured'}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>USD</dd>
            </div>
            <div>
              <dt>Portfolio storage</dt>
              <dd>This browser only</dd>
            </div>
            <div>
              <dt>Virtual starting capital</dt>
              <dd>$25,000.00</dd>
            </div>
            <div>
              <dt>Last trade (oldest)</dt>
              <dd>{quoteTimes.length ? dateLabel(Math.min(...quoteTimes)) : 'Unavailable'}</dd>
            </div>
          </dl>
          <div className="settings-actions">
            {recovery !== null && (
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    'melt-recovery.json',
                    recovery || JSON.stringify({ error: storageError }),
                  )
                }
              >
                <ArrowDownToLine size={16} /> Export recovery data
              </button>
            )}
            <button
              className="button secondary"
              disabled={!portfolio}
              onClick={() => {
                download('melt-backup.json', JSON.stringify(portfolio, null, 2));
                setToast('Portfolio backup exported.');
              }}
            >
              <ArrowDownToLine size={16} /> Export backup
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setModal(null);
                fileRef.current?.click();
              }}
            >
              <Upload size={16} /> Import backup
            </button>
            <button
              className="button secondary"
              onClick={() => {
                void fetch('/api/refresh', { method: 'POST' })
                  .then(() => setToast('Quote refresh requested.'))
                  .catch(() => setToast('The data service is unavailable.'));
              }}
            >
              <RefreshCw size={16} /> Refresh quotes
            </button>
            <button className="button danger" onClick={() => setModal('reset')}>
              <RotateCcw size={16} /> Reset sandbox
            </button>
          </div>
          <p className="modal-note">
            No real money, investment advice, brokerage access, or execution guarantees. Quote
            availability depends on your Finnhub plan.
          </p>
        </Modal>
      )}
      {modal === 'reset' && (
        <Modal title="Reset this sandbox?" onClose={() => setModal(null)}>
          <p className="confirm-copy">
            Your positions and transfer history will be replaced by a new $25,000 starter portfolio
            at current quotes. This cannot be undone.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() =>
                attempt(() => {
                  setPortfolio(seedPortfolio(feed.quotes));
                  clearRecovery();
                  setShocks({});
                  setFrom(CASH);
                  setTo('AAPL');
                  setAmount('500.00');
                  setSelected('AAPL');
                  setModal(null);
                  setToast('Sandbox reset to $25,000.');
                })
              }
            >
              Reset sandbox
            </button>
          </div>
        </Modal>
      )}
      {modal === 'import' && pendingImport && (
        <Modal title="Replace this portfolio?" onClose={() => setModal(null)}>
          <p className="confirm-copy">
            Import {pendingImport.positions.length} positions and{' '}
            {money(Number(pendingImport.cash))} cash? Existing positions and history will be
            replaced. Imported journal entries are read-only.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                setPortfolio(pendingImport);
                clearRecovery();
                setFrom(CASH);
                setTo(pendingImport.positions[0]?.symbol ?? CASH);
                setSelected(pendingImport.positions[0]?.symbol ?? CASH);
                setShocks({});
                setModal(null);
                setPendingImport(null);
                setToast('Portfolio imported. Waiting for fresh quotes.');
              }}
            >
              Replace portfolio
            </button>
          </div>
        </Modal>
      )}
      <div className={`toast ${toast ? 'visible' : ''}`} role="status">
        {toast && (
          <>
            <Check size={16} />
            <span>{toast}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast('')}>
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
