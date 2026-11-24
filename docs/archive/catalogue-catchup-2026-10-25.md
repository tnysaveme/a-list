# Catalogue catch-up — October 25, 2026

One-time check of all 373 films in the live Discover catalogue, including the five saved films. This does not introduce another job, service, or recurring full-catalogue crawl.

## Results

- 373 title searches completed without a source-search failure; 220 films had matching home-release reports.
- 114 films were already covered by their stored dates; their reports needed no publication.
- 68 films passed native-ID and WTS identity checks. Publication added 67 release windows across 67 films: 65 subscription launches and two PVOD windows. One verified report left its existing date unchanged.
- Two films gained their first known home date: Madden (Prime Video, November 18, 2026) and Apex (Netflix, April 24, 2026).
- 38 candidate matches remain unapplied. Reasons include insufficient credits, production-year disagreements, incomplete native profiles, temporary provider failures after one retry, and eight existing catalogue aliases. Existing dates were retained.

## Parser corrections

The wider check exposed trailer articles containing cinema dates. Discovery and article revalidation now associate a date with its nearest home/physical/theatrical context. A mixed paragraph can supply its digital date while excluding its cinema date. Bare cinema and Blu-ray announcements cannot supply a digital event. A short, dedicated digital/streaming headline can still establish context when its single-date excerpt is brief.

Named-service launches such as “will begin streaming on Prime Video” retain subscription classification. Service-original announcements that refer to “their platform” must identify the service. Regression tests use wording observed in the Wild Horse Nine, Seven Snipers, Apex and Madden reports.

## Verification

- 88 tests pass; lint, production build, TypeScript and whitespace checks pass.
- All 309 originally listed main-source windows in the checked catalogue retain their dates and source links.
- Every attached WTS release carries the matched film IMDb ID and source provenance.
- Saved membership, tracking, account settings and feed tokens are unchanged. The shared recent-feed checkpoint is unchanged.
- The live personal calendar remains at five events, all with their original UIDs and release-day alarms. Tentative events remain labelled.

See [the detailed audit](catalogue-catchup-2026-10-25.json) for every changed film, its before/after release windows and unresolved reasons.

Final parser deployment: `dpl_4gJ8Dgn7exSgrxQZYU9exW1Ki4ck`, checked at its staged URL and promoted to https://a-list-nine.vercel.app. No database schema changes were needed. The production boundary suite passes; its authenticated save/remove round trip was skipped without a session cookie. This pass verified actual subscription data and preserved memberships without performing personal library mutations.
