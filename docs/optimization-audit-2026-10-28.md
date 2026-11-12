# A-List: follow-up optimization audit

October 28, 2026. Current working tree and production-build browser fixtures after the section-motion release. This audit changes no application code or production deployment. Findings describe current behavior; authorship and regression attribution are not established.

## Implementation update

The startup, failed-query, request-deadline and repeated-navigation/polling findings (1–4) are implemented in the [startup/request release](optimization-release-2026-10-28.md). The findings below remain the original baseline evidence; large-library rendering, mobile sort text and field telemetry remain follow-up work.

## Decision

Fix startup intent and failed-filter consistency first. Then bound reads, remove redundant requests, and add frontend measurements. Large-library rendering is a measured growth concern, rather than a reason to add virtualization to today's small library.

Seven findings: one P1, six P2; no P0 found in the exercised flows. P1 means fix before the next release; P2 means schedule in the next optimization pass. Recommendations have not been implemented by this audit.

## Implementation integrity and health

The interface expresses the existing A-List system consistently. The static Impeccable detector returned no findings across app/components/hooks, motion code and tokens with the existing project configuration. The narrow inherited Arial fallback exception remains; no new suppression was added. Typography is intentionally unchanged.

| Dimension                | Provisional score | Evidence/limit                                                                                          |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- |
| Accessibility            | 3/4               | Existing keyboard/focus/reduced-motion tests; no full screen-reader or pixel-contrast conformance audit |
| Performance              | 2/4               | Redundant loading and measurable rendering cost at 500 loaded cards                                     |
| Theming                  | 3/4               | Existing light/dark and before-hydration appearance checks; not every possible surface/state sampled    |
| Responsive behavior      | 3/4               | Mobile/tablet layouts verified; 14px sort control needs an iOS focus check                              |
| Implementation integrity | 4/4               | Coherent shared controls/tokens; static detector clean                                                  |
| Total                    | 15/20 — Good      | Scoped engineering assessment, not field-performance or WCAG certification                              |

## 1. [P1] Startup can choose the wrong section and override a user's choice

Location: `app/afterlight.tsx:44`, `app/afterlight.tsx:124`, `app/page.tsx:13`.
Category: performance / implementation integrity.

The server sends a Discover snapshot. Hydration starts both init and catalogue requests. When init resolves with saved films, it unconditionally selects Library, even after the user explicitly chose Discover.

Reproduced with a controlled 1.5-second init delay at 375×812:

- Heading changes from Discover to Your library.
- Results move from y=451.98 to y=575.98, a 124px displacement.
- The observer records a layout shift of about 0.095 without recent input. This is a fixture result, not production p75 CLS.
- Twenty image-resource requests were recorded for the temporary Discover content in this run. The fixture library has no artwork; this is evidence of avoidable initial requests, not a live-user byte estimate.
- In a separate interaction, clicking Discover before init completed still ended in Your library.

Recommendation: make initial view selection part of server/bootstrap data, with a stable loading shell when necessary. Render the correct first saved page for returning users, and load Discover on demand. At minimum, protect initialization with a user-intent generation so it cannot override navigation. Keep authentication validation and private/no-store responses.

Acceptance: delayed initialization never changes a section the user explicitly selected; bootstrap introduces no collection displacement; saved-library startup does not first fetch unrelated Discover artwork. Compare time to useful saved content before/after, rather than hiding a delay in server rendering. `$impeccable optimize`, then `$impeccable harden`.

## 2. [P2] A failed filter leaves controls describing the wrong results

Location: `app/afterlight.tsx:194`, `hooks/use-library.ts:95`, `hooks/use-library.ts:106`. Audit Discover's fallback path separately when fixing the shared behavior.
Category: implementation integrity / accessible state clarity.

A controlled library filter failure left TBA selected, aria-busy=false, and the previous 25 dated films visible. Retaining films is useful, but the selected control no longer describes the displayed data. The error toast does not repair that persistent mismatch.

Recommendation: preserve immediate pending feedback, but on a current request's failure restore the last successfully applied filter/sort and query reference. Preserve the old films. A superseded failure must not roll back a newer successful choice. Treat requested and applied query state explicitly in both hooks.

