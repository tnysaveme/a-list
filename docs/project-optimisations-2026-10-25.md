# Project optimisations — 2026-10-25

The six audit items were addressed sequentially in the existing working tree. At the user's request, the three database migrations were subsequently applied to the linked production A-List Supabase project and the application was deployed to Vercel production on 2026-10-25.

1. Catalogue ingestion retains each record's original `updated_at`. The service-only `a_list_publish_catalogue_versioned` function writes only when that version still matches, retains concurrent inserts, and returns the canonical records used for the stored catalogue and Redis cache. The legacy publisher can add records but cannot replace existing ones during rollout. An isolated Postgres regression exercises stale writes, concurrent inserts, successful enrichment, cache/snapshot consistency, validation and function permissions.
2. Search inserts omit `requested_at`. Saving still makes a film due through library membership; opening details can explicitly request a refresh. Due saved films sort ahead of one-off requests. Existing requests are retained because old search requests cannot safely be distinguished from genuine detail requests.
3. Discover's authenticated API returns 25 cards per page with global sort/filter counts and `nextOffset`. Cards omit synopsis metadata; opening details loads the full record. Search also queries the entire shared catalogue, so unloaded cards remain findable and known catalogue matches survive upstream failure. The client lazily loads the bundled snapshot only after API failure and paginates it using the same helper. Canonical movie lookups use 200-ID batches to keep result sets and URL lengths bounded.
4. A private trigger maintains `a_list_movies.calendar_updated_at` only when verified calendar fields change. The token-authorized feed state hashes these content timestamps. Returned feed movies carry `calendarUpdatedAt`, and ICS output no longer embeds mutable source-check timestamps. A new cache namespace includes the calendar format revision. Tests verify stable state and ETags across identical publication and metadata/source-check changes, and changed state, ETags and alarm dates after an actual release-date change. Library revisions, token authorization, rumor settings and legacy event UIDs remain intact.
5. Browser focus, visibility and timer events share an in-flight refresh and a 60-second freshness window. Only the active Discover/library view refreshes. Pending requests are cancelled when their view changes. The gate's tests cover duplicate events, successful freshness windows and retry after failure.
6. Removed 61 unused UI components, the unused mobile hook and class-name helper, their generator configuration and vendored stylesheet/license. The optional connector-error component now uses a native link. Removed 17 production dependencies and one development dependency, pruning 62 installed packages and 232,171 bytes of scaffold files. Registered Sites/connector preview files, configuration and tests were retained, including Zod and the actively used Radix menu.

## Payload measurement

Using the bundled 366-film snapshot with compact JSON and Node's default gzip:

| Payload | JSON bytes | Gzip bytes |
| --- | ---: | ---: |
| Full catalogue | 170,750 | 16,443 |
| First page of 25 cards | 12,331 | 1,410 |

This is approximately a 93% raw-payload reduction and a 91% gzip reduction on this fixture. Personal membership fields and live catalogue contents change the actual response size. No production load test was run.

## Rollout

These migrations were applied in order to A-List (`xuxshqjckbrvxiwzclfi`):

- `20261025182742_catalogue_publication_versions.sql`
- `20261025182751_saved_film_refresh_priority.sql`
- `20261025182931_calendar_content_versions.sql`

The new publisher has a distinct RPC name as recommended by the [Supabase database-function documentation](https://supabase.com/docs/guides/database/functions). It and the existing publisher remain callable only by the background service. The calendar helper functions keep their existing token and account checks.

Local migration filenames now match the versions recorded by Supabase, including the previously applied `reported_calendar_defaults` migration whose SQL was verified unchanged. Other databases need the same migrations before the matching application is deployed.

All migrations are applied to isolated PGlite instances by `npm test`; those tests do not connect to production. The authenticated browser/library/calendar round trip still requires a signed-in test session.

### Live database verification

- All three migration applications returned success and appear in remote migration history.
- Counts remained at 735 movies, one account and five library entries. Every movie has a calendar content timestamp, the new trigger is enabled, and RLS remains enabled on movie/account/library tables.
- The new and legacy catalogue publishers and refresh-candidate RPC remain executable by `service_role` and inaccessible to `anon` and `authenticated`. Invalid calendar tokens remain rejected.
- A transaction on an untracked film verified that a synopsis edit preserves the calendar timestamp, a stale catalogue publication retains the newer row, and a title change advances the calendar timestamp. The transaction was rolled back; no test movie or source-status changes persisted.
- Security and performance advisors were run before and after migration. There were no new findings. Existing notices remain: two RLS-enabled service tables without policies ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), disabled leaked-password protection ([Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)), and three unindexed foreign keys on release-candidate/review tables ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)). Their configuration was not changed by this migration.

## Verification results

- TypeScript and ESLint pass without warnings.
- All 92 tests pass, including the new publication, calendar-content, pagination and refresh-gate regressions.
- The production webpack build passes after the final changes.
- The React sign-in email still renders with its verification link after dependency pruning; no email was sent.
- `tests/integration.mjs` passed against the local production server on port 3100: sign-in page, anonymous redirects/API rejection, malformed email and cross-origin rejection, and invalid feed tokens. It sent no email and did not modify the library. The signed-in round trip was skipped because no test session cookie was supplied. The local server was stopped after the checks.
- `git diff --check` passes.

## Production deployment

- Live URL: [a-list-nine.vercel.app](https://a-list-nine.vercel.app).
- Deployment: `dpl_BCHPWmnbRAi2PYeweGDCL6MtBYWv`, [immutable build URL](https://a-list-fp1vpi41w-terence-yebuahs-projects.vercel.app).
- Target: production, Vercel project `prj_eV35BkjAL547jBP5t73vsI2fsmSC` in `terence-yebuahs-projects`.
- Source: tested local working tree based on `bd17846`, including the uncommitted implementation. This was a CLI source deployment, not a Git push.
- Added `.vercelignore` so stale `dist/` and preview outputs, local environment files and tool metadata are excluded. The checked deployment manifest contained 187 files, approximately 1.31 MB, with the required application modules and no local credential files.
- Vercel built the production deployment to READY with domains withheld. Authenticated Vercel HTTP checks confirmed the branded sign-in page, anonymous home redirect, catalogue rejection, privacy page and invalid-token response. That exact build was then promoted. Inspecting the live domain confirmed it points to the new deployment ID.
- Public `tests/integration.mjs` passed on the production domain without sending email or changing the library. The signed-in round trip was skipped because no test session cookie was supplied.
- The new deployment's error/fatal runtime-log scan returned zero records for the 15-minute window ending 2026-10-25 18:38:33 UTC, with no excluded intervals or further pages. This is an immediate post-release check, not ongoing monitoring.
- Previous production deployment: `dpl_4gJ8Dgn7exSgrxQZYU9exW1Ki4ck` (`a-list-1i4ponv13-terence-yebuahs-projects.vercel.app`).
