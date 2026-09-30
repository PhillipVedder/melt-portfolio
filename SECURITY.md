# Security

## Credential handling

- Keep `FINNHUB_API_KEY` only in the server's `.env` or process environment. Never use a `VITE_` prefix for a secret: Vite embeds those variables in browser code.
- `.env` files are ignored. `.env.example` contains no usable key.
- Rotate any key pasted into a shared conversation, screenshot, issue, or public repository.
- The browser receives sanitized market snapshots, not credentials. Provider errors are reduced to safe messages; raw WebSocket errors and authenticated URLs are not logged.
- `npm run security:check` checks public source files and production assets against the locally configured key. It supplements, but does not replace, GitHub secret scanning.

## Local-only threat model

The server binds to loopback by default, checks API Host and Origin, exposes no CORS headers, restricts symbols to a catalog, bounds SSE connections, shares upstream requests, and applies provider request timeouts. There is no key-management HTTP endpoint and no real trading API.

This protects against common accidental exposures; it is not authentication. Other processes on your computer can reach a loopback service. Portfolio backups and local storage are unencrypted.

## Before public deployment

Do not publish this local data service with a shared provider key. A hosted version needs authentication, per-user authorization and quotas, secure secret provisioning, HTTPS, deployment-specific origin validation, broader abuse protection, observability with redaction, and an appropriate market-data license. Static GitHub Pages hosting cannot run the Node data adapter. Keep these constraints visible in any hosted demo.

## Reporting a vulnerability

Do not include keys or private portfolio data in an issue. Use [GitHub's private vulnerability reporting](https://github.com/PhillipVedder/melt-portfolio/security/advisories/new), which is enabled for this repository. Never claim a vulnerability is fixed until the relevant regression checks pass.
