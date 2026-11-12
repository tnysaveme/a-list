# Backend request efficiency

Implements the first four backend recommendations for the owner-and-friends scope. Optional indexes remain unchanged.

## Account requests

Existing accounts initialize with one projected read. A missing account uses an insert-if-absent followed by a read, preserving a concurrent creator's calendar token and preferences. Saves and removals no longer perform the two account preflight requests. The existing library trigger recovers a missing account atomically on insert/update, preserves row security, and retains the auth deletion exception. Deletion never recreates an account. Settings use one owner-scoped upsert; existing calendar tokens remain unchanged.

## Concurrent searches

Searches with the same normalized cache key share provider work within a server instance. If another instance owns the existing Redis lease, a caller polls for the cached result with a three-second waiting budget, then returns the existing retryable failure if the result is still unavailable. Individual Redis calls retain their infrastructure timeout. Empty successful results are shared too. Failed work is removed from the in-process map so later attempts can retry. Personal membership is attached separately for each caller after shared provider work.

## Background reads and matching cache

The worker starts with projected scheduling fields. It loads catalogue/feed snapshots only if it reaches their processing phase and reuses that payload within the run. Runs which reach discovery still fetch the payload; this does not eliminate those reads. Matching identities are loaded only when a due batch or catalogue enrichment needs them.

Matching identities are cached for one hour under a key containing both the matching-rule version and a database version. A statement trigger changes that version atomically whenever candidate evidence is inserted, updated, deleted or truncated, including writes from old deployments or manual reviews. Each lookup reads the small version field before accessing Redis. A cache fill rechecks the version after pagination, discarding a changed snapshot and retrying once. Cached mappings cannot survive a committed revocation under the new version. Existing identity validation and seed override rules remain intact. Legacy cache invalidation is retained for older builds.

## Release order and verification

The scheduled consistency audit now uses the existing `wts_coverage.checkedAt` success checkpoint. It runs on the first worker pass at least one hour after the previous successful audit (normally about 60–70 minutes, depending on scheduler timing). Missing, invalid or future checkpoints are immediately due. Failed audit transactions do not update that checkpoint, so the next ten-minute pass retries. Skipping the audit makes no audit RPC and does not skip normal film refreshes, discovery, or queued repairs. Manual audit calls remain available. No additional migration, cache, scheduler, or evidence-change trigger is needed for this cadence change.

Migration `20261030160244_backend_read_efficiency.sql` was applied to production on 30 October 2026 before the application release. This migration adds one version column and updates/adds private invoker triggers without widening permissions. It does not change existing feed tokens, film identities, or event UIDs. Production verification confirmed the version column, enabled trigger, invoker execution, empty search paths, and denied anonymous function access. The application release includes implementation commit `f8fc11b`; Vercel records the deployed commit and build status.

`npm run check` passes formatting, lint, TypeScript, all 234 unit/database tests, and the backup self-test. The new tests exercise concurrent search sharing, bounded waiting, empty results, cache revocation and fill races, request counts, lazy payload loading, account recovery, token preservation, ownership checks, and auth deletion cascades in disposable Postgres.

The subsequent hourly-audit change passes the same checks with 236 tests. Added cases cover the hour boundary, unusable checkpoints, skipped RPCs across ten-minute passes, failed-audit retries, and resuming the hourly interval after success.

The isolated production build and five focused browser scenarios pass: library search/save/remove/Undo, calendar preference persistence and feed content, Redis failure/recovery, account export/reset/deletion, and slow detail refresh recovery. Tests use disposable fixtures and do not send email or modify production data.
