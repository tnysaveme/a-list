# A-List operations and recovery

## Authoritative tools

Production is Next.js on Vercel with Supabase/Postgres. Use Node 24 and the committed npm lockfile. `db/schema.ts` contains TypeScript row contracts, not a Drizzle schema. The authoritative database history is `supabase/migrations/`.

`vite.config.ts`, `worker/`, `.openai/`, connector-preview helpers and the SQLite files in `drizzle/` are retained Sites/Vinext/Cloudflare scaffolding. They are not the supported production runtime and are not evidence that an alternate deployment works. The unusable root SQLite config was quarantined as `drizzle/historical/drizzle.config.ts.disabled`; do not apply those SQLite snapshots to Supabase. Do not remove retained preview files without checking the workflow that owns them.

## Configuration

Run `npm run config:check` locally. It reads `.env.local` and prints missing setting names, never values. Configure Development and Preview independently; avoid pointing disposable integration tests at production.

| Capability                                                     | Required configuration                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Render authenticated pages                                     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the intended email-access settings |
| Sign-in throttling, normal library APIs and secret feeds       | The above plus `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALIST_KEY_SALT`                      |
| Complete search/detail refresh, discovery and account deletion | The above plus server-only `SUPABASE_SERVICE_ROLE_KEY`                                                     |
| Signed background refresh                                      | The above plus `ALIST_APP_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`                    |
| Optional automatic imports                                     | `ALIST_WTS_AUTO_IMPORT=true`; false pauses new identity imports                                            |

`ALIST_ALLOWED_EMAIL` and `ALIST_ALLOWED_EMAILS` define private-mode membership. `ALIST_ALLOW_SIGNUPS=true` deliberately permits new verified-email members and requires working SMTP. Production `ALIST_APP_URL` must be the canonical app origin so origin validation and signed-job verification agree. Credentials belong in private provider configuration; never put service credentials into `NEXT_PUBLIC_*` variables.

Missing configuration produces names-only server diagnostics and retryable unavailable responses. Authentication-provider outages use the page's retry boundary; invalid or expired sessions still require sign-in.

## Release sequence

Migration history was reconciled on October 30, 2026: seven local filenames were aligned with the versions already recorded in production after confirming their SQL text matched exactly. No production history was edited and no historical SQL was replayed. See [the reconciliation record](review-improvements-2026-10-30.md).

Read-only verification on November 2 confirmed that `20261030115759_available_releases_newest_first.sql` and `20261102102245_library_week_summary.sql` are already applied. The readiness migration `20261102211042_pilot_readiness.sql` was applied through the connected Supabase service on November 2 at 21:10 UTC. The new worker and catalogue reader require its columns and RPCs. The migration is additive and leaves existing RPCs available for application rollback. The prior CLI dry run listed only the locally generated readiness migration. The connector assigned timestamp `20261102211042`; its recorded SQL MD5 exactly matched the tested file (`158c793b581ba0e4120c992044c4e026`), so the local filename was aligned without changing its SQL.

For future migrations, generate the local file with the CLI, test it, and apply that same version through the CLI. Check migration history before and after the release. If a migration is applied through a tool that assigns its own timestamp, retrieve the recorded version and compare its SQL before aligning the local filename; never mark differing SQL as equivalent based on its name alone.

1. Run `npm ci`, `npm run check`, `npm run build`, and `npm run test:e2e`. For the first browser run, install Chromium with `npx playwright install chromium` (`--with-deps` on CI Linux).
2. Verify the target project and migration history. This checkout's A-List project is `xuxshqjckbrvxiwzclfi`. Inspect the current CLI's help before migration commands; use a dry run against the intended linked project before applying changes.
3. `20261026183555_release_consistency.sql` was applied to A-List production on October 26 at 18:35 UTC and verified through the Supabase connection. Apply it **before** deploying the matching application to any other database. It replaces library ordering/calendar selection and adds the service-only, row-version-guarded `a_list_withdraw_release_windows` function. No personal rows need editing for this rollout.
4. Deploy the tested source and lockfile through the existing release process. Include new tests and workflows in the commit. A local working tree or successful test build is not a deployment.
5. Verify public sign-in/API boundaries, signed-in save/remove/Undo, calendar opt-out, anonymous feed access, stable UIDs and token reset using disposable fixtures. The existing public smoke test sends no emails; its optional authenticated mode must use an appropriate test account.
6. Confirm the scheduled refresh completes and inspect `/api/health` as the owner. Run `npm run health:check` after the new `/api/status` route is deployed.

