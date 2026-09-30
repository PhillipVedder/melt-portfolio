import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpDown, Check, Plus, Search, X } from 'lucide-react';
import Decimal from 'decimal.js';
import {
  CASH,
  CATALOG,
  money,
  percent,
  previewTransfer,
  sharesText,
  type Holding,
  type Portfolio,
  type Quotes,
} from './domain';

export function IconButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function StockMark({
  row,
  small = false,
}: {
  row: Pick<Holding, 'symbol' | 'color'>;
  small?: boolean;
}) {
  return (
    <span
      className={`stock-mark ${small ? 'small' : ''}`}
      style={{ color: row.color, background: row.color + '17' }}
    >
      {row.symbol === CASH ? '$' : row.symbol.slice(0, 1)}
    </span>
  );
}
export function Change({ value }: { value: number | null }) {
  return value === null ? (
    <span className="muted">—</span>
  ) : (
    <span className={value >= 0 ? 'positive' : 'negative'}>{percent(value)}</span>
  );
}
export function AllocationBar({ rows }: { rows: Holding[] }) {
  return (
    <div className="allocation-bar" aria-hidden="true">
      {rows
        .filter((r) => r.weight > 0)
        .map((r) => (
          <span key={r.symbol} style={{ width: `${r.weight}%`, background: r.color }} />
        ))}
    </div>
  );
}

