# A-List

A personal movie library for sourced US digital and subscription release dates, with an updating Apple Calendar feed. Built with Next.js 16, React 19, Supabase Auth/Postgres, and Vercel. [Open A-List](https://a-list-nine.vercel.app).

## Design system

The shared visual system is documented in [design.md](design.md), with portable colours, typography, spacing and motion in `tokens.css`. Branding is the text **A-List** in Figtree; the interface uses Inter. Next.js self-hosts both Google Fonts. Appearance follows the device’s light or dark preference. Email templates use matching neutral styling with email-client font fallbacks. Regenerate their HTML with `npm run email:render`.

## Local development

Use Node.js 24. Install with `npm ci`, copy `.env.example` to `.env.local`, and fill in the Supabase project URL, publishable key, the owner's email address, an optional comma-separated list of invited members, and the sign-up setting. Normal API, sign-in and calendar throttling also require the Redis settings and `ALIST_KEY_SALT`. Complete source search/detail refresh, automatic discovery and account deletion additionally require `SUPABASE_SERVICE_ROLE_KEY`. Run `npm run config:check` to inspect missing setting names. Keep privileged credentials server-side and never commit `.env.local`.

Apply the versioned SQL in `supabase/migrations` to your Supabase project. Configure Supabase Auth's Site URL to your production URL and allow `/auth/callback` on that URL plus `http://127.0.0.1:3000/auth/callback` for local development. Then run `npm run dev` and open the printed address. Email links must be opened in the browser that requested them.

The server checks the authenticated identity against `ALIST_ALLOWED_EMAIL` (the owner) and `ALIST_ALLOWED_EMAILS` (additional invited email addresses) on every personal request. Set `ALIST_ALLOW_SIGNUPS=true` after custom SMTP is working to allow new people to sign in with their own verified email without pre-registering addresses. Each person has their own private library, preferences, and secret calendar feed. Postgres RLS separately restricts all account, library, and cache rows to their owner. Anonymous callers have no direct read or write access to these tables.

## Deploy

This repository is linked to Vercel's `a-list` project in `terence-yebuahs-projects`. Pushes to `main` deploy to production. `vercel.json` selects Next.js, `npm ci`, the verified webpack build, and London functions near the Supabase database.

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALIST_ALLOWED_EMAIL`, `ALIST_ALLOWED_EMAILS`, and `ALIST_ALLOW_SIGNUPS` in Vercel's production, preview, and development environments. Keep preview deployment protection enabled. The production calendar endpoint must be reachable without Vercel Authentication so Apple can refresh the secret URL; the app protects the library itself with Supabase sign-in.

## Features

- Live movie search and a persistent personal library.
- Grid/list views; sorting by home release, title, theatrical release, or date saved.
- Movie details with source links and Available, Coming Soon, TBA, and Unconfirmed release labels.
- Automatic calendar tracking for every saved film, including films waiting for a date.
- Individual and batch removal, with a ten-second Undo.
- Updating Apple Calendar subscription, unconfirmed dates included as tentative events by default, and downloadable `.ics` snapshots.
- Automatic When To Stream discovery, with conservative identity matching and one-click saving from Discover.
- Account controls for JSON library export, private calendar-link reset and permanent account deletion.

## Release data

Dates and metadata come from [DVDs Release Dates](https://www.dvdsreleasedates.com/digital-releases/) and [When To Stream](https://whentostream.com/). Each release retains its source URL and last-check date. Catalogue ingestion includes the last twelve months of digital releases and next month, so already released films retain their dates. Opening film details checks missing or six-hour-old release data directly; the browser applies those results to cards and refreshes listings on focus and every five minutes while visible. `lib/catalogue.json` is the sourced initial snapshot collected on 2026-10-24; it is an explicitly marked fallback and never populates your library automatically.

A listed date means a third-party source lists it. Unconfirmed dates remain tentative and are included in the calendar by default, with an opt-out in calendar settings. Generic digital listings do not imply PVOD pricing. DVD and theatrical dates are never substituted for digital releases, and missing dates remain unknown.

Sources are checked on demand with a six-hour cache. The scheduled ingestion job refreshes saved films even while the app is closed; calendar requests read those saved results. Source failures retain the last saved data. Apple's refresh interval controls when changed events appear. Coverage and availability depend on the source sites and their HTML/RSS formats. Posters and Google Fonts are fetched from their respective providers.

### Film identity and source expansion

Cross-provider merges require an exact, verified IMDb identity. Titles and production years only shortlist candidates; they never establish identity, including unique title/year pairs. Duplicate IMDb matches, conflicting identities, and ambiguous candidates stay separate. Native DVDs Release Dates IDs and existing calendar event UIDs remain stable.

Search verifies at most four candidate detail pages in parallel, with a shared 3.5-second deadline. A source failure keeps the search providers separate. Catalogue enrichment verifies at most four When To Stream articles and four distinct native film pages, with a shared six-second deadline and cached detail requests. Lookup indexes replace repeated scans, and each native detail page is fetched once per enrichment pass.

When To Stream articles must identify their subject through explicit `Movie` JSON-LD with an HTTPS IMDb URL, a previously reviewed native film mapping, or a unique corroborated match. Corroboration requires an exact normalized title, a matching director, and at least two distinct shared cast members from independent metadata. If provider years disagree, three distinct shared cast members are required instead; production, festival and distribution years remain separate from the verified IMDb identity. All bounded title candidates are considered before establishing uniqueness, and ambiguous matches stay unresolved. Native page IDs, canonical URLs, headings and credits are verified before matching. Incidental article links and release years cannot identify a subject. Inferred identities are labeled `corroborated`, separately from `reviewed` and `structured` proof. Sparse evidence stays unresolved. No third-party widget key or AI service is used.

Mappings bind the native film profile to a fingerprint. A positively changed profile is rechecked; conflicting evidence withholds its affected dates. Temporary source failures preserve the last known data. Historical reviewed mappings and their private audit records remain intact, including sparse documentaries that cannot satisfy the inference rule. Invalidated stored mappings override seed mappings. Primary listed digital dates retain priority, and rumors remain tentative. The verified IMDb identity and provenance stay on each attached release.

### Automatic discovery

The existing scheduled ingestion job handles expansion without keeping the app open. It refreshes saved/requested films first, then uses its remaining time to process at most five recent reports with at most two concurrent film checks and a ten-second expansion budget. It shares a two-page RSS snapshot refreshed every six hours with normal catalogue enrichment. Mappings and native profiles are cached; unresolved evidence retries after 24 hours or sooner when RSS evidence changes. Interrupted checks remain due. The bounded recent-feed checkpoint is a work buffer, with no lifetime limit on imported films.

Verified films missing a listed rental/purchase or subscription window also get a cached title-specific WTS lookup when details open, and at most one actual lookup during each scheduled pass for due saved films. The lookup checks native film profiles first, reading explicit VOD, PVOD and SVOD release fields after identity verification; announcements fill windows still missing afterward. TBA and theatrical dates never supply a home-release date, and estimates remain tentative. One search feed, at most two title-matching profile pages ranked by year, and two candidate publications share a ten-second source budget, followed by at most three seconds for committed results to settle. Fetched profiles are reused during matching, and all their verified windows publish together. Complete checks are cached for 24 hours and temporary failures retry after ten minutes. Unresolved identities and unavailable sources are explained separately from an absence of dates, including on cached detail responses. The same exact IMDb gate separates shorts, features and namesakes. Existing profile-backed dates refresh through their source URL; missing markup preserves last-good dates, while explicit withdrawals remove the affected window.

Verified films missing from the main source enter Discover automatically. Existing films keep their canonical IDs; exact-identity lookup prevents duplicate imports. Discovery never saves a film to a personal library. You choose **Save** and existing calendar tracking takes over, including films still waiting for a date. Imported films survive feed rotation. The old `/review` bookmark redirects home; there is no review queue or manual approval API.

Set the server-only `ALIST_WTS_AUTO_IMPORT=true` to enable new matches. Setting it to `false` and redeploying pauses new imports while established mappings and normal date refreshes continue. It defaults to `false` locally. This uses the existing Supabase, Redis and scheduled job, with no new service. See `docs/automatic-expansion-2026-10-25.md` for rollout verification.

### Performance

Catalogue matching uses indexes and bounded upstream concurrency; shared RSS fetches avoid duplicate ingestion requests. Discover starts with 25 server-selected cards and requests further pages with global filtering and sorting. Synopses load when details open. Search still checks the whole server catalogue, including unloaded pages. The full bundled snapshot loads only if the catalogue API fails and uses the same pagination locally. On the 366-film snapshot, the first-page payload is approximately 12.3 KB / 1.4 KB gzip, compared with 170.8 KB / 16.4 KB gzip for the full catalogue; these are local fixture measurements, not production traffic measurements.

Focus and visibility events share one refresh, skip views refreshed within the last minute, and refresh only the active view. New search results remain saveable without entering the background queue. Saved films take priority over one-off detail requests.

Catalogue publication compares the row versions read before enrichment and retains concurrent edits and inserts. Its returned records also supply the cache, so rejected stale candidates cannot enter Redis. Calendar content has a separate revision: source-check timestamps, posters and synopses do not invalidate subscriptions. Date, title, platform, confidence and source changes still do. Calendar events use the content revision for Last-Modified; source-check dates remain visible in movie details.

`20261025182742_catalogue_publication_versions.sql`, `20261025182751_saved_film_refresh_priority.sql`, and `20261025182931_calendar_content_versions.sql` were applied to the linked A-List Supabase project on 2026-10-25. Apply them before deploying the matching application to any other database. The legacy catalogue publisher safely preserves existing rows during rollout. See `docs/project-optimisations-2026-10-25.md` for verification and rollout details.

These changes suit the current catalogue size. Further work should be guided by production measurements: cold search/source latency, catalogue cache-miss costs, and realistic concurrent library/calendar traffic. Build and isolated tests do not establish production capacity. See `docs/rollout-2026-10-24.md` for the identity rollout, `docs/owner-review-rollout-2026-10-24.md` for the historical review pilot, and `docs/pilot-review-verification-2026-10-24.md` for the ten approved identities and the live independent-import/calendar round trip.

Apply `20261024184517_verified_report_filters.sql` and `20261024184653_verified_report_permissions.sql` with the release to align database pagination, filters, upcoming-film selection, and event counts with the same identity rules. The migrations preserve account isolation, explicitly remove inherited anonymous RPC execution, and combine release statistics in one aggregation per film. The database test mirrors Supabase’s default public-function grants. `npm test` applies all migrations to an isolated in-memory Postgres instance and checks report handling, pagination, and access isolation; this test never connects to production.

Discovery computes release dates once per film before sorting and uses indexed library lookups. Known poster providers use Next.js responsive image optimization with an explicit host/path allowlist; other metadata poster URLs retain direct loading. Search and calendar caches use new namespaces so results from older matching rules cannot bypass verification.

## Reminders

Every dated calendar event is a **30-minute reminder block from 13:00–13:30 GMT (UTC) on its release day**, with a display alarm at the start. Start and end timestamps use UTC, so daylight-saving changes cannot move the GMT reminder time. The event description distinguishes the reminder block from the film's actual availability time. When a date changes, its block and alert follow it. Unconfirmed dates are included by default as labelled tentative events with the same reminders. Calendar settings still allow opting out. Downloads include the same blocks and alarms. The format revision advances existing subscriptions while retaining event UIDs.

Apple Calendar can suppress alerts from subscriptions. In its subscription settings, leave **Alerts** unchecked under **Remove** and turn **Ignore alerts** off. Calendar notifications must also be enabled on the device. Existing subscriptions pick up the alarms on their next refresh; notification delivery is controlled by the calendar client. See [Apple’s subscription instructions](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac). GMT stays UTC+0 throughout the year.

## Email sign-in for members

Supabase’s default SMTP service only sends to the project team’s email addresses. Configure custom SMTP before enabling `ALIST_ALLOW_SIGNUPS` for people outside the project team. Do not grant application members access to the Supabase organization as a workaround. Keep SMTP credentials in private provider configuration, outside this repository.

## Account controls

Open **Account settings** in the header to export your complete library, reset a leaked calendar link, or delete your account after typing DELETE. Resetting a link revokes the old one immediately; remove the old subscription from your calendar app and subscribe again. Account deletion revokes sessions first, removes private account/library/cache rows, and leaves shared movie data available to friends. Calendar downloads already on a device must be removed there. `/privacy` explains the data involved without a support workflow.

The current scope is the owner and friends. Existing IP/email throttles remain; no CAPTCHA provider or new service was added. Current email capacity and verification are recorded in `docs/friends-account-controls-2026-10-25.md`. Source-use findings are in `docs/source-use-review-2026-10-25.md`; explicit redistribution rights have not been established.

## Calendar privacy

The secret `/api/feed/<token>.ics` URL grants read access to sourced dates for films in your library. Keep it private. An anonymous read-only RPC validates the token; its privileged helper is in an unexposed schema. It cannot modify the library or return films outside your library. Removing a film from your library removes its events on the next calendar refresh.

Event UIDs retain the legacy `afterlight` namespace so a branding change does not duplicate existing events. Displayed calendar names and downloads use A-List. Existing subscriptions on the old host must be replaced with the new feed URL.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
ALIST_BASE_URL=http://127.0.0.1:3000 node tests/integration.mjs
```

The integration smoke check verifies public sign-in, authenticated API boundaries, malformed email rejection, and invalid calendar tokens without sending email or altering the library. Optionally set `ALIST_SESSION_COOKIE` from your own signed-in browser to verify catalogue, source details, save with automatic calendar tracking, anonymous feed, remove, and cross-origin rejection. It restores its test film afterward. Never commit that cookie.

For disposable account-export, calendar-reset and deletion checks, start a local app server and explicitly enable `ALIST_RUN_DATABASE_TESTS=true` when running `node --env-file=.env.local tests/privacy-integration.mjs`. It creates and removes two named test accounts and two reserved movie rows, sends no email and does not import sessions into your browser. The database used by `.env.local` is changed, so use a test project when possible.

The final email sign-in and Apple Calendar subscription acceptance require the owner to complete them on their devices.

### Source reliability and daily saved-film coverage

Primary listings and existing WTS reports refresh independently within the same deadline. Unexpected native page markup retains previous dates; a recognised film subject is required before removing a legacy primary date. Partial failures retry after fifteen minutes. Saved films with a missing listed rental/purchase or subscription window also get a separately scheduled, cached title search, at most one actual lookup per job. Cached/busy entries do not use that request allowance, and the due batch is bounded to eight candidates. Empty results retry after a day; title-lookup availability failures retry after ten minutes. Recent-report availability failures retry after fifteen minutes, while insufficient identity evidence retains its daily retry.

The owner health endpoint reports source-specific success, failure and stale feed/catalogue checks. It remains private and uses the existing job and database. Coming Soon cards select and sort by their upcoming window; Available and unfiltered cards retain their availability view.

## Checks and source recovery

Run `npm run check` before releasing: it checks formatting, lint, types and unit/database fixtures. `npm run build` verifies the production bundle. GitHub Actions runs both plus the production dependency audit; Vercel runs the same check gate before building. Unit tests receive no service credentials and reject unmocked network requests. The explicitly enabled integration suites use disposable accounts and run separately.

`npm run sources:check -- --limit 30` checks failed film refreshes without writing data. Add `--saved` to check saved films, or `--repair` to store verified results with row-version guards. Repairs update shared film records and source-health checks, preserving personal library rows and calendar credentials. Up to 100 records can be checked per run. Missing metadata remains a coverage gap; it cannot create a release date or prevent independent release-source checks. Failed sources retain last-good dates and surface a retry notice in movie details; expected or estimated dates remain tentative.

Library, film search and calendar state live in separate hooks. Batch changes read membership before and after writes; a failed response does not imply rollback. Retry and Undo operate on confirmed results rather than assuming an entire batch succeeded.

## Reliability rollout and operations

See [operations and recovery](docs/operations.md) for the current migration, release checks, logs-only monitoring, source repairs and application backup tooling. `20261026183555_release_consistency.sql` was applied and verified on A-List production on October 26, 2026; apply it before deploying the matching application to another database. The historical review reports are superseded by [implementation status](docs/implementation-status-2026-10-26.md).

`npm run test:e2e` exercises the real UI/API against isolated loopback providers and a separate production test build; no production credentials or accounts are used. Source uncertainty and per-window withdrawals have cross-path regressions. Movie details return saved evidence after a 1.5-second provider wait and poll background work; calendar previews and library ordering follow the same release rules as their corresponding views.

Health changes remain structured logs, as requested. The new public readiness endpoint exposes status only; detailed health remains private. Backup tooling does not imply a live backup exists: no production export was requested.
