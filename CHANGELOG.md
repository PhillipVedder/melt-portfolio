# Changelog

## 1.0.0 - 2026-09-30

First public portfolio release of Melt.

### Included

- Four connected workspaces: proportional slime sandbox, holdings, price-shock scenarios, and transfer activity.
- Drag and keyboard transfer staging with exact-dollar review, expiring price locks, fractional shares, and unit-preserving undo.
- Real Finnhub quotes through a server-side REST/WebSocket adapter and same-origin event stream. Credentials never enter the browser bundle.
- Decimal accounting, validated local persistence, portable JSON backups, and CSV exports.
- Responsive controls, reduced-motion support, and keyboard-accessible alternatives to canvas interactions.
- Actual application screenshots, architecture and product notes, an independent Ponytail-assisted review record, and contributor/security guidance.

### Verification

- 45 unit/provider/regression tests and 14 deterministic Chromium browser tests.
- Strict TypeScript, production build, formatting, and clean-runner GitHub Actions checks passed.
- Accessibility, viewport overflow, and canvas-pixel checks included in the browser suite.
- Local configured-key scan passed; dependency audit reported no known vulnerabilities at release verification.

See the [verification record](docs/QA.md) for evidence and the scope of testing.

### Boundaries

This is a local-only, virtual-money application, not a brokerage or investment-advice service. A personal Finnhub key is required to run the market feed. No public shared-key demo is hosted. Fees, taxes, corporate actions, historical backtests, and multi-tab transaction coordination are outside this release. Automated browser coverage is Chromium; full assistive-technology and physical-device testing remain outstanding.
