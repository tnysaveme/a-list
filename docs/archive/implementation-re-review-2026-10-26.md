# A-List implementation re-review — October 26, 2026

> Historical review snapshot. See [implementation status](implementation-status-2026-10-26.md) for completed work and rollout requirements.

This assessment covers the current local working tree, including its uncommitted changes and untracked tests. It does not establish what is deployed. The earlier backlog remains a historical review snapshot: [original backlog](implementation-fix-backlog-2026-10-26.md).

## Rating

**8/10 for the current owner-and-friends scope, unchanged overall.** Release coverage and regression coverage have improved. Important source-uncertainty and publication cases still permit removal of valid dates, so the reliability score has not yet earned an increase.

| Area                 | Rating | Current assessment                                                                                                                              |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature completeness | 9/10   | Native profile release fields, year-drift handling and lookup explanations improve coverage.                                                    |
| Data integrity       | 8/10   | Strong identity gates and publication version guards; incomplete profiles can still remove good data.                                           |
| Security             | 8/10   | Existing ownership policies, authenticated boundaries and privileged-operation restrictions remain. This is not an exhaustive penetration test. |
| Reliability          | 7/10   | Better detail-refresh handling, but background invalidation and partial-profile publication remain unsafe.                                      |
| Maintainability      | 7.5/10 | Useful domain modules and hooks; overlapping refresh paths still implement different uncertainty rules.                                         |
| Testing and delivery | 8.5/10 | 141 passing tests and a passing production build; authenticated browser coverage is still absent from CI.                                       |
| Performance          | 7.5/10 | Bounded source work and page payloads; cold/concurrent request costs remain unmeasured.                                                         |

## Additions and fixes understood

- Native WTS film profiles now supply labelled VOD, PVOD and SVOD dates. Profile URLs and native IDs are checked, fetched pages are reused, and multiple verified windows publish together.
- Missing-window lookup checks profiles before announcement articles. Cached unresolved/unavailable outcomes explain uncertainty in details rather than asserting that no date exists.
- Credit matching tolerates provider-year differences when an exact normalized title, director and three distinct cast members agree. Exact-year inference still requires two cast members. Matching remains bounded and ambiguity fails closed; it does not merge on title/year alone.
- Profile-backed detail refresh deduplicates requests by page while retaining separate release kinds. Tests cover changed dates, TBA withdrawals and retained calendar UIDs.
- Detail-refresh verification now retains releases for several challenge/incomplete-profile cases. This addresses part of the earlier P1 issue, but not all paths or all incomplete-markup shapes.
- Calendar events are now 13:00–13:30 UTC reminder blocks with an at-start alarm, stable UIDs and an advanced format revision. The description separates the reminder time from actual film availability.
- The working tree retains the movie-only save/track guard, removable legacy series, corrected synopsis identity repair and primary-source rescheduling logic identified in the previous pass. Those should not be counted again as entirely new since that review.

## Confirmed remaining defects

### 1. P1 — Complete the source-uncertainty fix across refresh paths

**Partially fixed; remaining cases reproduced locally.**

`lib/release-expansion.ts:240` converts every `parseSourceProfile` exception into `conflicting_source_profile`. The catch path at line 412 treats that outcome as grounds to invalidate an approved mapping. A fixture returning an HTTP 200 “Verify your browser” profile produced an `a_list_store_release_match` call with `status: pending`, even though no conflicting identity was observed. The current SQL publication routine can remove releases attached to that mapping when it becomes pending.

The detail path also has an uncovered shape: `lib/source-verification.ts:43` returns null when a page still has an article ID and h1 but is missing its canonical link. A locally verified fixture returned null rather than a temporary failure; callers treat null as withheld evidence.

**Required change:** model unavailable/incomplete evidence separately from positively conflicting identity. Share that distinction between expansion, enrichment and detail refresh. Missing fields are not positive conflict. Retain last-good dates and use the transient retry for uncertainty; keep real conflict invalidation.

**Acceptance:** HTTP 200 challenge pages, missing canonical tags, missing headings and incomplete credits cannot invalidate approved mappings or certify healthy withdrawals in any path. Tests must inspect publication/invalidation calls, retained dates and calendar contents.