The migration is additive/backward-compatible at the schema boundary: the existing library RPC signature remains, its JSON includes an additional `upcomingRelease`, and the new withdrawal RPC is service-only. On an application rollback, leave the additive function in place. Do not remove columns/functions or reset the database to roll back an app build. An older app may still contain the old source-loss behaviours; pausing automatic imports does not pause ordinary saved-film refreshes. Use the provider's supported schedule pause control if incident containment requires stopping the worker, then restore it deliberately after repair.

## Verification isolation

The Watched library migration `20261104123804_watched_library.sql` was applied on November 4 after isolated database and browser verification. It adds account-owned watched timestamps and excludes watched films from calendar tracking and To Watch queries. Its recorded SQL MD5 matches the tested file. Apply it before deploying this feature to another database; leave the additive column and trigger in place on an application rollback. See [the Watched release record](watched-library-2026-11-04.md).

- `npm test` strips provider credentials and rejects unmocked network requests. Database tests apply migrations to disposable in-memory Postgres.
- `npm run test:e2e` copies an explicit source allowlist into a disposable directory and creates a separate `.next-e2e` production build there, so Next cannot auto-load the checkout’s `.env.local`, starts loopback provider fixtures and exercises the real app/API handlers. The child environment is a fixed allowlist with fake keys; application code has no authentication bypass. Unmocked external source requests are blocked by a test-process-only fetch adapter.
- Browser tests cover pagination/search/save/remove/Undo, calendar preferences and actual feed content, malformed writes, out-of-order filter responses, Redis failure/recovery, expired sessions, auth outages, disposable export/reset/deletion and bounded slow-source refresh.
- Browser storage, generated builds, traces, test output and recovery files are ignored by Git and excluded from Vercel uploads. No real credentials or account exports are published as CI artifacts.
- `node scripts/backup.mjs self-test` verifies the application restore path using synthetic rows. A restore drill never targets a remote database.

## Availability policy

Redis throttling **fails closed** for sign-in, personal APIs, public readiness and secret feeds. Cache availability must not silently remove authentication or abuse controls. Failures return 503 with a retry interval. Redis requests use a fresh 2.5-second abort signal per request with the existing bounded retry. Token-checked lease cleanup is best-effort: its failure is logged without replacing a successful committed result or the original work error.

Catalogue refreshes preserve known membership and newer metadata on client fallback, and retain a last-good shared catalogue when hydration fails. Shared rebuilds coalesce within each server process. This is not a distributed cache-stampede guarantee; measure multi-instance traffic before adding more coordination.

Movie details wait up to 1.5 seconds for refresh work after their initial stored-record read. When that wait expires, last-good details return with `refreshPending`; the registered Next `after` work continues under its lease. The open details dialog polls the cached result instead of starting another provider request. Closing the dialog cancels browser polling, not an already committing server update. Provider and function deadlines still bound background work.

## Monitoring: logs only

The owner requested **structured logs only**, without email, webhook or chat alerts.

Read-only verification on October 26 found the existing EU QStash schedule `alist-source-refresh` active every ten minutes, pointed at `/api/jobs/refresh`, with a recent successful delivery. Supabase source status also showed a recent successful job and zero failures. No scheduler settings were changed.

The refresh job records `source_health_degraded` and `source_health_recovered` when the issue set changes. It does not repeatedly log an unchanged transition while the shared state is available. Diagnostic write failures are distinct from upstream failures and cannot discard successful movie updates.