export function TransferTicket({
  portfolio,
  quotes,
  rows,
  from,
  to,
  amount,
  setFrom,
  setTo,
  setAmount,
  onReview,
}: {
  portfolio: Portfolio | null;
  quotes: Quotes;
  rows: Holding[];
  from: string;
  to: string;
  amount: string;
  setFrom: (s: string) => void;
  setTo: (s: string) => void;
  setAmount: (s: string) => void;
  onReview: () => void;
}) {
  const source = rows.find((r) => r.symbol === from),
    target = rows.find((r) => r.symbol === to);
  const available = source?.value ?? 0;
  const dollars = amount === 'ALL' ? available : Number(amount) || 0;
  let error = '',
    valid = false;
  if (portfolio && amount && dollars !== 0) {
    try {
      previewTransfer(portfolio, quotes, from, to, amount);
      valid = true;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const total = rows.every((r) => r.quoted) ? rows.reduce((sum, r) => sum + r.value, 0) : 0;
  const percentOfSource = available ? Math.min(100, (dollars / available) * 100) : 0;
  function fraction(f: number) {
    setAmount(
      f === 1
        ? 'ALL'
        : new Decimal(available).mul(f).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2),
    );
  }
  return (
    <aside className="transfer-ticket" aria-labelledby="transfer-title">
      <div className="section-heading">
        <h2 id="transfer-title">Move capital</h2>
        <ArrowUpDown size={18} className="muted" />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onReview();
        }}
      >
        <label htmlFor="from">From</label>
        <div className="asset-select">
          {source && <StockMark row={source} small />}
          <select
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={!portfolio}
          >
            {rows.map((r) => (
              <option key={r.symbol} value={r.symbol}>
                {r.symbol === CASH ? 'Cash · USD' : r.symbol}
              </option>
            ))}
          </select>
          <span>{source ? money(source.value) : '—'}</span>
        </div>
        <div className="swap-line">
          <IconButton
            label="Swap source and destination"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            disabled={!portfolio}
          >
            <ArrowDown size={16} />
          </IconButton>
        </div>
        <label htmlFor="to">To</label>
        <div className="asset-select">
          {target && <StockMark row={target} small />}
          <select id="to" value={to} onChange={(e) => setTo(e.target.value)} disabled={!portfolio}>
            {rows.map((r) => (
              <option key={r.symbol} value={r.symbol}>
                {r.symbol === CASH ? 'Cash · USD' : r.symbol}
              </option>
            ))}
          </select>
          <span>{target ? money(target.value) : '—'}</span>
        </div>
        <div className="amount-label">
          <label htmlFor="amount">Amount</label>
          <span>{amount === 'ALL' ? 'ALL UNITS · USD' : 'USD'}</span>
        </div>
        <div className="dollar-input">
          <span>$</span>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount === 'ALL' ? available.toFixed(2) : amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-describedby={error ? 'transfer-error' : undefined}
            disabled={!portfolio}
          />
        </div>
        <div className="fraction-buttons">
          {[0.1, 0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => fraction(f)}
              disabled={!portfolio || !available}
            >
              {f === 1 ? 'Max' : `${f * 100}%`}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="amount-range">
          Percentage of source holding
        </label>
        <input
          id="amount-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={percentOfSource}
          onChange={(e) => fraction(Number(e.target.value) / 100)}
          disabled={!portfolio || !available}
        />
        <div className="transfer-outcome">
          <span>Allocation after transfer</span>
          <div>
            <span>{from}</span>
            <strong>
              {valid && total
                ? `${Math.max(0, ((available - dollars) / total) * 100).toFixed(1)}%`
                : '—'}
            </strong>
            <ArrowRight size={13} />
            <span>{to}</span>
            <strong>
              {valid && total
                ? `${((((target?.value ?? 0) + dollars) / total) * 100).toFixed(1)}%`
                : '—'}
            </strong>
          </div>
        </div>
        {error && (
          <p id="transfer-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" type="submit" disabled={!valid}>
          Review transfer <ArrowRight size={17} />
        </button>
        <div className="ticket-foot">
          <Check size={13} /> Virtual money. No real trades.
        </div>
      </form>
    </aside>
  );
}

export function AddStock({
  portfolio,
  onAdd,
  onClose,
}: {
  portfolio: Portfolio;
  onAdd: (s: (typeof CATALOG)[number]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = CATALOG.filter((s) =>
    `${s.symbol} ${s.name} ${s.sector}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Modal title="Add a stock" onClose={onClose}>
      <label className="sr-only" htmlFor="stock-search">
        Search supported US stocks
      </label>
      <div className="search-input">
        <Search size={17} />
        <input
          id="stock-search"
          autoFocus
          placeholder="Search US stocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="stock-results">
        {filtered.map((s, i) => {
          const added = portfolio.positions.some((p) => p.symbol === s.symbol);
          return (
            <button
              className="stock-result"
              key={s.symbol}
              disabled={added}
              onClick={() => onAdd(s)}
            >
              <StockMark
                row={{ symbol: s.symbol, color: ['#b4e89b', '#baa9ec', '#8ebbef'][i % 3] }}
              />
              <span>
                <strong>{s.symbol}</strong>
                <small>{s.name}</small>
              </span>
              <span className="result-sector">{s.sector}</span>
              {added ? <Check size={17} /> : <Plus size={17} />}
            </button>
          );
        })}
        {!filtered.length && <p className="empty-text">No supported stocks match “{query}”.</p>}
      </div>
      <div className="modal-note">{portfolio.positions.length} of 12 positions · USD equities</div>
    </Modal>
  );
}

export function TransferReview({
  portfolio,
  quotes,
  from,
  to,
  amount,
  at,
  onClose,
  onConfirm,
  error,
}: {
  portfolio: Portfolio;
  quotes: Quotes;
  from: string;
  to: string;
  amount: string;
  at: number;
  onClose: () => void;
  onConfirm: () => void;
  error: string;
}) {
  let t: ReturnType<typeof previewTransfer> | null = null,
    previewError = '';
  try {
    t = previewTransfer(portfolio, quotes, from, to, amount, at);
  } catch (e) {
    previewError = (e as Error).message;
  }
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.max(0, 30 - Math.floor((Date.now() - at) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [at]);
  if (!t)
    return (
      <Modal title="Quote unavailable" onClose={onClose}>
        <p className="form-error" role="alert">
          {previewError}
        </p>
        <button className="button secondary" onClick={onClose}>
          Back to transfer
        </button>
      </Modal>
    );
  return (
    <Modal title="Review transfer" onClose={onClose}>
      <div className="review-amount">{money(t.dollars.toNumber())}</div>
      <div className="review-route">
        <span>{from}</span>
        <ArrowRight size={22} />
        <span>{to}</span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>{from === CASH ? 'Cash out' : 'Shares sold'}</dt>
          <dd>
            {from === CASH ? money(t.dollars.toNumber()) : sharesText(t.fromUnits.toNumber())}
          </dd>
        </div>
        <div>
          <dt>{to === CASH ? 'Cash in' : 'Shares bought'}</dt>
          <dd>{to === CASH ? money(t.dollars.toNumber()) : sharesText(t.toUnits.toNumber())}</dd>
        </div>
        <div>
          <dt>Source price</dt>
          <dd>{money(t.fromPrice.toNumber())}</dd>
        </div>
        <div>
          <dt>Destination price</dt>
          <dd>{money(t.toPrice.toNumber())}</dd>
        </div>
        {amount === 'ALL' && (
          <div>
            <dt>Entire position value</dt>
            <dd>{money(t.dollars.toNumber(), 8)}</dd>
          </div>
        )}
        <div>
          <dt>Fees / slippage</dt>
          <dd>$0.00 / 0%</dd>
        </div>
        <div>
          <dt>Sandbox quote lock</dt>
          <dd>{seconds ? `${seconds}s remaining` : 'Expired'}</dd>
        </div>
      </dl>
      <div className="review-disclaimer">
        Virtual reallocation at the displayed prices. No brokerage order is placed.
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" onClick={onConfirm} disabled={!seconds}>
          Confirm transfer <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
