# Backend request efficiency

Implements the first three backend recommendations for the owner-and-friends scope. The consistency audit cadence and optional indexes remain unchanged.

## Account requests

Existing accounts initialize with one projected read. A missing account uses an insert-if-absent followed by a read, preserving a concurrent creator's calendar token and preferences. Saves and removals no longer perform the two account preflight requests. The existing library trigger recovers a missing account atomically on insert/update, preserves row security, and retains the auth deletion exception. Deletion never recreates an account. Settings use one owner-scoped upsert; existing calendar tokens remain unchanged.

## Concurrent searches

Searches with the same normalized cache key share provider work within a server instance. If another instance owns the existing Redis lease, a caller polls for the cached result with a three-second waiting budget, then returns the existing retryable failure if the result is still unavailable. Individual Redis calls retain their infrastructure timeout. Empty successful results are shared too. Failed work is removed from the in-process map so later attempts can retry. Personal membership is attached separately for each caller after shared provider work.

## Background reads and matching cache

The worker starts with projected scheduling fields. It loads catalogue/feed snapshots only if it reaches their processing phase and reuses that payload within the run. Runs which reach discovery still fetch the payload; this does not eliminate those reads. Matching identities are loaded only when a due batch or catalogue enrichment needs them.

Matching identities are cached for one hour under a key containing both the matching-rule version and a database version. A statement trigger changes that version atomically whenever candidate evidence is inserted, updated, deleted or truncated, including writes from old deployments or manual reviews. Each lookup reads the small version field before accessing Redis. A cache fill rechecks the version after pagination, discarding a changed snapshot and retrying once. Cached mappings cannot survive a committed revocation under the new version. Existing identity validation and seed override rules remain intact. Legacy cache invalidation is retained for older builds.

## Release order and verification

Apply `20261030160244_backend_read_efficiency.sql` before deploying the application. This migration adds one version column and updates/adds private invoker triggers without widening permissions. It does not change existing feed tokens, film identities, or event UIDs. The migration is prepared locally and has not been applied to production.

`npm run check` passes formatting, lint, TypeScript, all 234 unit/database tests, and the backup self-test. The new tests exercise concurrent search sharing, bounded waiting, empty results, cache revocation and fill races, request counts, lazy payload loading, account recovery, token preservation, ownership checks, and auth deletion cascades in disposable Postgres.

The isolated production build and five focused browser scenarios pass: library search/save/remove/Undo, calendar preference persistence and feed content, Redis failure/recovery, account export/reset/deletion, and slow detail refresh recovery. Tests use disposable fixtures and do not send email or modify production data.
