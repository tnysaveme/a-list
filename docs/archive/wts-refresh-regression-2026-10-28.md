# WTS refresh regression — October 28, 2026

Released to [A-List](https://a-list-nine.vercel.app) as `dpl_7QXZxEHxbGu2BGx66WyQzRk25Z33`.

## Findings

Filipiñana's stored Digital window was empty although its approved mapping and current [WTS profile](https://whentostream.com/filipinana-2026/) still supported October 27, 2026. The Odyssey, Forgotten Island and Primetime also had missing WTS PVOD windows. All four records were updated during the 18:20 UTC refresh pass; the latter three retained their primary-source Digital dates.

The WTS modules in the latest UI deployment matched the working copy and the preceding UI deployment byte for byte. The scheduler still targeted the live production domain. No interface rollback, scheduler change or schema change was needed.

Two unsafe refresh paths were reproduced: a missing active crosswalk could return the same result as a withdrawal, and edited profile evidence could remove a window before the normal matcher rechecked it. Both could label the resulting record fresh. A cached negative lookup could subsequently suppress recovery even after a previously known window disappeared. Historical Redis contents from the 18:20 pass were unavailable, so its exact cache state could not be reconstructed.

## Fixes

- Missing verification evidence and edited credits/synopsis preserve previously verified windows as a partial check. They cannot publish a new date without corroboration. Explicit withdrawals, conflicting IMDb subjects and changed native page IDs still withhold the affected date.
- Title-lookup cache records include the release kinds present when checked. Losing one invalidates that cached result, including negative results. Ordinary undated negative checks retain their daily cache.
- Verified-identity cache keys include the matching-rule version, isolating newer results from older deployments sharing Redis. Both cache namespaces were advanced for rollout.
- All four windows were restored through fresh native-profile verification, preserving film IDs, personal memberships and event UIDs.

## Verification

- 194 unit/data tests passed, plus formatting, lint, types, production builds and the backup restore fixture.
- All 37 isolated browser scenarios passed for the recent interface changes.
- Forced real refreshes of all four repaired films on the final production deployment retained their WTS windows and returned fresh status.
- A disposable-account Filipiñana save/feed/remove test passed: October 27, 13:00–13:30 GMT, alarm at the start, stable event UID. The older short remained undated and separate.
- The test account was deleted; existing accounts and libraries were unchanged.
- The final database comparison found zero missing release kinds among approved persisted reports. This is a consistency check against approved evidence, not a claim of complete WTS coverage.
- The bounded final-deployment runtime-error check returned zero records. An encrypted application snapshot was restore-verified before repairs.
