# Independent Review and Remediation Record

Reviewed 2026-09-30. This record covers R1-R12 remediation in the new project.
The final pass was limited to the R12 CSV handler/regression and duplicate
backup-check removal; the audit was not broadened. No parent application, Git
history, `.env`, credentials, or real portfolio data was read. Only this document
was edited during verification; implementation and test files were unchanged.

**Outcome:** R1-R12 and the recorded complexity findings are remediated on the
evidence distinguished below. No actionable finding remains from this review;
the narrow final check found no new regression. This is not a guarantee of zero
bugs, and the verification limitations below still apply.

## R12 Closure

**R12 [P2]: remediated.** The [CSV timestamp guard](../src/App.tsx#L206) now emits
an empty timestamp when a quote is absent. The [parameterized export regression](../tests/review.test.ts#L171)
retains R5 coverage and adds a zero-share GOOGL position without a quote. It invokes
the actual Export handler and asserts the exact row:

```csv
"GOOGL","Alphabet","0","","0.00","0.0000",""
```

Both cases pass. The missing quote no longer throws or invents a price/time.

## R1-R11 Remediation

| ID  | Status                            | Independently inspected evidence                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Remediated                        | [Loader](../src/usePortfolio.ts#L13) preserves raw invalid data/read-error state; [effects](../src/usePortfolio.ts#L74) block seeding and writes during recovery. [Recovery export](../src/App.tsx#L947), [explicit reset](../src/App.tsx#L1013), and [confirmed import](../src/App.tsx#L1044) are wired. Three initializer probes passed; full browser lifecycle remains implementer E2E evidence. |
| R2  | Remediated                        | [REST merge](../server/market.ts#L117) retains the newer quote without refreshing its timestamp; retained regression passes.                                                                                                                                                                                                                                                                        |
| R3  | Remediated                        | [Undo](../src/domain.ts#L261) checks positive unit/price consistency, unique IDs, and cash price 1 on either side. Original regression and [new forged-cash regression](../tests/domain.test.ts#L110) pass; separate restored-state probes rejected both source-cash and destination-cash bypasses.                                                                                                 |
| R4  | Remediated                        | [Restore](../src/domain.ts#L316) canonicalizes catalog metadata; [sector accumulation](../src/App.tsx#L113) uses a null-prototype object. Regression passes.                                                                                                                                                                                                                                        |
| R5  | Remediated for reviewed path      | Canonical names and [CSV cell escaping](../src/domain.ts#L328) protect the tested import/export path. Export-handler and formula-prefix regressions pass; no spreadsheet application was executed.                                                                                                                                                                                                  |
| R6  | Remediated                        | [ALL path](../src/domain.ts#L199) removes the exact source units and retains fractional cents. Updated regression verifies zero remaining shares and conserved value.                                                                                                                                                                                                                               |
| R7  | Remediated                        | [Review](../src/components.tsx#L384) catches stale-preview errors and renders a recoverable dialog. Regression passes.                                                                                                                                                                                                                                                                              |
| R8  | Remediated                        | [Transfer](../src/domain.ts#L233) checks the 30-second lock and validates its snapshot at `reviewedAt`; [App](../src/App.tsx#L170) separately checks current feed freshness. Updated regression supplies `reviewedAt` and rejects expiration.                                                                                                                                                       |
| R9  | Remediated for allocation display | [Weights](../src/domain.ts#L162), [ticket](../src/components.tsx#L272), and [field/legend](../src/App.tsx#L398) suppress incomplete allocation claims. Regressions pass; the related R12 CSV export case is now covered by its passing regression.                                                                                                                                                  |
| R10 | Remediated by inspection          | [Startup](../server/index.ts#L8) rejects every HOST except numeric IPv4/IPv6 loopback before listening. The server entrypoint was not executed during this review.                                                                                                                                                                                                                                  |
| R11 | Remediated by inspection          | [IconButton](../src/components.tsx#L29) retains accessible names and native `title`; the custom tooltip markup/CSS is gone.                                                                                                                                                                                                                                                                         |

The unused wide-modal variant was removed. The [reduced-motion layout guard](../src/BlobField.tsx#L127)
and [per-iteration viewport bounds](../src/BlobField.tsx#L133) are present. Their
visual freeze/overlap verification belongs to the implementer's browser QA, not
to the unit checks below. Restored state is validated, not a tamper-proof ledger.

## Verification

Independent reviewer checks on the remediated snapshot:

- TypeScript `tsc --noEmit`: **passed**.
- Existing domain, market, and review suite: **45 passed**, no expected failures
  or skipped tests. All eight `it.fails` markers are removed; the regressions
  remain, including the explicit ALL and reviewedAt changes.
- Production Vite build: **passed**; only upstream Zod pure-annotation warnings.
- Additional in-memory storage initializer probes: **3 passed** (invalid version,
  malformed JSON, read exception). Effect guards and recovery actions were traced
  statically; SSR does not prove the full browser persistence lifecycle.
- Earlier independent checks exposed R3's cash-price bypass, then verified its
  fix on both cash sides. R12 is now a passing persisted export-handler regression
  included in the 45 tests. No reviewer probe changed test files.
- Closing boundary probes: both `parseBackup` and `restorePortfolio` reject
  200,001-character input with `Backup is too large`, confirming the shared size
  guard still runs before parsing after the duplicate check was removed.

Vite/Vitest used the existing config with `configLoader: "runner"` and
`envDir: false`; cache and build output were isolated below
`/tmp/melt-ponytail-review`. No package installation, server startup, real-provider
request, E2E run, or secret-scanning script was performed. The latter reads
`.env` and was intentionally excluded.

**Implementer-owned evidence:** [QA.md](QA.md) records **14 passing Chromium
browser tests**, a separately passing real-provider smoke test, and an SSE check
that received initial and renewed snapshots. The [browser suite](../tests/e2e/workspace.spec.ts)
covers storage recovery, transfer/undo, ALL, expiration, accessibility, responsive
canvas, and reduced motion. This reviewer inspected the relevant source changes
but did not rerun or independently certify those E2E, live-provider, SSE, visual,
dependency-audit, or configured-key-scan results.

Remaining verification limits include real assistive-technology behavior,
spreadsheet-specific CSV interpretation, long-running provider sequences, and
multi-tab persistence. The narrow closing pass does not expand these earlier
verification limits.

## Ponytail Attribution and Complexity Pass

Authentic [review skill](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/skills/ponytail-review/SKILL.md)
and [shared rules](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/.agents/rules/ponytail.md),
pinned to **e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156**. Upstream scripts/hooks
were not executed or installed. This complexity-only pass is separate from the
correctness/security/accounting/accessibility review; safety checks and
regression tests are not bloat.

Both recorded complexity findings are resolved: the unused wide-modal variant
and duplicate `parseBackup` length check were removed. The [shared boundary](../src/domain.ts#L317)
remains intact and its rejection behavior was independently checked. No further
complexity change is recommended within this closing scope. The skill's
conclusion below applies only to complexity, not a zero-bug or accessibility
certification.

Lean already. Ship.
