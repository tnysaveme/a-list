# Follow-up project review — October 25, 2026

Scope: the current working tree, including the six optimisations already deployed, the automated source pipeline, calendar generation and content revisions, catalogue/search/library flows, authentication and account controls, and read-only production health checks. No source code, production settings, or personal library records were changed during this review.

The current architecture is appropriate for a small personal/friends movie tracker. Pagination, optimistic publication versions, calendar content timestamps, coalesced browser refreshes and dependency pruning are already implemented. Further work should concentrate on the reliability and coverage gaps below, using the existing job, cache and health endpoint.

## 1. Let saved-film WTS refreshes survive a primary-source failure

**High priority; reproduced locally.**

In `lib/movie-refresh.ts:19`, a rejected DVDs Release Dates request exits `refreshMovie` before the WTS revalidation at line 50. The ingestion caller catches the whole film failure, so it also skips its later missing-date lookup (`lib/ingestion.ts:29`). A primary-source outage therefore prevents independent WTS work for saved films in that pass. The general RSS expansion may still run, but it does not replace rechecking those saved films' existing reports or searching their older reports.

A temporary local harness returned HTTP 503 for the primary source and counted WTS requests. `refreshMovie` rejected with **zero WTS requests**. No external requests or database writes were made by the harness.

Recommended change: preserve each provider's previous data independently, attempt the other provider within the shared deadline, and track a partial failure separately. A failed primary request must not imply that a WTS date has been withdrawn.

## 2. Validate a native film page before clearing an existing date

**High priority; reproduced locally.**

`lib/sources.ts:60` accepts any first `<h2>` as a detail response. When that heading lacks a Digital HD date, it drops the existing primary digital window. A film with a verified IMDb ID is protected by the later identity check; an older row without that proof is not.

The local harness supplied an unrelated browser-verification heading to `parseDetail` for an unverified legacy row with a known digital date. The parser returned zero releases instead of reporting an unrecognised response. The production read-only count found **248 primary-dated records without `identityVerifiedAt`**. This count identifies the applicable code path; it is not evidence that those records have already lost dates.

Recommended change: establish the native film subject and a recognised release section before interpreting a missing digital date as a withdrawal. Treat challenge, error and unrecognised markup as a temporary source failure and retain the previous date. Retain legitimate withdrawal handling for recognised film pages.

## 3. Include already-dated saved films in bounded older-report searches

**Coverage improvement; confirmed in code and the existing lookup test.**

`lib/release-lookup.ts:16` immediately returns if a film has any stored release. An existing rental/purchase date therefore prevents the title-specific older-report search that could find its missing subscription launch. Recent RSS discovery can still add the launch; an older article outside those RSS pages can remain missed.

Recommended change: make missing release windows, rather than an entirely empty release array, eligible for a daily cached lookup. Start with saved films, retain the request/time limits and source precedence, and avoid a recurring full-catalogue crawl.

## 4. Spend the background lookup slot on due work

**Efficiency and coverage improvement; confirmed in code.**

`lib/ingestion.ts:33` sets `lookedUpMissing=true` before calling the lookup. `lib/release-lookup.ts:19` can immediately return because its daily cache is still valid. That cache hit consumes the job's only title-lookup slot and prevents another eligible film in the same pass from using it. Repeatedly refreshed cohorts can consequently give the same film the slot again.

Recommended change: distinguish skipped/cached, attempted and deferred results; only count an actual lookup against the source-request allowance. Choose due films fairly using their last lookup time, with a bounded scan even when all candidates are cached. Reuse the existing job and cache.

## 5. Show and sort the upcoming window in Coming soon

**User-facing bug; reproduced locally.**

`lib/catalogue-view.ts:24` includes a film if any release is upcoming, but line 34 sorts it using `displayRelease`, which prefers an already available window. The cards in `app/afterlight.tsx` also use that helper. After the streaming expansion, a film can qualify for Coming soon because of a future subscription launch while showing and sorting by its earlier rental date.

The local harness used a film with Digital October 1 and Netflix November 1, and another film with Digital November 10, with today set to October 25. Coming soon ranked the November 10 film first and selected October 1 for the other card.

Recommended change: select the release appropriate to the active filter and use it consistently for sorting, card date, platform and status. Keep general availability behaviour for the unfiltered and Available views.

## 6. Separate source health from job success and transient retries

**Automation improvement; confirmed in code, not a current live outage.**

`lib/ingestion.ts:64` writes success/failure status before WTS expansion. Its expansion result is not incorporated into that status. `lib/release-expansion.ts:16` can return the previous feed after source failure, and its per-report failures are reported separately. `app/api/health/route.ts:15` bases overall health on the job success timestamp and failure counter, without checking WTS feed success or catalogue freshness. A successfully completed job can therefore coexist with stale source coverage.

Additionally, ordinary per-report `source_unavailable` failures receive the same 24-hour delay as unresolved identity evidence (`lib/release-expansion.ts:122`). Temporary availability failures deserve a shorter bounded backoff than genuinely insufficient evidence.

Recommended change: record last successful fetch/parse per source and expose staleness through the existing owner health response and structured logs. Separate transient availability retries from evidence-resolution delays. No additional dashboard or monitoring service is required.

## Suggested order

1. Provider isolation and native-page validation: protect automatic updates and existing dates.
2. Daily saved-film coverage and fair lookup scheduling: close the recurring WTS gaps efficiently.
3. Coming soon presentation, then source-specific health and retry behaviour.

Production-year differences and existing catalogue aliases remain a later matching task. Keep the verified-ID/credit checks intact while addressing them. The three INFO-level unindexed historical review-table foreign keys are lower value at this project's current size than the fixes above.

## Verification

- **92 existing tests pass.** ESLint, the production build and TypeScript also pass.
- A temporary local harness reproduced findings 1, 2 and 5 without network or database writes. These behaviours are not covered by the current regression suite.
- Production read-only checks: **793 shared movie rows, six saved entries, zero due saved films**, a recent successful refresh with zero recorded failures, and all twelve retained recent WTS reports matched.
- The performance advisor returned only the same three INFO-level unindexed foreign keys on the historical candidate/review tables. No new performance finding was reported.
- No feature implementation or deployment was performed as part of this review.
