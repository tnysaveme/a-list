# Local motion measurements — 2026-10-28

Reference: commit `c1de7fc` plus the existing working tree and this implementation. macOS, headless Chromium **156.0.8078.4**, Playwright **1.64.1**, isolated production fixture build. No production accounts or library data were mutated. These samples are not field INP measurements or physical-device FPS certification.

## Functional baseline

Before editing application code, all **15 existing browser tests passed** in 42.5 seconds. The first sandboxed attempt failed to download Google Fonts; the network-enabled isolated run succeeded. The test harness copies an allowlist of source files, excludes `.env.local`, and uses disposable loopback providers.

## Save acknowledgment

The new regression holds membership confirmation and then holds the ancillary library reload. It verifies that the affected card exposes `aria-busy` and a Saving label before confirmation, remains unsaved while pending, and reaches confirmed saved state before the listing reload is released.

- Click → pending DOM state: **3.2ms** in the first complete functional pass; **2.0ms** in the final pass.
- The observer measures a DOM update, not pixels painted, end-to-end request time, or INP.
- An initial baseline equivalent is unavailable: the original collection had no local pending state.

## Bounded rendering sample

The same five-second workload was sampled before and after the collection extraction: **100 synthetic card records**, opening details and its repeated 1.5-second pending polling, **4× CPU slowdown**. The synthetic init payload expands only the presentation workload; the other tests verify real fixture API/data behavior. `requestAnimationFrame` samples callback gaps and a PerformanceObserver records tasks over the browser's long-task threshold.

| Local sample | Before collection isolation | After collection isolation |
|---|---:|---:|
| Observed frame intervals | 293 | 298 |
| Median frame gap | 16.7ms | 16.7ms |
| 95th-percentile frame gap | 16.8ms | 16.8ms |
| Largest frame gap | 133.2ms | 66.6ms |
| Observed long tasks | One at 77ms | None |

This is one sample per revision, so scheduler/cache noise can affect the peaks. It supports the targeted collection boundary and shared date formatter; it does not establish a reliable percentage improvement or prove that every frame now meets 16.7ms. The remaining 66.6ms peak must not be described as perfect 60fps. No broad virtualization or per-card memoization was added.

The first sample was collected after the continuity/feedback fixes and before extraction, not before all application changes. No initial full-app frame trace exists.

## Final checks

- `npm test`: **187 passed**.
- `npm run test:e2e`: **23 passed**, including the synthetic motion sample, in 50.5 seconds. The run built the fixture in production mode.
- Typecheck and lint passed after extraction. Scoped Prettier and `git diff --check` passed.
- New browser regressions cover delayed confirmation/reconciliation, populated-filter pending and failure states, loaded-range preservation for library/catalogue, failed later pages, focus/timer refresh, native dialog exit retention, reduced motion, menu reversal, menu-to-search focus and stationary poster presses.
- Rendered 375px mobile library/dialog and 1280px desktop captures were visually inspected. Existing navbar tests cover multiple narrow breakpoints and existing appearance tests cover light/dark/system behavior.

## Remaining validation

Safari/WebKit was not installed; no physical iPhone/iPad or touch gesture run was performed. Field p75 INP, a full CPU flame chart, power-mode comparisons, cold/warm real poster downloads, and a statistically repeated performance baseline remain unmeasured. The initially inspected personal Helium browser reported Energy Saver on; the isolated headless samples do not emulate that setting.
