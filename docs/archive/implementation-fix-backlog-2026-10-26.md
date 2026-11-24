# Implementation fix backlog — October 26, 2026

> Historical review snapshot. See [implementation status](implementation-status-2026-10-26.md) for completed work and rollout requirements.

Scope: the current working tree, including its pre-existing uncommitted changes. This is a review backlog, not a record of implemented fixes. Priorities reflect the current owner-and-friends use case.

- **P1:** protect release accuracy; address first.
- **P2:** correctness, recovery, setup and regression coverage.
- **P3:** measured performance and maintainability work.
- **Reproduced:** demonstrated locally with isolated fixtures.
- **Code-confirmed:** the relevant behaviour is explicit in the source, but the complete browser/production scenario was not exercised.
- **Improvement:** a gap to address or measure, not an assertion that production is currently failing.

## 1. P1 — Preserve releases when WTS profile verification is inconclusive

**Evidence: reproduced.** `lib/source-verification.ts:29` catches all native profile parser failures and returns `null`. `lib/movie-refresh.ts:151` treats that fulfilled result as a successful withdrawal. An HTTP 200 browser-verification page removed an existing subscription release while the result reported `fresh`, no issues, and WTS success.

**Change:** distinguish verified reports, positively invalidated identity/withdrawn releases, and temporarily unavailable/unparseable evidence. Retain last-good releases on temporary uncertainty, record degraded source health, and schedule the existing transient retry. Apply the distinction to detail refresh, catalogue enrichment and automatic expansion. Keep positive identity-conflict handling intact.

**Acceptance:** challenge pages, incomplete markup and timeouts preserve releases and calendar UIDs; actual withdrawal and positively conflicting identity still remove affected evidence; transient failures cannot be recorded as healthy. Cover fingerprint-backed mappings as well as structured identities.

## 2. P2 — Align library sorting with Discover and displayed dates

**Evidence: reproduced.** `supabase/migrations/20261024184517_verified_report_filters.sql:35` sorts library films by their next release. `lib/catalogue-view.ts:10` selects dates by active view, preferring listed availability in the unfiltered view. Identical films produced opposite ordering across the two views.

**Change:** specify the release-selection and grouping rules for All, Coming soon, Available and Reported, then implement matching SQL and TypeScript behaviour. Make title tie-breaking and pagination deterministic. Add a new migration rather than editing an already applied migration.

**Acceptance:** shared fixtures yield the same ordered IDs and selected dates in SQL and TypeScript, including mixed past/future windows, tentative dates, unknown dates and page boundaries.

## 3. P2 — Make calendar previews respect the reported-date preference

**Evidence: reproduced for Calendar settings; code-confirmed for the horizon banner.** `components/calendar-settings.tsx:171` calls `nextRelease` without `includeRumors`. A reported-only film displayed a November 5 date while the generated feed contained no event. `app/afterlight.tsx:332` also selects its horizon event without the preference, then labels it “On your calendar”.

**Change:** use calendar-eligible releases for calendar-specific previews. Preserve the film's tracked membership while explaining when its only dates are excluded. Have the horizon selection choose an eligible event across the whole library, rather than just skipping one ineligible film on the client. Recompute the preview when the preference changes.

**Acceptance:** preference changes keep previews, counts, downloads and subscription contents consistent, including reported-only films and mixed listed/reported windows.

## 4. P2 — Preserve membership state during catalogue fallback

**Evidence: code-confirmed.** `hooks/use-catalogue.ts:34` replaces API results with the bundled snapshot. The snapshot has no current personal membership; `app/afterlight.tsx:211` can recover saved state only from loaded library rows and other currently retained records. Saved films outside those records can appear unsaved.

**Change:** preserve known membership independently of catalogue metadata. Resolve unknown membership in bounded batches when the service is available; otherwise represent it as unknown rather than definitively unsaved. Avoid replacing usable current data with an older snapshot merely because a refresh failed. Keep fallback provenance visible.

**Acceptance:** with more than 25 saved films, a catalogue failure does not falsely label a known saved film as unsaved or silently replace newer release evidence with the snapshot. Recovery restores current metadata and membership.

## 5. P2 — Display the actual catalogue check time

**Evidence: code-confirmed.** `app/afterlight.tsx:687` labels catalogue freshness using the first visible film's `checkedAt`; an empty page falls back to today. The API knows `catalogue_success_at` but exposes only a stale boolean through the catalogue page contract.

**Change:** return a catalogue-level last-success timestamp and explicit live/fallback provenance. Use those fields for the footer; keep per-film source-check times in film details.

**Acceptance:** sorting, filtering and empty results do not change the claimed catalogue check time. Fallback and never-successful states cannot imply a successful check today.

## 6. P2 — Validate complete mutation payloads

**Evidence: code-confirmed.** `app/api/[...path]/route.ts` silently filters invalid IDs from library batches, so a mixed valid/invalid request can execute a smaller batch successfully. Settings interpret every value other than literal `true`, including a missing value, as `false`.