### 2. P1 — Preserve unaffected windows when publishing a partial profile

**Newly exposed by native profile publication; reproduced locally through the parser, verifier and publication merge.**

`parseProfileReports` permits an absent release-kind field during general discovery. `expansionMovie` in `lib/release-automation.ts:135` removes every existing release from a source URL before adding the windows present in the newly parsed reports. That source-level replacement worked differently when each article represented a single window; a native profile can represent several.

An existing profile-backed Subscription date became only a Digital date after publishing a profile containing a valid VOD field but no SVOD field. No SVOD withdrawal was stated. The native profile expansion path at `lib/release-expansion.ts:318` uses this merge.

**Required change:** carry per-window results: verified date, explicit withdrawal/TBA, missing/unparseable. Replace or remove only windows supported by the corresponding evidence. Preserve unaffected source windows. Handle the zero-valid-window case with the same rules rather than blindly withholding all source releases.

**Acceptance:** adding/updating VOD while SVOD markup is absent retains the stored subscription event. Explicit SVOD withdrawal removes only SVOD. Ambiguous/malformed fields retain last-good data and surface uncertainty. Cover both all-empty and partially populated profiles.

### 3. P2 — Parse rescheduled profile dates without treating them as withdrawals

**New profile-parser defect; reproduced locally.**

`lib/sources.ts:424` skips any field containing “postponed”, before examining replacement dates. `VOD Release Date: postponed from October 27, 2026 to November 10, 2026` returned no report, even with Digital as the required kind. A profile-backed refresh can consequently withdraw the stored date instead of updating it.

**Required change:** distinguish indefinite postponement/withdrawal from an explicit replacement date. Apply ordering and ambiguity rules comparable to the primary-source parser. Do not guess when multiple dates are unresolved.

**Acceptance:** a clear replacement moves the existing UID to its new date; indefinite postponement withdraws it; ambiguous copy preserves the last-good date with an issue.

### 4. P2 — Align SQL library sorting with card/Discover date selection

**Previous backlog item 2 remains open.** No migration changes the library's `next_date` sort, while TypeScript uses the active view's displayed release. Films with past digital and future subscription windows can still sort differently across views. Add SQL/TypeScript parity fixtures covering every filter and page boundaries.

### 5. P2 — Make calendar previews honor the reported-date preference

**Previous item 3 remains open; re-reproduced against the current component.** Calendar settings rendered November 5 for a reported-only film with `includeRumors: false`, while `makeCalendar` generated no event. `components/calendar-settings.tsx:171` still uses unfiltered `nextRelease`. The horizon banner also selects without this preference. Select eligible calendar events consistently and explain excluded-only films without losing tracked membership.

### 6. P2 — Retain membership and newer data on catalogue fallback

**Previous item 4 remains open by code inspection.** `hooks/use-catalogue.ts` still replaces failed requests with the snapshot, which lacks current membership. Saved films outside loaded library rows can appear unsaved. Preserve known membership separately; represent unknown membership honestly; retain usable recent data when refresh fails.

### 7. P2 — Use catalogue-level freshness metadata

**Previous item 5 remains open by code inspection.** The footer still uses the first visible film's timestamp or today for an empty result. Return and display the actual catalogue success timestamp and fallback provenance, independent of filtering/sorting.

### 8. P2 — Reject malformed complete mutation payloads

**Previous item 6 remains open by code inspection.** The API still filters invalid IDs out of batches and maps missing/non-boolean `includeRumors` to false. Validate the full payload before writing; malformed input should produce 400 without changing settings or a subset of a batch.

### 9. P2 — Preserve successful results when lease cleanup fails

**Previous item 7 remains open by code inspection.** `withLease` still awaits cleanup in `finally` without isolating cleanup failure. A Redis deletion error can replace the result of already committed work. Preserve the work result/original work error, log cleanup failure separately and keep token-checked deletion.

### 10. P2 — Isolate source-health write failures from source results

