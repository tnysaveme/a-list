# 000 — Measure the actual bottleneck

- **Status**: PARTIAL — functional baseline and local CPU samples captured; physical-device, Safari and field profiling remain
- **Commit**: c1de7fc, existing working tree included
- **Severity**: Required prerequisite
- **Category**: Performance
- **Estimated scope**: measurement only; save evidence in `plans/`

## Problem

Code confirms abrupt lifecycles and network-dependent feedback, but does not establish dropped frames. In `hooks/use-movie-details.ts:21-34`, polling calls `setMovie` and waits 1500ms before another request; `app/afterlight.tsx:488` maps all displayed movies in the same parent. Runtime cost depends on collection size and device.

```tsx
setMovie((current) => (current?.id === id ? data.movie : current));
// app/afterlight.tsx
{movies.map((m, index) => {
```

## Target

A reproducible before/after record for five flows: search, save, filter/sort, dialog, and paginated refresh. Record event-to-first-feedback separately from network-to-confirmation, and frame/render cost separately from both. Do not use development compilation time as production performance evidence.

## Repo conventions to follow

`tests/e2e/library.spec.ts` and `tests/e2e/providers.ts` provide disposable authenticated fixture accounts and deterministic providers. `scripts/run-e2e.mjs` builds an isolated copy with fixture configuration; it deliberately avoids `.env.local`. Use that harness for mutating test actions. Read the installed Next guide under `node_modules/next/dist/docs/` before source instrumentation.

## Steps

1. Record device, OS, browser/version, display refresh rate, viewport, power mode, and exact source revision. Compare with the same conditions after changes. Helium initially reported Energy Saver on; request any necessary user setting change and do not silently change it.
2. In an implementation session, run the existing isolated fixture workflow (`npm run test:e2e`) to establish functional baseline. Use the fixture environment for saves/removals. Do not modify the real library for benchmarks.
3. Capture browser Performance traces for opening/closing details, 10 repeated menu toggles, typing/navigating search, one save with API delay, and filter changes with deliberately reversed response order. Capture React render profiling using a supported profiling setup if needed; label development/profiling overhead.
4. Repeat at 25 and at least 100 fixture cards, warm and cold image caches, and under 4x CPU slowdown. Capture normal-power behavior separately from Energy Saver behavior. Do not infer physical-device performance from desktop throttling alone.
5. Load three pages, note the top visible film and its viewport coordinate, then trigger focus/visibility refresh. Record loaded count, next offset, scroll position and duplicates before/after.
6. Write `plans/baseline-results.md`: first visible feedback time, API confirmation time, longest main-thread task, animation frame gaps, collection render count during detail polling, image bytes, and any layout shifts. Mark unavailable metrics explicitly.

## Boundaries

No framework upgrades, new motion libraries, production mutations, credential exports or application optimizations in this plan. A trace may contain private data; keep evidence local and avoid recording secret calendar URLs. If source has drifted, refresh the cited excerpts before executing dependent plans.

## Verification

- **Mechanical**: baseline fixture flows pass; each trace has conditions and revision attached.
- **Feel check**: normal speed followed by 10% animation playback; compare initial response, motion continuity, and response to reversal. Test keyboard and reduced motion separately.
- **Done when**: evidence clearly distinguishes slow feedback, motion discontinuity, and actual main-thread/frame bottlenecks, and identifies whether plan 005's rendering extraction is warranted.