**Change:** validate each route's complete request before writing. Require a boolean for `includeRumors`, valid action values, and an entirely valid bounded ID array. Return a clear 400 for malformed requests. Keep deliberate compatibility handling for older clients explicit.

**Acceptance:** malformed mixed batches and missing/wrong-type settings values make no changes; valid requests retain existing idempotency and reconciliation behaviour.

## 7. P2 — Prevent lock cleanup failures from replacing successful work

**Evidence: code-confirmed.** `lib/infrastructure.ts:110` awaits Redis lease cleanup in `finally`. A cleanup exception overrides a successfully completed work result, including work that has already committed database changes.

**Change:** report cleanup failure separately while preserving the completed result. Retain token-checked deletion and lease expiry; handle actual work failures without masking their cause.

**Acceptance:** simulate work success followed by Redis deletion failure and verify that the caller receives success. Simulate work failure plus cleanup failure and preserve the original work error. An expired lease must not delete another worker's lock.

## 8. P2 — Keep source-health recording failures separate from source results

**Evidence: code-confirmed.** `lib/data.ts:202` awaits `recordSourceCheck` in a `finally` before saving the refreshed movie. A health-recording exception can discard a valid source result and enter the refresh-failure path. Similar recording calls can abort later ingestion work.

**Change:** define and test how health-write failures are reported without misclassifying successful upstream checks or losing otherwise persistable verified results. Log the health-recording failure distinctly. Preserve required movie-publication consistency.

**Acceptance:** an isolated health-RPC failure cannot claim that a source returned invalid data; successful verified results remain usable when their movie write succeeds. Actual movie-write failures still surface as failures.

## 9. P2 — Validate and document the real environment requirements

**Evidence: code-confirmed.** The README describes Redis, the private salt and service credentials in the context of ingestion/discovery. In practice Redis and `ALIST_KEY_SALT` are required by throttling on normal APIs, sign-in and feeds; normal search/detail paths also use privileged database access.

**Change:** document requirements by capability and validate required configuration centrally with names-only diagnostics. Include canonical origin and job signing keys where relevant. Provide an actionable setup/unavailable response rather than repeated generic request errors. Never expose credential values.

**Acceptance:** a fresh setup follows the documented steps successfully; missing configuration identifies the missing setting without leaking secrets or producing a misleading source outage.

## 10. P2 — Define and test Redis outage behaviour

**Evidence: improvement based on an explicit availability trade-off.** `lib/infrastructure.ts:93` returns 503 when throttling cannot reach Redis. This affects ordinary library requests, sign-in and calendar feeds even when Postgres is available. It is not, by itself, a security defect.

**Change:** decide which operations must remain unavailable and whether any read-only operation can safely use a bounded fallback. Preserve authentication, token authorization and abuse controls. Document the chosen policy, show a useful unavailable state, and test timeout/recovery behaviour. Do not simply disable throttling globally.

**Acceptance:** outage tests demonstrate predictable statuses, bounded waits and automatic recovery for sign-in, reads, mutations, feeds and jobs under the chosen policy.

## 11. P2 — Add automated authenticated browser journeys to CI

**Evidence: improvement.** `.github/workflows/checks.yml` runs formatting, lint, types, fixture/database tests, build and dependency audit. The optional integration scripts exercise HTTP flows, but there is no authenticated browser journey in the release gate.

**Change:** add a deterministic browser suite using isolated fixtures and a test authentication setup. Cover search, details, save, removal, Undo, filters, pagination, calendar preference and expired sessions. Exercise export, token reset and deletion only with disposable test accounts. Keep unit tests credential-free and do not send real sign-in emails from CI.

**Acceptance:** the release gate catches broken browser-to-API wiring and state updates, including delayed/out-of-order responses, without modifying the owner's data.

## 12. P2 — Broaden regression fixtures around provider uncertainty

**Evidence: improvement supported by fix 1 escaping the existing 125-test suite.** Existing source tests are valuable, but transport errors and structured-report cases do not establish safe handling for every fingerprint-backed profile failure.

**Change:** add compact representative fixtures for normal pages, challenge pages with HTTP 200, incomplete profiles, changed headings/attributes, removed dates, conflicting subjects, changed fingerprints, unsupported platforms and malformed feeds. Use shared scenarios across detail refresh, enrichment and expansion where their contracts overlap. Test retained calendar contents as well as parser return values.

**Acceptance:** unknown evidence never certifies a withdrawal or healthy refresh; positive evidence can still update or invalidate the correct film. Fixtures remain deterministic and network-free.

## 13. P2 — Provide recoverable page-level dependency errors

**Evidence: improvement.** There is no application `error.tsx` boundary. `lib/auth.ts:13` also collapses all returned authentication errors into the same null result used for a signed-out visitor.

