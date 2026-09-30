# Architecture and accounting

## System boundaries

The browser owns virtual positions, preferences for the current session, transfer events, and backups. The Node process owns the provider key and market connection. There is no brokerage client, order router, user database, remote portfolio storage, or analytics.

The data adapter accepts a fixed catalog of twelve USD stocks. It maintains one WebSocket to Finnhub, polls wanted symbols at sixty-second intervals, and fans out snapshots using server-sent events. A browser disconnect does not lose portfolio state. Timeout and provider errors retain the last valid quotes; stale quotes remain viewable but cannot fund affected transfers.

`tradeAt` is the event timestamp from the provider. `receivedAt` is the last successful confirmation. A recent REST response can legitimately contain an old last-trade time, such as after the market closes. Market status is provider-reported, never inferred from a weekday-only schedule.

## Financial invariants

For a transfer of dollars `d` at reviewed prices `p_from` and `p_to`:

```text
source units removed = d / p_from
target units added   = d / p_to
cash price           = 1 USD
```

At those prices, total portfolio value is conserved. Amounts must be positive, finite decimal dollars with at most two fractional digits; sources and destinations must differ; sufficient source units and usable quotes are required. Cash transfers do not bypass destination quote validation. These checks live in the domain layer, not just UI button state.

Decimal precision is 32 significant digits. Share quantities and cash are serialized as decimal strings. A tiny arithmetic residue below 1e-24 units is normalized to zero. Ordinary typed amounts use two-decimal dollars; the explicit Max path transfers every source unit and accounts for fractional cents exactly. The review displays the full-position value to eight decimal places. Residual value is not silently discarded.

### Quote lock

Review takes an immutable copy of displayed prices for a thirty-second sandbox quote lock. Confirmation validates current feed usability and the lock's age, then executes against the displayed review prices. This is a virtual accounting convention, **not** a claim that a broker would execute those prices. Portfolio value measured against newer quotes can differ slightly immediately after a locked-price transfer.

### Undo

Each event records source/target unit deltas and execution prices. Undo subtracts the received units and restores the surrendered units in reverse chronological order. It does not trade at today's price, restore an old market snapshot, or create a cash top-up. Events remain in the journal marked inactive. The last 100 journal events are retained.

### Returns and scenarios

The headline since-start figure is `(current marked value - 25000) / 25000`. There are no external contributions or withdrawals in this release. It is not a time-weighted or money-weighted return metric. Day-change percentages are per-security quote changes. Scenario values multiply position values by user-entered price shocks; cash is exempt, and underlying positions do not change.

## Visualization

One common scale converts dollars to area: `radius = sqrt(value * scale / pi)`. Small sine deformations change the perimeter organically; they are not independent fake price movement. Colors are stable asset identities. Signed numerical quote changes convey market movement without making users remember a changing color-to-stock mapping.

D3-force supplies collision and positional relaxation. Canvas handles fills and highlights. React does not update on every animation frame. A `ResizeObserver` keeps backing resolution aligned with the viewport at a capped device-pixel ratio. Native labeled controls, a holdings table, and an activity table provide alternatives to the graphical interaction.

## Storage and trust

The local storage key is `melt.portfolio.v1`, isolated from other projects. Zod validates portfolio schemas. Invalid persisted data is preserved for recovery and blocks automatic writes until an explicit reset or import. JSON imports are bounded in size, validated, restricted to supported symbols, and confirmed before replacing state. Catalog metadata is canonicalized rather than trusted. Imported undo deltas are disabled; locally restored journal entries must satisfy amount/unit/price consistency checks before undo. Browser storage is not a tamper-proof ledger and multi-tab edits are not transactionally coordinated.

Portfolio data is device-local and not encrypted. Do not use it for confidential brokerage records. The key is server-only and excluded by `.gitignore`. No key, provider URL containing the key, or raw provider exception is returned to the client.

## Why not more infrastructure?

This release has one local user, a bounded symbol set, and a small document-shaped portfolio. Adding account authentication, SQL migrations, a trading service, or a global state framework would increase operational burden without satisfying an existing requirement. Public multi-user deployment is a different product boundary, not a switch to flip on this local server.