Acceptance: after a delayed failed TBA request, control labels/selection agree with the displayed cards; rapid changes and background retries cannot restore an older filter. `$impeccable harden`.

## 3. [P2] Browser requests have no explicit deadline

Location: `lib/client-api.ts:7`, both collection hooks and `hooks/use-film-search.ts:19`.
Category: performance / resilience.

The browser fetch accepts caller cancellation but does not compose a deadline. A stalled read stayed at Updating films with aria-busy=true after the controlled observation window. The observation was 2.2 seconds; the code, rather than that short window, establishes the missing deadline. Browser/network termination can occur later.

Recommendation: define measured deadlines for interactive reads, compose them with caller cancellation, and offer an explicit retry while retaining coherent data. Use endpoint-specific budgets and distinguish timeout from ordinary cancellation. Do not blindly retry writes: a disconnected client does not prove a write failed. Preserve membership reconciliation for uncertain save/remove outcomes. Handle non-JSON error responses with useful recovery copy.

Acceptance: a deliberately nonresponding read exits pending at its configured deadline; retry works; stale data remains consistent; a timed-out write is reconciled before another write is attempted. `$impeccable harden`.

## 4. [P2] Repeated navigation and hidden details polling do unnecessary work

Location: `app/afterlight.tsx:177`, `hooks/use-catalogue.ts:41`, `hooks/use-movie-details.ts:14`.
Category: performance.

Three clicks on the already-selected, unfiltered Library tab caused three new library GETs. Normal section switching also reloads retained data each time. The catalogue page map currently supports fallback rather than avoiding every fresh repeated request.

Details polling is independently bounded to 20 polls, 1.5 seconds apart plus response time, but has no visibility/offline gate. Code verification establishes that it can continue while hidden; this audit did not measure physical-phone background network/battery behavior. The collection's five-minute refresh already skips hidden pages and coalesces focus/visibility events; retain that good behavior.

Recommendation: no-op a selection that leaves the section and applied query unchanged. Reuse recent per-query data with a short freshness window and background revalidation; invalidate personal query caches after mutations and preserve membership epochs. Do not share private library caches across users. Pause details polling while hidden/offline; resume with one current read and backoff, avoiding a catch-up burst.

Acceptance: repeated current-tab clicks produce no new GETs; a recent round trip reuses coherent data; saves invalidate relevant cached views; hiding an open pending detail stops polling and returning resumes safely. `$impeccable optimize`.

## 5. [P2, growth] Hundreds of retained cards make ordinary controls expensive

Location: `components/movie-collection.tsx:52`, collection pagination, `hooks/use-collection-anchor.ts:27`.
Category: performance.

A production-build Chromium diagnostic toggled selection three times at 4× CPU slowdown. The latest repeat recorded:

| Loaded cards | DOM elements | Recorded long tasks | Click to double-rAF sample |
| ------------ | ------------ | ------------------- | -------------------------- |
| 100          | 2,787        | None in this window | 30–65ms                    |
| 500          | 13,187       | 106ms, 131ms, 149ms | 105–151ms                  |

The first repeat similarly recorded 111–161ms tasks at 500 cards. These small controlled samples are not INP percentiles or physical-device results. Artwork was absent from the fixture, so this is not a full poster-decoding/GPU benchmark.

Pagination limits each request, but More films retains every loaded card. Collection-level memoization avoids unrelated polling renders; it does not eliminate mapping/layout when selection or layout changes.

Recommendation: preserve current pagination. At realistic larger sizes, profile offscreen rendering containment with accurate intrinsic size and keyboard/search/scroll-anchor checks. Profile isolated card updates for individual selection changes. Add virtualization only if measured real usage justifies its extra focus, find-in-page and scroll-restoration complexity. Bound refreshed-page work without collapsing the user's loaded range.

Acceptance: repeat the same selection/layout diagnostics at 100 and 500 cards, compare long tasks and rendering cost, and verify selection, browser find, keyboard focus, responsive wrapping and refresh anchoring. Avoid treating headless CPU throttling as a phone GPU test. `$impeccable optimize`.

## 6. [P2] A mobile control still uses 14px input text