`/api/health` remains owner-only and contains detailed diagnostics. New public `/api/status` exposes only `healthy`, `degraded` or `unavailable`, with no library/account data, feed tokens or per-source diagnostics. The logs-only GitHub workflow polls it every 15 minutes after that workflow reaches the default branch; degraded readiness records an event without deliberately failing the CI job or sending a health notification. GitHub's scheduler is best effort and cannot establish an availability SLA.

Current staleness thresholds are one hour for successful refresh jobs, eight hours for the catalogue, 30 minutes for WTS feed/discovery checks, and one hour for the WTS change cursor to catch up. A source explicitly marked failed degrades immediately. With the 15-minute external poll, a missed-job condition can take up to approximately 75 minutes from the last success to appear in those logs. Provider HTTP/network failures may make an external check record unavailable sooner.

Useful log events include `film_source_failed`, `source_health_write_failed`, `lease_cleanup_failed`, `rate_limit_unavailable`, `configuration_missing`, `detail_refresh_deferred` and the health transitions. Logs omit private feed URLs and credential values.

## Source recovery

1. Inspect owner health for failed/stale sources and affected film IDs. Preserve last-good dates while evidence is unavailable.
2. Use `npm run sources:check -- --limit 30` for a bounded dry check; `--saved` selects saved films. Inspect parser evidence before choosing `--repair`. Repairs change shared movie evidence and require the intended environment.
3. Use `ALIST_WTS_AUTO_IMPORT=false` to pause new identity imports if needed. This does not stop established date refreshes.
4. A missing canonical tag, missing credit, unavailable page or missing release field is uncertainty, not proof of withdrawal. Only positive conflicting identity or an explicit affected-window withdrawal can remove dates.
5. After repair, verify retained/changed UIDs and calendar-content revisions. Title lookup keys use v14 plus the indexed source revision and saved status. A changed indexed profile resets alias retry times and misses; saving a film bypasses an older unsaved negative cache. Old unsaved negatives back off to two, four and seven days; saved/current-year/recent-release films remain daily. Transport failures start at ten minutes and back off to six hours; persistent format failures start at one hour and back off to one day for saved films or seven days for unsaved films. Durable per-film state survives cache loss.

The November 12 WTS parser accepts explicit `N/A`/`not applicable` and split TBA/TBD markers as undated windows, and tolerates a period in place of the date's comma. Calendar validity checks still reject impossible days. Successful WTS rechecks clear only recovered WTS issues, preserving unrelated source failures. Missing or conflicting identity evidence stays unresolved without invalidating last-good dates or being mislabeled as WTS transport failure. Real HTTP, timeout and malformed-response failures retain their failure/retry behavior. Structured lookup diagnostics contain film IDs, stages and categories without raw errors or private URLs. See [the reliability record](wts-reliability-2026-11-12.md).

An opt-in live calendar check uses one disposable account and existing verified WTS films, sends no email, and cleans up the account and library in `finally`. After those sourced films are repaired, run `ALIST_RUN_WTS_CALENDAR_TEST=true ALIST_BASE_URL=https://a-list-nine.vercel.app node tests/wts-calendar-integration.mjs`. It checks anonymous subscription access, conditional refresh, stable legacy UIDs, 13:00 UTC alarms, watched/unwatched recovery, removals and the unchanged feed link. It never imports a session into the owner's browser or resets an existing account's calendar URL.

## Backups and restore drills

The read-only Supabase backup response on November 2 again reported `pitr_enabled=false` and `backups=null`; no physical recovery point was listed. This does not verify any separate off-platform backup. The owner chose **backup tooling only**, so no production rows were exported and no billing/backup-plan settings were changed.

`npm run backup:create` is an explicit operator action. It reads application tables using the server-only service key, checks account/movie version manifests around the export, retries if core data changes, verifies the rows in disposable in-memory Postgres, then writes an AES-256-GCM-encrypted snapshot into ignored `outputs/recovery/`. The directory and key/file modes are restrictive. It prints table counts, never row contents. Treat `recovery.key` as a credential: preserve it securely and separately from copies of the encrypted snapshot. Losing the key makes those snapshots unrecoverable.