**Change:** distinguish an invalid/expired session from an unavailable authentication provider, retain appropriate sign-in redirects, and give expected dependency failures a useful retry path. Add page-level error handling without exposing internal exceptions.

**Acceptance:** simulated auth/network outages produce a recoverable unavailable state rather than misleading sign-in churn or an unexplained framework error. Invalid sessions still require sign-in.

## 14. P2 — Make stale jobs and sources operationally visible

**Evidence: improvement.** The project has structured logs and an owner-only health endpoint. Repository rollout notes describe immediate post-release checks rather than established ongoing monitoring; externally configured monitoring was not inspected.

**Change:** verify whether monitoring already exists, then document or add a bounded check of the existing health signals. Alert on missed jobs, sustained source failures and recovery, avoiding repeated notifications for unchanged state. Record how the owner diagnoses and repairs failures. Keep owner health data private.

**Acceptance:** a simulated missed job or sustained source outage is detected within a documented interval, and recovery clears the condition. This backlog does not create an automation or contact anyone.

## 15. P3 — Measure and improve cold search/detail latency

**Evidence: improvement requiring measurement.** `lib/data.ts:186` awaits a movie refresh and later awaits `lookupReleaseReports` at line 279. Those stages can run serially; their source budgets alone can add roughly 16 plus 10 seconds before database/cache overhead. This is a code-path bound, not a production latency measurement.

**Change:** measure warm/cold p50 and p95 for search and details with provider-specific timings. Set a total interactive request budget and propagate cancellation where useful. If measurements exceed that budget, return last-good data promptly and refresh through the existing bounded work mechanisms, with a defined way for the open UI to receive updates.

**Acceptance:** published local/staging measurements show the chosen budget, timeout behaviour and preservation of verified data. Do not assume that returning stale data alone completes the refresh user experience.

## 16. P3 — Measure catalogue cache-miss cost and prevent duplicate rebuilds

**Evidence: code-confirmed cost pattern; impact unmeasured.** `lib/data.ts:51` reads the catalogue snapshot and hydrates all referenced movie rows before returning a page. Concurrent cache misses can repeat that work because this path has no rebuild coalescing.

**Change:** benchmark realistic catalogue sizes and concurrent cache misses. Coalesce rebuilds or serve a last-good cache if justified. Move filtering/pagination to a more targeted query or card projection only when measurements show it is warranted. Keep whole-catalogue search and personal membership correct.

**Acceptance:** measure first-page bytes, query count, memory and latency under cold concurrency; show that an optimization reduces the bottleneck without losing unloaded-film coverage.

## 17. P3 — Tighten API contracts and reduce orchestration complexity

**Evidence: code-confirmed maintainability gap.** `app/afterlight.tsx:48` uses one broad intersection response type for unrelated endpoints. It describes fields as available even when a particular endpoint does not return them. The main client component also coordinates multiple independent state flows.

**Change:** define endpoint-specific request/response contracts and use them consistently in clients and handlers. Extract orchestration where it makes state transitions testable; keep coherent UI pieces together. Centralize shared domain rules with explicit SQL parity fixtures rather than relying on similar-looking implementations.

**Acceptance:** callers cannot assume unrelated response fields exist; targeted tests cover initialization, refresh and mutation reconciliation. Avoid a framework rewrite or component splitting solely to reduce line counts.

## 18. P3 — Clarify active tooling and recovery documentation

**Evidence: code-confirmed tooling ambiguity; operational recovery not verified.** The active database uses Supabase/Postgres, while the checked-in Drizzle config specifies SQLite and points at a file containing TypeScript row contracts. Sites/Vinext/Cloudflare scaffolding also remains outside the active production build/typecheck path.

**Change:** document which files support active preview tooling and which are historical. Remove or quarantine demonstrably unused configuration after checking those workflows; provide separate checks for any supported alternate runtime. Add a concise deployment/recovery runbook covering migration prerequisites, application rollback compatibility, cache invalidation, source repair, and verified backup/restore arrangements. Do not assume hosted backups are absent, and do not test restoration against production.

**Acceptance:** a maintainer can identify the authoritative migration/build path and recover a failed release using documented steps. Retained preview workflows still work; recovery verification uses a disposable environment.

## Execution order and current evidence

1. Fix 1, then fixes 2–8 with their regression tests.
2. Complete setup/outage handling and browser/source coverage in fixes 9–14.
3. Measure before implementing performance changes in fixes 15–16; address fixes 17–18 incrementally alongside related work.

The review baseline passed formatting, lint, TypeScript, 125 tests, the production build and the public HTTP smoke test. The source-loss and sorting bugs were reproduced with isolated fixtures; the calendar preference mismatch was reproduced by rendering Calendar settings and comparing generated feed contents. Other evidence levels are stated per item. Authenticated browser acceptance, device notification delivery, production capacity, external monitor configuration and backup restoration have not been verified by this review.

No application fixes, database changes, deployments, notifications or account mutations were performed while compiling this backlog.
