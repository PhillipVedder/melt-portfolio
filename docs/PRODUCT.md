# Product brief

**Melt** stands for **Market Exposure & Learning Tool**. The short name remains the visible product brand; the expansion explains its educational purpose without implying liquidity analysis or real-money execution.

Melt is a clean-room implementation of a user's idea: make portfolio allocation tangible by representing positions as slime, then move mass between them to reallocate virtual dollars.

## Audience and principles

- Curious retail investors need a low-risk space to understand concentration and allocation.
- Finance-literate users need exact values, quote provenance, timestamps, fractional units, and an audit trail alongside the playful representation.
- Portfolio size is encoded by area, never radius. Asset identity uses stable colors; signed text conveys market direction independently.
- No brokerage connection, real-money order routing, recommendation engine, invented returns, or made-up live prices.
- Pointer gestures stage a transfer; explicit confirmation commits it. Every canvas workflow has a normal form alternative.
- A disconnected feed and a closed market are different states. Keep timestamps visible and do not label a socket connection as a fresh quote.

## Release scope

1. A $25,000 virtual starter portfolio funded at actual quotes; no initialization until all starter prices are valid.
2. A responsive allocation canvas with organic motion, pointer-to-pointer transfer staging, and reduced-motion support.
3. An exact-dollar transfer ticket, preview of weights and units, a transaction journal, and unit-preserving undo.
4. Holdings, concentration, and explicit price-shock scenarios, separate from the live portfolio.
5. Add/remove positions, local persistence, portable validated JSON backups, and CSV holdings export.
6. A server-side Finnhub adapter, shared polling/cache, one upstream stream, and sanitized error states.
7. Unit/integration/browser tests, CI, architectural tradeoffs, security guidance, and screenshots.

## Non-goals

No authentication, public hosted shared-key service, tax lots, dividends, splits, historical backtesting, multi-currency accounting, short selling, or guaranteed executions. These are deliberate boundaries, not hidden capabilities.
