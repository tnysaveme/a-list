# Startup and request optimization release — October 28, 2026

This implements the first three priority rows in the follow-up optimization audit: startup correctness, failed-filter recovery, and request/cache/polling behavior. The later mobile font, field telemetry and large-library rendering recommendations remain separate.

## Result

- Returning users receive their saved library in the initial authenticated HTML. Discover's catalogue and artwork are loaded when requested rather than before initialization chooses Library.
- Server bootstrap shares the existing initialization behavior with the init API and runs account/library reads concurrently. Its 3.5-second deadline falls back to a usable loading/retry state. Normal startup avoids the browser's former init and catalogue requests. No schema or environment change is needed.
- Initial selection and explicit initialization retries cannot override an existing navigation/filter intent. Controls that depend on the unresolved library are disabled until ready.
- Failed current filter/sort requests restore the last successful applied query and its query reference, retaining the prior films. A superseded failure cannot roll back a newer choice. Retry repeats the failed query, page append, or range refresh as appropriate.
- Interactive reads time out after 10 seconds; search allows 15 seconds; writes allow 30 seconds. HTML outage responses produce actionable copy. Caller cancellation remains distinct from a deadline. There is no automatic write retry; membership reconciliation still handles a write whose response was lost or timed out.
- A selection that leaves the current section/query unchanged avoids a new request. Each mounted section can reuse its retained successful query for 60 seconds. Mutation/metadata updates invalidate freshness; private data is not shared in a global browser cache. Pagination and forced background refresh retain their existing behavior.
- Details polling pauses between requests while hidden or offline, resumes with one current read, and cleans up when closed. An in-flight request may finish after the page becomes hidden. The existing 20-poll cap remains.
- Loaded-range bookkeeping is committed together with successful data, so a skipped content transition cannot prematurely change the refresh extent. Reselecting Library still exits selection mode without fetching.

## Verification

All 37 browser scenarios were verified against the final application source: the full run passed 36 scenarios, and the independent initialization-retry scenario passed after restoring the fixture database for its unrelated catalogue request. Only that test fixture changed after staging; the deployed application source is the verified source.

The project check passes formatting, lint, TypeScript, 191 unit/data tests and the backup restore fixture. Client API tests distinguish caller aborts/deadlines, handle non-JSON outages, and prove that a committed write with a timed-out response is reconciled without issuing the write twice.

Browser checks cover original saves, Undo, membership-aware fallbacks, source delays, pagination/refresh anchoring, dialogs/search, themes, mobile/tablet layouts, reduced motion and native/fallback animation timing. New checks cover first-HTML saved content, no duplicate bootstrap requests, late initialization intent, retry intent, failed query restoration/retry, cached section round trips, hidden/offline details polling, and a real 10-second stalled-read deadline.

The startup fixture requires bootstrap-attributable layout shift below 0.02 and records zero browser init/catalogue requests before entering Discover. It is a controlled Chromium result, not production p75 CLS or network latency. The old audit's controlled slow-init run shifted results by 124px and recorded approximately 0.095 CLS.

Artifacts: `outputs/review/optimized-library-startup.png`, the existing motion captures, and the E2E regression source. The static Impeccable scan is clean with the existing configuration. Fixed the targeted behavior problems; added no suppressions; retained the existing narrow Arial fallback exception and approved typography.

## Deployment

- Project/team: `prj_eV35BkjAL547jBP5t73vsI2fsmSC` / `team_QRbcE5QYR9UroFoG1dF2RVnz`.
- Target: production, staged without assigning domains, then promote the tested build.
- Final build: `dpl_JEG8EyLEnRhSn3yTJWA5LRmftsF4`, https://a-list-qbhz0kp3p-terence-yebuahs-projects.vercel.app.
- Rollback: `dpl_5S2XUQVDroz44PPsgCCNjn4JJZp6`, https://a-list-hl0f1uks0-terence-yebuahs-projects.vercel.app.
- Source: reviewed working tree based on `c1de7fc`; no commit or push performed. Existing unrelated backend work was preserved.
- Framework/runtime: Next.js 16.4.3 / Node 24.

Authenticated interaction checks use disposable local providers. The last supplied production browser context was the login screen; authenticated production interactions were not exercised for this release. No production saves/removals were performed. Physical iPhone/Safari testing and real-user performance measurement remain outstanding. Final live-domain resolution and endpoint/error checks are recorded below.

## Final release checks

- Production / READY: https://a-list-nine.vercel.app resolves to `dpl_JEG8EyLEnRhSn3yTJWA5LRmftsF4`.
- Staged login and privacy: HTTP 200.
- Staged and live readiness: HTTP 200, healthy.
- Staged private health: HTTP 401, Sign in required.
- Remote production build repeated the project check and build successfully.
- The bounded runtime error/fatal scan through 22:15:33 UTC returned zero records. This is a brief release observation, not ongoing monitoring or a frontend error audit.
- No environment, schema, scheduler or new backend resource changes were required.
