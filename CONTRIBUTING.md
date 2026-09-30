# Contributing

Use Node.js 22.18 or newer. Install with `npm ci`. The normal build and deterministic tests do not need a Finnhub account.

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

## Change checklist

- Keep financial operations pure and test invalid inputs as well as the happy path.
- Preserve value conservation at execution prices, nonnegative holdings, and reversible unit deltas.
- Do not fabricate quotes to hide outages. Expose data timestamps and honest errors.
- Never commit `.env`, keys, user backups, test traces with private data, or `node_modules`.
- Keep mouse interactions available through ordinary keyboard/touch controls.
- Check desktop, tablet, and narrow mobile layouts and `prefers-reduced-motion`.
- Add an automated regression test for every reproduced bug.
- Update docs when a product assumption or security boundary changes.

Open a focused pull request describing the problem, approach, verification, and known tradeoffs. Avoid unrelated formatting churn and speculative abstractions. AI-assisted changes are welcome when their behavior is understood and verified; do not substitute generated assertions for evidence.
