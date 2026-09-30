# Publishing Checklist

Melt is maintained in its own public repository: [PhillipVedder/melt-portfolio](https://github.com/PhillipVedder/melt-portfolio). It contains only this implementation, not source or assets from the earlier application. Public source availability does not imply a hosted trading service or live demo.

## Repository Presentation

Repository name: `melt-portfolio`

Description: `Melt (Market Exposure & Learning Tool): a visual portfolio sandbox with real stock quotes, proportional slime, and precise virtual transfers.`

Topics: `react`, `typescript`, `fintech`, `portfolio-visualization`, `canvas`, `finnhub`, `playwright`, `data-visualization`.

Pin this repository on the profile. The README's first screenshot is a useful social-preview source. Do not imply this paper-trading project manages real assets or provides investment advice.

## Before a Release

1. Rotate any API key previously shared in a conversation or elsewhere; keep the replacement only in `.env`.
2. Run `npm run check`, `npm run test:e2e`, `npm run format:check`, `npm run security:check`, and `npm audit`.
3. Run `git status --short --ignored` and confirm `.env`, `node_modules`, built assets, and local browser reports are ignored.
4. Inspect the staged diff. Do not add user backups or credentials.
5. Commit and push to the existing repository. Create a versioned release only after its commit passes CI; describe both functionality and limitations.
6. Verify GitHub Actions and the rendered README. Keep secret scanning, push protection, and private vulnerability reporting enabled where available.
7. Keep the README honest about the local-only data service. A public live demo requires a separate authenticated, licensed hosting design, not just a static Pages deployment.

The CI workflow needs no Finnhub secrets. Its browser suite uses isolated test fixtures. Real-provider smoke tests are opt-in and should not be added to public pull-request jobs with a shared key.
