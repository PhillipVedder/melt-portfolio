import { useEffect, useState } from 'react';
import {
  EMPTY_FEED,
  STARTER,
  restorePortfolio,
  seedPortfolio,
  type Feed,
  type Portfolio,
  usableQuote,
} from './domain';

export const STORAGE_KEY = 'melt.portfolio.v1';
function loadSaved(): { portfolio: Portfolio | null; recovery: string | null; error: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return { portfolio: raw ? restorePortfolio(raw) : null, recovery: null, error: '' };
  } catch {
    return {
      portfolio: null,
      recovery: raw ?? '',
      error: raw
        ? 'The saved portfolio could not be read. It has not been overwritten. Export recovery data or reset in settings.'
        : 'Browser storage is unavailable. Export a backup before leaving.',
    };
  }
}
export function usePortfolio() {
  const [initial] = useState(loadSaved);
  const [storageError, setStorageError] = useState(initial.error);
  const [recovery, setRecovery] = useState(initial.recovery);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(initial.portfolio);
  const [feed, setFeed] = useState<Feed>(EMPTY_FEED);
  const [now, setNow] = useState(Date.now());
  const symbols =
    portfolio?.positions
      .map((p) => p.symbol)
      .sort()
      .join(',') || STARTER.map((p) => p.symbol).join(',');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let mounted = true;
    const source = new EventSource(`/api/feed?symbols=${encodeURIComponent(symbols)}`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Feed;
        if (
          mounted &&
          typeof data.configured === 'boolean' &&
          data.quotes &&
          typeof data.quotes === 'object'
        )
          setFeed(data);
      } catch {
        if (mounted) setFeed((f) => ({ ...f, error: 'Unable to read the market feed.' }));
      }
    };
    source.onerror = () => {
      if (mounted)
        setFeed((f) => ({
          ...f,
          transport: 'offline',
          error: 'Connection interrupted. Reconnecting automatically.',
        }));
    };
    return () => {
      mounted = false;
      source.close();
    };
  }, [symbols]);
  useEffect(() => {
    if (!portfolio && recovery === null && STARTER.every((p) => usableQuote(feed.quotes[p.symbol])))
      setPortfolio(seedPortfolio(feed.quotes));
  }, [portfolio, recovery, feed.quotes]);
  useEffect(() => {
    if (!portfolio || recovery !== null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      setStorageError('');
    } catch {
      setStorageError(
        'Changes could not be saved in this browser. Export a backup before leaving.',
      );
    }
  }, [portfolio, recovery]);
  return {
    portfolio,
    setPortfolio,
    feed,
    now,
    storageError,
    recovery,
    clearRecovery: () => {
      setRecovery(null);
      setStorageError('');
    },
  };
}
