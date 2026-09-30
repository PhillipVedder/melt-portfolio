import WebSocket from 'ws';
import { CATALOG, STARTER, type Feed, type Quote } from '../src/domain.js';

export const allowedSymbols = new Set(CATALOG.map((s) => s.symbol));
export function parseSymbols(input: unknown): string[] {
  if (typeof input !== 'string') return STARTER.map((s) => s.symbol);
  const symbols = [...new Set(input.split(','))];
  if (!symbols.length || symbols.length > 12 || symbols.some((s) => !allowedSymbols.has(s)))
    throw new Error('Unsupported symbols');
  return symbols;
}
export function parseQuote(symbol: string, raw: unknown, now = Date.now()): Quote | null {
  const q = raw as Record<string, unknown>;
  if (
    !q ||
    typeof q.c !== 'number' ||
    !Number.isFinite(q.c) ||
    q.c <= 0 ||
    typeof q.pc !== 'number' ||
    !Number.isFinite(q.pc) ||
    q.pc <= 0 ||
    typeof q.t !== 'number' ||
    !Number.isFinite(q.t) ||
    q.t <= 0 ||
    q.t * 1000 > now + 60_000
  )
    return null;
  return { symbol, price: q.c, previousClose: q.pc, tradeAt: q.t * 1000, receivedAt: now };
}

export class Market {
  state: Feed;
  listeners = new Set<(feed: Feed) => void>();
  private wanted = new Set(STARTER.map((s) => s.symbol));
  private socket: WebSocket | null = null;
  private pollTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private stopped = false;
  private fetching = false;
  private lastPoll = 0;
  private cooldown = 0;

  constructor(private key: string) {
    this.state = {
      configured: !!key,
      transport: key ? 'connecting' : 'offline',
      market: 'unknown',
      quotes: {},
      error: key ? null : 'Market data is not configured.',
    };
  }
  start() {
    if (!this.key) return;
    void this.refresh();
    this.connect();
    this.pollTimer = setInterval(() => void this.refresh(), 60_000);
  }
  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.publishTimer);
    this.socket?.close();
  }
  async watch(symbols: string[]) {
    let added = false;
    for (const symbol of symbols) {
      if (!allowedSymbols.has(symbol) || this.wanted.has(symbol)) continue;
      this.wanted.add(symbol);
      added = true;
      if (this.socket?.readyState === WebSocket.OPEN)
        this.socket.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
    if (added) await this.refresh(true);
  }
  private publish() {
    this.state = { ...this.state, quotes: { ...this.state.quotes } };
    for (const listener of this.listeners) listener(this.state);
  }
  private async request(path: string): Promise<unknown> {
    const response = await fetch(`https://finnhub.io/api/v1/${path}`, {
      headers: { 'X-Finnhub-Token': this.key },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 429) {
      this.cooldown = Date.now() + 60_000;
      throw new Error('The quote provider is rate-limiting requests. Retrying in a minute.');
    }
    if (response.status === 401 || response.status === 403)
      throw new Error('The provider rejected this key or its data permissions.');
    if (!response.ok) throw new Error('The quote provider is temporarily unavailable.');
    return response.json();
  }
  async refresh(newSymbolsOnly = false) {
    if (
      !this.key ||
      this.fetching ||
      Date.now() < this.cooldown ||
      (!newSymbolsOnly && Date.now() - this.lastPoll < 30_000)
    )
      return;
    this.fetching = true;
    this.lastPoll = Date.now();
    let error: string | null = null;
    try {
      for (const symbol of this.wanted) {
        if (newSymbolsOnly && this.state.quotes[symbol]) continue;
        if (this.stopped || Date.now() < this.cooldown) break;
        try {
          const quote = parseQuote(
            symbol,
            await this.request(`quote?symbol=${encodeURIComponent(symbol)}`),
          );
          if (!quote) throw new Error(`A valid quote for ${symbol} is unavailable.`);
          const existing = this.state.quotes[symbol];
          this.state.quotes[symbol] =
            existing && existing.tradeAt > quote.tradeAt ? existing : quote;
        } catch (e) {
          error = e instanceof Error ? e.message : 'Unable to retrieve market data.';
        }
      }
      if (!newSymbolsOnly && Date.now() >= this.cooldown) {
        try {
          const status = (await this.request('stock/market-status?exchange=US')) as {
            isOpen?: boolean;
          };
          this.state.market =
            typeof status.isOpen === 'boolean' ? (status.isOpen ? 'open' : 'closed') : 'unknown';
        } catch {
          this.state.market = 'unknown';
        }
      }
      this.state.error = error;
      if (this.socket?.readyState !== WebSocket.OPEN)
        this.state.transport = error ? 'offline' : 'polling';
    } finally {
      this.fetching = false;
      this.publish();
    }
  }
  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(this.key)}`);
    this.socket = socket;
    socket.on('open', () => {
      this.attempt = 0;
      this.state.transport = 'streaming';
      for (const symbol of this.wanted) socket.send(JSON.stringify({ type: 'subscribe', symbol }));
      this.publish();
    });
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') {
          this.state.error =
            'The streaming provider reported an error. Quote polling remains enabled.';
          this.publish();
          return;
        }
        if (message.type !== 'trade' || !Array.isArray(message.data)) return;
        let changed = false;
        for (const t of message.data) {
          const previous = this.state.quotes[t.s];
          if (
            !previous ||
            !this.wanted.has(t.s) ||
            !Number.isFinite(t.p) ||
            t.p <= 0 ||
            !Number.isFinite(t.t) ||
            t.t < previous.tradeAt ||
            t.t > Date.now() + 60_000
          )
            continue;
          this.state.quotes[t.s] = {
            ...previous,
            price: t.p,
            tradeAt: t.t,
            receivedAt: Date.now(),
          };
          changed = true;
        }
        if (changed && !this.publishTimer)
          this.publishTimer = setTimeout(() => {
            this.publishTimer = undefined;
            this.publish();
          }, 250);
      } catch {
        /* Malformed upstream frames must not interrupt the last valid snapshot. */
      }
    });
    socket.on('error', () => socket.close());
    socket.on('close', () => {
      this.state.transport = Object.keys(this.state.quotes).length ? 'polling' : 'offline';
      this.publish();
      if (!this.stopped)
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          Math.min(60_000, 2000 * 2 ** this.attempt++),
        );
    });
  }
}