Location: `app/afterlight.css:440`.
Category: responsive design.

The 375px render computed Search films at 16px but Sort films at 14px. Small focused form controls can cause iOS zoom; zoom was not reproduced on physical Safari in this audit. This is a platform-verification item, not a demonstrated WCAG violation.

Recommendation: use at least 16px for the sort control under a coarse-pointer media query, with sufficient inline width for labels. Keep user zoom enabled and retain 44px control targets.

Acceptance: check the native picker, focus, dismissal, browser bars, keyboard and landscape safe areas on an iPhone and Android phone. Desktop emulation covers geometry only. `$impeccable adapt`.

## 7. [P2] Frontend field-performance visibility is missing from the repository

Location: root layout, package dependencies, absence of client instrumentation; `.github/workflows/health.yml`.
Category: performance / observability.

The repository has source-health logs and bounded test measurements, but no app-side reporting for LCP, INP, CLS or uncaught browser errors. Source readiness and passing browser flows do not reveal a slow phone or rare interaction stall. Vercel dashboard-only analytics, alert settings and production account telemetry were not queried here; absence in source is not proof the account has none.

Recommendation: inspect existing platform telemetry first. If missing, add a small sampled collector for route bucket, numeric Web Vitals, interaction category, API duration and sanitized error class. Exclude film titles, search terms, account identifiers and calendar URLs. Keep tracking failure independent of the app. Start with p75 mobile/desktop and endpoint p50/p95; choose actual alerts only after a baseline and the user's notification preferences are known.

Use real measurements before attributing symptoms to JavaScript size or replacing a library. [Google's INP guidance](https://web.dev/articles/optimize-inp) explains field data versus lab diagnosis. For first paint, preserve early discovery and high priority for the likely LCP poster; do not make all images eager. [LCP optimization guidance](https://web.dev/articles/optimize-lcp).

Acceptance: verify sample events and values in the selected collector, absence of private content, failure isolation, and one controlled slow-interaction/error event. `$impeccable optimize`.

## Keep these existing optimizations

Responsive image sizes, stable poster aspect ratios, an eager/high-priority leading poster, lazy later artwork, a memoized collection boundary, reused date formatters, abort/stale-response guards, coherent multi-page refresh, focus restoration, reduced motion, and before-paint appearance all remain useful. All 366 snapshot poster URLs use an already-optimized host. The configured four poster providers are covered by Next image optimization.

The cold fixture transferred approximately 198KB across nine scripts (about 642KB decoded). This observation alone does not identify a bundle defect or justify replacing React/Radix. The public snapshot's first 25 records already lack synopsis payload, so projecting them to movieCard saved zero bytes in that sample. Library responses still include synopsis fields (25/25 in the fixture); compacting them can be considered after the higher-impact fixes, with real payload measurements.

## Execution order and verification

1. Fix bootstrap intent and first-content stability.
2. Fix applied/requested filter consistency and bound interactive reads.
3. Add conservative query reuse and visibility-aware polling.
4. Inspect existing telemetry and fill the frontend measurement gap.
5. Address the mobile sort control and verify actual devices.
6. Optimize large-library rendering when realistic usage/measurement warrants it.
7. Finish with `$impeccable polish` and repeat `$impeccable audit` against the same scenarios.

Three isolated diagnostic scenarios passed against a fresh production build with disposable local auth/database/Redis providers. No production library mutations or credentials were used. The fixture deliberately exercised current behavior, so passing these diagnostics does not mean the findings are fixed. Temporary audit tests were removed from the app test suite after capturing evidence. Original application source and the previously passing 30 regression tests were not changed.

Evidence: [runtime measurements](measurements/optimization-audit-2026-10-28.json). Reproducible temporary harness: `outputs/review/optimization-audit.spec.ts`. Startup screenshots: `outputs/review/audit-startup-before-library.png` and `outputs/review/audit-startup-after-library.png`. Detector output was an empty array; no findings were suppressed in this audit.

Limits: the production browser is signed out. This is source review plus an isolated production-build Chromium diagnostic, not authenticated live-network latency, an iPhone/Safari check, a screen-reader audit, or population-level Core Web Vitals. No runtime behavior was changed or deployed by this audit.
