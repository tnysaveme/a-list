# Filipiñana release-date gap — October 25, 2026

When To Stream's [October 8 report](https://whentostream.com/sundance-prize-winner-filipinana-sets-digital-streaming-release-date/) lists the 2026 feature's US digital release as October 27, 2026. Its [native film profile](https://whentostream.com/filipinana-2026/) agrees.

Two independent gaps prevented A-List from showing the date:

1. Routine discovery reads two recent RSS pages. The stored snapshot contained twelve eligible October 21–24 reports; it never encountered the October 8 article.
2. The report-title parser allowed only ASCII uppercase letters. Replaying the real source search feed returned the subject `ANA` instead of `FILIPIÑANA`, preventing an exact identity match even if that older feed was queried.

The parser now supports Unicode uppercase letters and combining accents without starting a match inside an accented word. A cached title-specific RSS lookup covers verified-identity films that have no release dates. It runs when details are opened and for at most one eligible undated film during each saved/requested-film refresh pass. It fetches one source search feed and checks at most two exact-title reports, with a ten-second overall deadline. Complete results are cached for 24 hours; temporary failures and paused imports retry after ten minutes. Films already dated skip this lookup.

The lookup reuses the same native-profile/metadata matching and atomic publication path, requires the expected IMDb identity, preserves canonical IDs, and does not replace the shared RSS checkpoint. It introduces no new service, review UI or historical crawl.

A read-only real-source shadow run matched the 2026 feature to `tt29512008` with corroborated director/cast evidence. The live lookup then published its October 27 Digital window using the same gate. The older short `tt11887594` retains no release window. No personal save/remove operations were performed.

Verification: 84 tests pass; ESLint, production build and TypeScript pass. New regressions cover accented and decomposed Unicode titles, negative-result caching, short retries after source failure, avoiding lookups for dated films, expected-IMDb rejection and preservation of the shared feed checkpoint.

Reported calendar dates are now enabled on the existing account and default to enabled for new accounts. They remain `[Rumored]`, `STATUS:TENTATIVE`, and include the 13:00 GMT alert; opting out remains available. The migration uses the existing settings trigger to invalidate subscriptions without changing feed tokens or library membership. The format/cache revision was advanced so old cached calendars and conditional requests receive the updated feed. Tests cover default inclusion, explicit opt-out, and unchanged event UIDs when a tentative date becomes listed.

Production deployment `dpl_6CVFZSnKeHvRZerqq9AZKnzwSjna` was built, checked at its staged URL, and promoted to https://a-list-nine.vercel.app. Signed-in UI verification shows Filipiñana (2026), Digital October 27, with its WTS article link. Calendar settings show five films, five events, and reported dates enabled. The live anonymous subscription contains five events including one tentative event with its alarm, and Filipiñana on October 27; conditional ETag requests return 304. Production sign-in/API boundary checks pass. The terminal integration suite skipped its session-cookie mutation round trip; this task changed no saved-film membership.
