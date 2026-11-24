# WTS health review — 1 November 2026

Production inspection found 807 indexed profiles: 597 matched, 89 withheld,
114 with insufficient evidence, two ambiguous identities, and five source
failures. No profiles were overdue at the time of inspection. Recent scheduled
runs and the incremental cursor were current. These are point-in-time results,
not a guarantee of complete WTS coverage.

The source-health summary still allowed seven hours without a successful feed
fetch, although WTS discovery now runs every ten minutes. It also did not inspect
the incremental cursor, so unrelated successful work could hide stalled discovery.

Health now reports:

- `wts_feed_stale` after 30 minutes without a successful feed fetch.
- `wts_discovery_stale` after 30 minutes without a checkpointed discovery page.
- `wts_discovery_lagging` when the completed discovery window is over one hour old,
  even if individual page checks keep succeeding.

The owner-only health endpoint, public readiness check, and scheduled
health-transition logs receive the cursor through a shared column selection.
Public status exposes only the resulting readiness state; no notification delivery or
new alert service was added. The grace periods accommodate a missed scheduled run
and the existing fifteen-minute retry. Catch-up beyond one hour is intentionally
reported as lagging rather than presented as current.

All five failing WTS pages parsed in a live read-only check. A single-film
reconciliation of Cliffhanger received HTTP 504 from Cinemeta and exhausted the
ten-second budget. This diagnoses that attempt only; it does not establish the
cause of every stored failure. Existing retries and conservative identity checks
remain in place. No production records or matching rules were changed.

Validation: `npm run check` passed, including formatting, lint, type checking,
237 tests, and the backup self-test. Regression coverage includes grace-period
boundaries, missed runs, stuck pagination, missing/invalid cursors, and recovery.