`npm run backup:verify -- <filename.alist>` decrypts that local snapshot and repeats the disposable restore drill. It has no production restore mode. `node scripts/backup.mjs self-test` exercises the same restore loader with synthetic data and no service credentials.

These are **application-row backups**, not complete Supabase disaster-recovery backups. They omit Supabase Auth identities/settings, sessions, provider configuration and storage. The drill creates synthetic Auth IDs only to verify application foreign keys; it does not prove real sign-in recovery. Core application consistency is guarded with account/movie manifests, but the REST export is not a serializable database-wide snapshot of every auxiliary table. Full project recovery requires an independently verified provider backup/export arrangement. Restoring actual application rows must preserve or deliberately remap the corresponding real Auth IDs, and should first be tested in a separate non-production project.

A future recovery exercise should restore the chosen provider backup into a disposable target, verify real sign-in and account isolation, compare library/feed contents, confirm that old compromised calendar links are rotated when appropriate, and record recovery duration and recoverable timestamp. Do not run a destructive restore against production to test the runbook.

## Performance evidence

`npm run benchmark` writes local CPU, payload, rebuild-coalescing and controlled-delay measurements to `docs/measurements/implementation-2026-10-26.json`. `scripts/benchmark-providers.ts` performs eight read-only provider searches using fixed public titles and records first/repeated source latency separately. It does not measure Redis hits, production API latency or user concurrency.

The present catalogue needs no database pagination rewrite based on the CPU results alone. Hydration batch counts in the report are estimates from the 200-ID batch size, not measured production query latency. Cold database costs and multi-instance request p50/p95 remain post-deployment measurements; existing structured API duration logs provide a starting point. Keep the 1.5-second provider-wait budget verified by the slow-source browser test.

## November 2 readiness implementation

See [the implementation record](public-readiness-implementation-2026-11-02.md) for all fourteen audit items and the exact validation results. Enrollment remains open to verified-email users, as requested. No invitation allowlist, billing change or backup export was introduced. The migration and application release are deployed. The owner-approved London deployment `dpl_7Rso1SAHHgCHd8LTqg5qSMx4wkeC` is live; see the implementation record for verification.

The worker polls the WTS index/feed first, reserves a saved-film phase through 19 seconds, WTS verification through 33 seconds with checkpoint room, catalogue work through 39 seconds, and missing-window lookups through 42.5 seconds. Local timeouts leave unstarted work due. Inventory checkpoints distinguish local budget/database errors from provider failures. `ingestion_finished.stages` records phase durations; owner-only health adds queue counts, oldest due timestamps and the latest structured WTS diagnostics. Counts describe rows, so verified aliases may appear separately in queue-health totals even though lookup work is deduplicated.

Catalogue cards use a versioned Redis cache with a shared fill lease. Database triggers change its revision on canonical card or listing changes, including writes by older deployed workers. The database returns one compact joined snapshot; personal membership is attached afterward. Archive partitions retain their last successful timestamp and films during outages. Older partitions are reused for up to 48 hours, while current and recent listings are fetched each catalogue cycle.

Before inviting friends, finish the live release sequence and the device acceptance check. The single authorized test sign-in email was sent at 21:20 UTC on November 2 to `tyyebuah@gmail.com`. Resend reported delivery, and the owner confirmed that sign-in and calendar subscription work on their device. Do not send another test email without a new request. Browser fixtures cover these flows, but cannot establish actual mail delivery or calendar-client polling. Public Auth settings were rechecked on November 2: signup enabled, email authentication enabled, automatic confirmation disabled. Resend reports its sending domains verified. Hosted SMTP quotas were not re-read: a CLI configuration read was cancelled after a keychain-access prompt. Keep the existing configured limits until verified through an approved connection; the owner health response's `authEmailsPerHour: 30` is an application assumption, not a live provider query.

The [November 13 efficiency and recovery changes](wts-efficiency-and-recovery-2026-11-13.md) move provider work fully behind stored-detail responses, retain per-film failure state, separate source retries from whole-job failures, exclude hyphenated TV mini-series subjects, and add bounded on-demand source history and offline timing summaries.
