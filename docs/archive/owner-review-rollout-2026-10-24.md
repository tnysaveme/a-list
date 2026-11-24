# Owner review pilot — 2026-10-24

The expansion pilot adds `/review` for the configured owner. Discovery collects source-native film identities and supporting director/cast/synopsis evidence into a private pending queue. Suggested IMDb matches do not publish themselves. Approval requires a recorded reason, explicit confirmation, fresh source validation, corroborating metadata, and a current verified report. Films absent from the main release source can then enter Discover under their IMDb ID.

## Scope and safeguards

- The pilot holds 20 source films total, including completed reviews. Manual discovery considers up to 20 articles from two feed pages with a 25-second source budget; scheduled ingestion attempts a smaller pass when time permits.
- Member signup does not grant review rights. Server checks restrict the page and API to `ALIST_ALLOWED_EMAIL`.
- New review tables have RLS enabled with no client policies and no anonymous/member table grants. Only the service role can stage or decide reviews. Audit rows permit service inserts and reads, but no updates/deletes.
- Publication and audit insertion commit atomically. Stale candidate versions, changed fingerprints, conflicting/duplicate identities, and stale movie versions fail closed.
- Changed source identity evidence returns a reviewed film to pending and removes the affected report dates. Existing canonical IDs and personal library membership remain intact.
- Approving a film publishes it to Discover; it does not add it to anyone's library. Historical backfill and automatic identity approval remain disabled.

## Database

Applied `20261024200719_release_candidate_review` to the verified A-List production database. Verified invoker security and service-only execute grants for both RPCs, no client reads, and immutable service audit permissions.

The security advisor reports two expected informational notices because the review tables intentionally have RLS with no client policies ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). The existing leaked-password-protection warning remains unchanged; this rollout changes no auth settings ([remediation reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

## Performance work

- The complete fallback snapshot is loaded only after a catalogue API failure. Its separate client chunk is 170,852 bytes minified / approximately 16.5 KB gzip and is absent from the home page's initial client chunk list. The server initially supplies 20 films.
- Ingestion shares one RSS request between catalogue loading and approved-import enrichment.
- Verified IMDb indexes/maps bound matching work; native lookup concurrency and review item counts remain capped.
- Approved identities use a short shared cache, invalidated on discovery/review writes. Catalogue publication invalidates the catalogue cache.

This is not a production capacity claim. Follow-up measurements should cover cold search latency and upstream errors, catalogue API transfer/pagination, and realistic concurrent library/calendar traffic. Optimizations beyond those should follow measured bottlenecks.

## Verification

- 70 tests passed, including all migrations in isolated Postgres, inherited Supabase grants, atomic rollback, stale decisions, queue limits, access restrictions, evidence changes, exact-identity deduplication, canonical ID retention, latest-report/primary-source precedence, and articles without optional widgets.
- Lint, TypeScript, and the production build passed.
- Browser fixture verified empty queue → discovery → evidence choice → confirmation → publication → approved history. Approval stayed disabled without confirmation. No console errors were recorded. The fixture was removed before deployment.

## Deployment and live checks

The initial pilot deployment was promoted after a protected staged login check returned 200. Public API/auth/feed smoke checks passed, including anonymous GET and POST denial on `/api/review`. Production table and function grants were checked directly.

A live source pass revealed that most recent articles omit the optional JustWatch widget. Discovery and runtime validation now support those articles using the exact native page ID and canonical URL; a conflicting or multiple widget still fails closed. A slug year is only a discovery hint and must match the fetched native profile heading. An unreviewed native reference still cannot attach a date.

Live discovery staged 10 pending films from 12 recent reports, recognized the two seed mappings, and reported zero failures in approximately 25.9 seconds, including database writes/cache invalidation after the source deadline. No film was approved or added to a personal library during this check.

- Final deployment: `dpl_J1Xq2v5W4s42ASLnkTcVZqJo55YW`, READY.
- Build URL: https://a-list-3hppj2164-terence-yebuahs-projects.vercel.app
- Public review URL: https://a-list-nine.vercel.app/review; public domain verified against the final deployment.
- Remote build: approximately 43.6 seconds. Protected staged login returned 200 before promotion.
- Final public sign-in/API/feed boundary checks passed without sending email. The unauthenticated integration runner intentionally skipped its authenticated library mutation check; the existing signed-in session was used for review verification.
- Signed-in owner browser showed 10 pending films and zero approved/rejected records. The Uprising evidence screen showed native director/cast/synopsis and the separate IMDb suggestion, with no suggestion preselected and approval disabled.
- The actual deployed Discover action completed successfully: 10 films added/refreshed, two known mappings, zero failures. A final bounded error/fatal log scan returned no records during verification.
- Source upload came from the local working tree; no Git remote is configured. The report's final verification notes were saved locally after deployment.