**Previous item 8 remains open by code inspection.** The detail path still awaits health RPCs before publishing refreshed movie data. A diagnostic-write exception can discard valid results and misclassify the refresh. Distinguish diagnostic storage failure from upstream failure without hiding actual movie-write errors.

## Remaining engineering improvements

These are gaps or deliberate trade-offs, not claims that production is currently experiencing each failure.

| #   | Priority | Work                                                     | Completion criteria                                                                                                                                                                                                                                          |
| --- | -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11  | P2       | Validate and document configuration by capability.       | Normal sign-in/API/feed requirements include Redis and the salt; search/details service credentials and job-only keys are explained. Missing settings produce actionable names-only diagnostics.                                                             |
| 12  | P2       | Define Redis outage policy and recovery tests.           | Document and test bounded waits, statuses and recovery for sign-in, library, feeds and jobs. Preserve authentication and abuse controls; do not globally fail open.                                                                                          |
| 13  | P2       | Add authenticated browser journeys to CI.                | Exercise actual browser state through search, details, save/remove/Undo, filters, pagination, calendar preferences and session expiry using isolated fixtures. Account deletion/reset tests use disposable accounts only.                                    |
| 14  | P2       | Extend provider regression coverage across paths.        | Apply common uncertainty cases to detail refresh, discovery, expansion and persistence. The new tests improve coverage, but the three reproduced source defects escaped the current suite.                                                                   |
| 15  | P2       | Add recoverable page-level dependency errors.            | Distinguish invalid sessions from auth-provider outages and provide a retry state. There is still no application error boundary, and `getUser` collapses returned auth errors to signed-out state.                                                           |
| 16  | P2       | Verify/document ongoing monitoring and recovery alerts.  | Determine whether external monitoring already exists; detect stale jobs and sustained source failures, avoid repetitive alerts and retain private health access. No monitoring was created during this review.                                               |
| 17  | P3       | Measure cold search/detail latency before optimizing.    | Record warm/cold p50/p95 and a total interactive budget, including the new profile work and shared settling window. Propagate cancellation/use background refresh only where measurements justify it.                                                        |
| 18  | P3       | Measure catalogue cache-miss and rebuild concurrency.    | Benchmark full hydration before pagination, duplicate cache-miss work, bytes, memory and query count. Coalesce or redesign queries only where warranted.                                                                                                     |
| 19  | P3       | Tighten endpoint contracts and client orchestration.     | Replace unrelated intersection response typings with endpoint-specific contracts; test initialization/refresh/mutation transitions and shared SQL/TypeScript domain rules.                                                                                   |
| 20  | P3       | Clarify active tooling and deployment/recovery runbooks. | Distinguish retained preview scaffolding from unused SQLite/Drizzle configuration. Document migration prerequisites, compatible rollback, source repair, cache recovery and verified backup/restore arrangements without assuming hosted backups are absent. |

Items 11–20 correspond to previous backlog items 9–18. They remain open or unverified in this source review. External monitoring and backup configuration were not inspected, so those are verification tasks before deciding whether additional infrastructure is needed.

## Verification and limits

- `npm run check`: formatting, lint, TypeScript and **141/141 tests passed**, compared with 125 in the earlier review.
- `npm run build`: passed with the current Next.js production configuration.
- Isolated additional probes reproduced background challenge-page invalidation, missing-canonical detail withholding, partial-profile window loss, postponed-date loss and the calendar preview/feed mismatch.
- Probes used mocked upstreams, pure functions or component rendering. No production database writes, source repairs, emails, account changes or deployments were performed.
- The public HTTP smoke test passed: branded sign-in, home redirect, unauthenticated API protection, malformed email and cross-origin rejection, and invalid public feed handling. Its authenticated round trip was skipped because no session cookie was provided. Authenticated browser/device acceptance and production load remain outside the completed verification.
- Include new tests and intended source changes in the eventual commit/release; a passing local working tree does not establish that those files are present in production.

Address items 1–3 first, then remaining correctness and recovery items 4–16. Items 17–20 should be measured or handled incrementally, rather than becoming prerequisites for unrelated bug fixes.
