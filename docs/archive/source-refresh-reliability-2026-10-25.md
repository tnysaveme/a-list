# Source refresh reliability rollout — October 25, 2026

Implemented all six items from the follow-up project review within the existing application, Supabase database, Redis cache and QStash refresh job.

## Changes

1. **Independent provider refreshes.** Existing WTS reports start alongside the primary-source request, within the same bounded film deadline. A failed primary request retains its previous dates while WTS can still update or withdraw its own verified report. Partial checks retain the last complete-check timestamp and start a fifteen-minute primary retry. WTS publication preserves the primary refresh deadline, failure counter and outstanding request, so matching a report cannot postpone that independent retry.
2. **Native-page validation.** Unrecognised release headings fail without clearing dates. Before withdrawing an older primary date without verified IMDb proof, the response must identify the same native page ID through its canonical URL and the same film title in its heading. Legitimate source withdrawals remain supported, including native production-year differences.
3. **Missing-window lookups.** A verified film is eligible when either a listed rental/purchase window or a listed subscription window is missing. Already-dated films can therefore find older streaming articles. Daily caching, the ten-second source-work deadline and the two-report cap remain. Missing windows get priority over articles repeating a known window; Digital and PVOD count as the same rental/purchase family for this priority decision.
4. **Fair saved-film scheduling.** The service-only candidate RPC reads a bounded batch of eight due saved films, ordered by their lookup deadline. Cached and busy entries do not consume the one actual network-attempt allowance. Cached deadlines move out of the due batch. Lookup timing is independent of primary-source success. Completed publications receive a bounded three-second settling allowance for their final read and scheduling writes.
5. **Coming soon consistency.** Filtering, sorting and card presentation use the same selected upcoming release. A previously available rental date no longer hides or misorders an upcoming subscription launch. Available and general browsing retain their availability behaviour; Reported selects the reported window.
6. **Source-specific health and retries.** Atomic service-only health writes retain per-source attempts, successes, failures and counters. The existing private owner endpoint detects a stale job, stale catalogue, stale WTS feed, and individual source failures. Unexpected feed markup is a failed source check rather than a successful empty feed. Recent-report availability failures retry after fifteen minutes; unresolved identity evidence retains its daily delay. The daily title lookup retains its ten-minute temporary-failure retry.

The identity rules, primary listed-date priority, calendar UIDs and tentative-date handling remain in force. No new service, UI section, notification system, review queue or full-catalogue crawl was added.

## Database rollout

Migration: `20261025192757_source_refresh_reliability.sql`, applied to A-List (`xuxshqjckbrvxiwzclfi`). The local filename matches the version recorded by Supabase. The migration adds lookup deadlines and source health, two service-only RPCs, and preserves primary retry fields in the existing guarded WTS publication RPC. It makes the current feed due once so the new health state is established by a real check rather than an invented timestamp.

Permission checks verified that anonymous users cannot invoke lookup selection, ordinary members cannot write source health, and the background service can execute the functions. Account, membership and feed-token digests matched before and after migration. Existing RLS and publication identity/version guards are retained.

Security advisor results were unchanged. The performance advisor retains the three historical unindexed review-table foreign keys and reports the newly created lookup index as unused on the current small dataset; this is informational rather than a failed check.

## Validation

- **102 tests pass.** TypeScript, ESLint without warnings, the production webpack build and `git diff --check` pass.
- Regression coverage includes independent refreshes and positive WTS withdrawals during a primary outage; unexpected/native-subject validation; already-dated missing-window lookups; cached scheduling fairness; due-row rotation and function permissions; stable calendar content revisions; source health, malformed feeds and transient backoff; filter-specific dates and order; and publication settling after a source deadline.
- A real bounded refresh returned `failed: 0`, with healthy source diagnostics. Six initial lookup candidates became four after a cached entry and one actual lookup advanced their deadlines. The successful verification pass took about 4.6 seconds.
- Six real saved entries, account settings and feed tokens were preserved. The personal feed retained all five existing event UIDs and all five alarms, including tentative handling.
- The built application passed a signed-in HTTP round trip locally using a disposable confirmed account, then passed the same flow on production: paginated Coming soon results ordered by their actual future date, private library save/remove, automatic anonymous calendar events and alarms, conditional ETag response, cross-origin mutation rejection, and denial of owner health access to an ordinary member.
- Both disposable accounts were revoked and deleted after their tests. Existing account/library digests matched afterward, and the deleted fixtures' feed links returned 404. No emails were sent.
- The public production smoke suite also passed. Its cookie-based optional round trip was skipped; the separate disposable-account suite above supplied actual signed-in coverage.
- A signed-in visual/browser check was unavailable because Computer Use was blocked on the browser's current URL. No attempt was made to bypass that restriction; browser-rendered visual behaviour is not claimed as verified.

## Production deployment

Final deployment: `dpl_819fxFtnP7mV9sWz6w8R9SNN6L5X`.

- [Live application](https://a-list-nine.vercel.app)
- [Immutable build](https://a-list-njaluycag-terence-yebuahs-projects.vercel.app)

The exact build reached READY with domains withheld, passed an authenticated Vercel HTTP check, and was promoted to the existing production domain. The production checks above then passed. The immediate error/fatal log scan returned zero records. The local test server was stopped.

This is a CLI source deployment from the shared tested working tree based on `bd17846773ed96be3b372b4e834728baae3d0b4a`; no commit or Git push was created.
