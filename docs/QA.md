# Verification Record

Verified locally on September 30, 2026. This is evidence of tested behavior, not a guarantee that the application has no bugs.

The [first public GitHub Actions run](https://github.com/PhillipVedder/melt-portfolio/actions/runs/36673782964) also passed on September 30, 2026, using a clean Ubuntu runner and Node.js 22. It verified installation from the lockfile, typecheck, production build, 45 unit/provider tests, formatting, and 14 deterministic Chromium tests. The live-provider test was intentionally skipped; no Finnhub secret was supplied to CI.

## Automated Checks

| Check                                                     | Result                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| TypeScript strict typecheck and Vite production build     | Passed                                                                |
| Domain, provider, and independent-review regression tests | 45 passed; no expected-failure markers                                |
| Deterministic Chromium browser suite                      | 14 passed                                                             |
| Real-provider smoke test                                  | Passed separately, with the configured Finnhub account                |
| Axe WCAG 2 A/AA and 2.1 AA checks                         | No automated violations on Sandbox, Holdings, Scenarios, and Activity |
| Viewport overflow and canvas painted-pixel checks         | Passed at 1440, 820, 390, and 320 CSS pixels wide                     |
| Reduced-motion pixel stability                            | Passed                                                                |
| Dependency audit                                          | 0 known vulnerabilities at verification time                          |
| Configured-key scan                                       | Key absent from public source and production assets                   |
| Prettier check                                            | Passed                                                                |

The optional live test is skipped in the default suite and CI, deliberately. It requires provider access and is run explicitly when refreshing documentation screenshots. The deterministic tests use synthetic fixtures inside the test runner only; no fake-price mode ships in the app.

## User Flows Exercised

- Exact cash-to-stock transfers, confirmation, cancellation, reload persistence, journal display, and unit-preserving undo.
- Stock-to-stock pointer drag and Space staging without immediate execution.
- Invalid/overdrawn amounts, same-asset transfers, missing and stale quotes, invalid symbols, and 30-second lock expiry.
- Full-position Max transfers, including the domain regression for fractional-cent values.
- Stock search/add, reset confirmation, CSV download, invalid backup rejection, and valid backup replacement.
- Corrupt persisted JSON preservation with explicit recovery/reset, and unavailable-storage handling.
- Scenarios that change hypothetical value without changing real holdings; reset of shocks.
- Keyboard modal dismissal and focus restoration.
- Desktop, tablet, and mobile screenshots, visible canvas content, and no horizontal page overflow.

## Real-Data and Visual Checks

The local Finnhub service returned quotes for all five starter stocks. The UI displayed the provider-reported market session separately from the stream connection. A sustained SSE check received both an initial snapshot and a later refreshed snapshot; no API key was exposed in that output.

The sandbox, holdings, scenarios, transfer preview, and narrow mobile layout were captured from the real-provider app. The images in `docs/images` are snapshots, not current quote claims. Mobile scene inspection revealed that clamping only after a collision solve could overlap two paused blobs; the solver now applies viewport bounds at every relaxation step. The final mobile screenshot was checked again.

## Independent Review

A separate sub-agent used the authentic, commit-pinned Ponytail review skill plus a distinct correctness/security/accounting audit. It reproduced eight issues with regression tests and identified additional storage, server-boundary, and accessibility issues. Those fixes and the independent recheck are recorded in [REVIEW.md](REVIEW.md).

## Known Limits

- Automated browser coverage is Chromium. The in-app browser was also inspected; Firefox, Safari, real iOS/Android hardware, and assistive-technology user testing are not claimed.
- Axe checks do not certify full WCAG compliance. Manual screen-reader testing remains outstanding.
- Long-running upstream outages, exchange event timing, rare message sequences, and all possible corporate actions are not exhaustively tested.
- Corporate actions, multi-currency portfolios, fees, taxes, real executions, and multi-tab transactional consistency are outside this release's scope.
- The upstream Zod package emits harmless pure-annotation warnings during the production build; compilation completes successfully.
