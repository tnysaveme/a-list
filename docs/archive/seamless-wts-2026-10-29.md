# Browser freshness and WTS matching — October 29, 2026

Released to [A-List](https://a-list-nine.vercel.app) as `dpl_G6XUL4x4YYd9rriKQBmqemZnCptc`. The staged production build passed its check/build gate and sign-in smoke before promotion; it reached READY in approximately 106 seconds. The additive database migration was applied before promotion. Existing interface changes and account/library records were preserved.

## Lightweight browser freshness

The visible, online page checks `/api/revision` every minute. The first successful check synchronizes the active view once, then unchanged revisions cause no list request or React state update. Focus, online and visibility events share the same pending check and freshness guard. Hidden/offline tabs skip requests. Unmounting or changing views cancels in-flight work and removes listeners/timers.

The authenticated endpoint returns only a 32-character opaque revision with private/no-store caching. Its invoker RPC preserves existing RLS, combining the catalogue version, an indexed latest meaningful release-content timestamp, the caller's account revision and the US release day. It does not fetch movie JSON, personal feed credentials or source websites. The timestamp is represented as epoch time so connection timezones cannot alter the hash. Production EXPLAIN confirmed an Index Only Scan for the timestamp lookup.

The revision is read before list loading and acknowledged only after a successful complete refresh. Updates arriving during the load remain detectable on the next poll; partial failures retain the last coherent loaded range. A changed Discover revision rebuilds the first page's shared snapshot from stored rows even if an earlier cache invalidation was missed; subsequent loaded pages reuse the refreshed snapshot. This does not fetch source websites. Pagination, scroll anchors, filters and membership handling retain their existing behaviour. Ordinary source-check timestamps do not change the release-content timestamp. Source publication may still advance the existing catalogue version.

This improves the final website-visibility step after stored dates change. WTS discovery still runs every ten minutes, targeting roughly 10–20 minutes under normal conditions; Apple Calendar retains its own subscription refresh interval.

## Matching rule 7

Read-only inspection of twenty unresolved profiles found ten crowded title searches, alongside differing director-name order/hyphenation, incomplete independent credits and genuinely absent metadata.

- For crowded ordinary titles with more than three candidates, production years can shortlist records within two years. Unknown years stay in the candidate set. Edition/restoration headings retain broader years. Credits still establish identity; title/year alone cannot publish a date. More than three eligible candidates remain unresolved within the existing work budget.
- Exact complete director-name tokens accept surname-first ordering and hyphenation variants, including Kim Byung-woo / Byungwoo Kim. Initials, omitted names and spelling edits are not equivalent under this rule.
- Independently verified primary-source and metadata evidence for the same IMDb ID retain complementary cast, director and synopsis information. Conflicting directors stay unresolved. Candidate failures cannot manufacture uniqueness.
- Previous approved mappings remain valid; the matching-rule cache namespace advances. TV-series exclusion, per-window confidence, primary-source preference, current-source verification and withdrawal handling remain in force.

Read-only checks first verified In the Blink of an Eye, The Wrecking Crew and The Great Flood. After rollout, the catch-up processed 147 profiles: 26 matched, five withheld without publishable windows, 94 insufficient, two ambiguous, 19 temporarily unavailable and one interrupted by its budget. These are profile outcomes rather than a count of newly imported films. Remaining unresolved and unavailable evidence keeps its automatic retry schedule.

## Verification

- Formatting, lint, types, 216 unit/data tests and the backup restore fixture passed.
- All 56 isolated browser scenarios passed, including unchanged-revision suppression, changed-revision refresh, hidden/offline pause, coalesced resume, failed-probe retry, loaded-page retention, scroll anchoring and a warmed Discover cache with deliberately missed invalidation.
- Database tests verify anonymous execution is denied, owned account revisions stay isolated, source-check timestamps remain stable, release content changes invalidate the revision and connection timezones have no effect.
- Matching tests cover crowded namesakes, unknown-year failures, edition headings, distinct complete names, complementary credits and conflicting directors. Existing source, identity and calendar regressions passed.
- An encrypted application backup was created and restore-verified before `20261029222520_collection_revision.sql`. Production permission checks confirmed an invoker function, authenticated execution and no anonymous execution; advisors were unchanged.
- A disposable-account production browser verified minute-level refreshes, unchanged-list suppression and automatic reflection of changes made outside the open page. The revision endpoint denied anonymous reads, returned no private fields, stayed stable without changes and changed after saves/removals. The browser probe waited for hydration before advancing its clock.
- Forced live refreshes retained the four WTS regression films' windows. The Filipiñana short stayed separate, and the calendar save/feed/remove check retained 13:00–13:30 GMT, an at-start alarm and stable UID. Test accounts were deleted; existing accounts and libraries were unchanged.
- After the catch-up, the inventory held 590 matched profiles out of 804, zero due work and zero unexplained approved-evidence gaps. Unresolved identities and unavailable evidence remain scheduled for retries.
- The final deployment's authenticated fresh-Discover request returned a bounded live page from stored rows and a valid private revision. Its disposable account was removed and existing account/library hashes were unchanged. The bounded final-deployment runtime-error scan returned zero records.

No new service, dependency, scheduler or review screen was introduced.
