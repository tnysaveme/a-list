# Calendar usability, release sorting and migration reconciliation

Implemented review recommendations 1–3. Library search and watched/archive status remain out of scope.

## Migration baseline

The pre-existing checkout was saved as `c29ed2e` after the review's passing check and browser suites. Seven local migration files were compared against `supabase_migrations.schema_migrations.statements` in project `xuxshqjckbrvxiwzclfi`. Their SQL matched exactly after trimming surrounding whitespace. Only filenames and references changed; no applied SQL or production migration records were changed.

| Migration                         | Former local version | Recorded production version |
| --------------------------------- | -------------------- | --------------------------- |
| catalogue_wts_coverage            | 20261027173000       | 20261027172301              |
| wts_identity_without_display_year | 20261027180000       | 20261027174428              |
| wts_profile_inventory             | 20261027235000       | 20261027235816              |
| wts_consistency_and_fair_queue    | 20261029074821       | 20261029081236              |
| wts_incremental_discovery         | 20261029153611       | 20261029154220              |
| collection_revision               | 20261029221153       | 20261029222520              |
| grouped_calendar_events           | 20261030095442       | 20261030100802              |

All 25 recorded production versions now have matching local filenames. The only new pending migration is `20261030115759_available_releases_newest_first.sql`, generated with the Supabase CLI. It replaces the library page function to sort Available by descending release date. Counts, ownership checks, function privileges, calendar UIDs, and stored rows are unchanged. Discover uses the corresponding application sort. Apply the pending migration through the linked CLI workflow when releasing this application change.

## Calendar behavior

The upcoming-film banner now says “Included in your feed,” shows an Unconfirmed label for tentative dates, and describes subscription and premium releases correctly when no platform is supplied. Movie details also distinguish feed inclusion from an external calendar subscription.

A nonmodal setup reminder is offered after a confirmed save into an empty library during the current visit. It does not appear on initial page load, so existing libraries keep their stable layout. It offers calendar settings and can be dismissed. The dismissal is a browser-local preference, contains no account identifiers or feed credentials, and is never interpreted as a subscription status. Opening settings leaves the reminder available until dismissed or the visit ends. Dismissal still works for the current visit when browser storage is unavailable; the header calendar control remains available.

Calendar settings place subscription and copy/download actions near the top. Detailed alert, refresh and iCloud instructions are in a keyboard-accessible Setup help disclosure. Existing 13:00 UTC reminders and unconfirmed-date preferences are retained. README sign-in guidance now distinguishes current cross-browser confirmation links from the legacy PKCE callback.

## Ordering

Available uses the latest already-listed release for each film and sorts newest first, with stable title/ID ties. A future subscription date cannot displace the already-available rental date for this view. Coming Soon stays nearest-first; other filters and explicit title/theatrical/recently-added sorts are unchanged.

## Validation

The regression coverage checks mixed release windows, equal-date ties, pagination, and parity between the client comparator and the real SQL function in disposable Postgres. Browser coverage checks the first-save reminder, persistent dismissal and focus, keyboard setup help, honest tentative/subscription labeling at narrow widths, and both sections' release sorting. No real email or calendar subscription is created by these fixtures.

`npm run check` passes formatting, lint, types, all 225 unit/database tests, and the backup self-test. The isolated production build passes. The final full browser run passed 58 of 59 tests; the remaining failure was an ambiguous alert selector in the new setup test, matching Next.js's hidden route announcer as well as the expected error. After narrowing that selector, the targeted setup test passed, covering all 59 scenarios. The earlier initial-load layout regression was fixed and its existing layout-shift check passes. Fresh desktop and 320px dark screenshots, plus the 375px light calendar dialog, were visually inspected. Test servers were stopped by the harness.

This change is prepared locally. Production migration application and deployment are separate release steps.
