import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Market, parseSymbols } from './market.js';

const app = express();
const host = process.env.HOST ?? '127.0.0.1';
if (!['127.0.0.1', '::1'].includes(host))
  throw new Error('Melt requires a loopback HOST (127.0.0.1 or ::1).');
const market = new Market(process.env.FINNHUB_API_KEY?.trim() ?? '');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    const allowed = ['localhost', '127.0.0.1', '[::1]'];
    if (!allowed.includes(req.hostname))
      return res.status(403).json({ error: 'This data service is local-only.' });
    if (req.headers.origin) {
      try {
        if (!allowed.includes(new URL(req.headers.origin).hostname))
          return res.status(403).json({ error: 'Origin rejected.' });
      } catch {
        return res.status(403).json({ error: 'Origin rejected.' });
      }
    }
  }
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true, configured: market.state.configured }));
app.get('/api/feed', async (req, res) => {
  let symbols: string[];
  try {
    symbols = parseSymbols(req.query.symbols);
  } catch {
    return res.status(400).json({ error: 'Unsupported symbols.' });
  }
  if (market.listeners.size >= 20)
    return res.status(429).json({ error: 'Too many local connections.' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (feed: typeof market.state) => res.write(`data: ${JSON.stringify(feed)}\n\n`);
  market.listeners.add(send);
  send(market.state);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    market.listeners.delete(send);
  });
  await market.watch(symbols);
});
app.post('/api/refresh', (_req, res) => {
  void market.refresh();
  res.status(202).json({ accepted: true });
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.static(path.join(root, 'dist')));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
const server = app.listen(Number(process.env.PORT ?? 4318), host, () => {
  console.log(`Melt data service: http://${host}:${process.env.PORT ?? 4318}`);
  market.start();
});
function shutdown() {
  market.stop();
  server.close();
  server.closeAllConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
