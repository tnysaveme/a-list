# A-List performance and motion audit

Audited 2026-10-28 against commit `c1de7fc` plus the existing working tree. Status: **core implementation complete, verified and deployed to production**. Existing unrelated application changes were left intact. See [implementation results](implementation-results.md), [measurements](baseline-results.md) and the [production release record](../docs/motion-production-2026-10-28.md), including its separate source-sync readiness warning.

The main weakness is continuity and feedback. Current CSS is already cheap and reasonably timed; replacing the animation library or adding springs everywhere is not justified. Make actions acknowledge input immediately, complete overlay lifecycles, and prevent background updates from moving the user's place.

## Evidence and limits

- Read production components, CSS, motion tokens, data hooks, pagination and mutation reconciliation; consulted Impeccable and improve-animations.
- Inspected the authenticated deployed desktop library and opened/closed a movie dialog in Helium. This verifies the rendered surface, not that the deployment matches every local change. No library/account mutations were performed.
- Helium initially reported **Energy Saver is on**. It is a possible environmental contributor, not an established cause. No browser settings were changed.
- No frame trace, React Profiler recording, CPU-throttled run, mobile gesture test, or measured INP was collected. Findings below describe confirmed code behavior; rendering cost remains a hypothesis until plan 000 measures it.
- Impeccable source detector scanned `app`, `components`, `hooks`, and `tokens.css`. Its sole result was `overused-font` at `app/globals.css:171` (Arial). Rejected for this audit: later body rules override it with the approved font token. No font redesign is needed. A source detector is not a runtime performance test.
- This is a scoped performance/motion audit, not a complete accessibility, theme or responsive certification. No synthetic overall health score is assigned.

## Prioritized findings

| # | Priority | Category | Location | Confirmed behavior / impact | Plan |
|---|---|---|---|---|---|
| 1 | P1 / HIGH | Responsiveness | `hooks/use-library.ts:77-99`; `app/afterlight.tsx:523-542`; `lib/library-batch.ts:37-61` | Saving one film globally disables save controls without a local pending icon. State confirmation waits for membership read, write, reread and library reload. Feels stalled even without dropped frames. | 001 |
| 2 | P1 / HIGH | Continuity | `app/afterlight.tsx:137-150`; `hooks/use-catalogue.ts:74-79`; `hooks/use-library.ts:60-65` | Focus/timer refresh replaces appended pages with page zero. A longer collection can shrink and disturb scroll position. | 004 |
| 3 | P2 / MEDIUM | Overlay lifecycle | `components/dialog.tsx:15-37`; `app/afterlight.css:917-922`; `components/app-header.css:139-140,209` | Dialog fades in, backdrop appears instantly, and both disappear on unmount. Search/menu likewise have entry-only motion. | 002 |
| 4 | P2 / MEDIUM | Press consistency | `app/afterlight.css:97-100,209-211`; `components/movie-card-poster.tsx:42-75` | Global active translation moves every button, including the poster image. Only some control families interpolate it; filters/layout/posters snap. | 003 |
| 5 | P2 / MEDIUM | Pending state | `app/afterlight.tsx:182-192,457-488` | Selected filter/sort changes before its results arrive; existing results show no pending explanation. | 001 |
| 6 | Profiling candidate | Rendering | `hooks/use-movie-details.ts:16-34`; `app/afterlight.tsx:488-585` | Details polling updates parent state every 1.5s, up to 20 times, rerunning the entire collection map. Cost grows with loaded pages; frame impact unmeasured. | 005, conditional |
| 7 | P3 / LOW | Image resource choice | `app/afterlight.tsx:501-505`; `app/afterlight.css:1410-1422,1462-1465,1497-1498` | Image sizes use 620/1000px cutoffs while layout uses 640/896px and a later five-column breakpoint. Resource selection can undershoot or overfetch. Not proof of animation jank. | 005 |

## Grounded finishing opportunities

1. Toast and selection bar currently mount/unmount abruptly (`app/afterlight.tsx:635-672`, `app/afterlight.css:753-808`). After core fixes, give their wrappers a reversible 180ms opacity entry / 120ms exit. Keep Undo immediately usable, preserve the existing 6.5s/10s lifetime, and never replay motion when the count/message changes.
2. Synopsis toggles a three-line clamp and rotates its chevron instantly (`components/movie-details.tsx:233-253`, `components/movie-details.css:264-284`). First verify a visible jump with a genuinely long synopsis. Start with 120ms chevron rotation using the existing ease-out; stabilize dialog position/scroll before considering any measured-height animation. Do not animate every card or add a generic height tween.
3. Reduced motion currently removes opacity feedback too, and only slows infinite spinners (`app/afterlight.css:1544-1563`, `components/app-header.css:323-334`). Preserve brief opacity feedback, remove spatial motion, and use static pending icon plus text under reduced motion. Treat this as refinement, not a claimed WCAG failure.

## Execution order

| Plan | Work | Priority | Status | Dependency |
|---|---|---|---|---|
| [000](000-measure-the-baseline.md) | Capture interaction/rendering baseline | Required | Local samples captured; physical devices/field profiling pending | None |
| [001](001-immediate-action-feedback.md) | Local save feedback and truthful collection pending state | P1 | DONE | 000 |
| [002](002-complete-overlay-lifecycles.md) | Complete dialog/menu/search open and close behavior | P2 | DONE | 000 |
| [003](003-unify-press-feedback.md) | Consistent controls and stationary poster artwork | P2 | DONE | 000 |
| [004](004-preserve-loaded-pages.md) | Refresh without collapsing loaded pages | P1 | DONE | 000; coordinate shared hooks with 001 |
| [005](005-isolate-rendering-and-size-posters.md) | Measured rendering isolation and accurate image sizes | Conditional / P3 | DONE: collection boundary and formatter reuse; extra per-card memo/virtualization unnecessary | 000; reprofile after 001–004 |

Run 001 and 004 first for responsiveness, then 002 and 003 for feel. Execute serially where files overlap. Finish with the small opportunities above and an Impeccable polish pass. Do not parallel-edit `app/afterlight.tsx` or the shared hooks.

## Preserve

The approved `design.md` calls for quiet functional UI, no decorative card entrances, no artwork zoom, and opacity dialog motion. Keep that character. Keep current strong easing `cubic-bezier(0.16, 1, 0.3, 1)` and 120/180ms tokens; they are not a diagnosed problem. Search already owns its typing state separately; keep it isolated. Preserve stable poster aspect ratios, lazy responsive images, 25-item pagination, stale-request guards, source certainty, reconciliation, Undo, and focus behavior.

## Release acceptance

- Save and filter actions visibly acknowledge input within 100ms on the agreed reference device, even with a 1s network delay. Pending is distinct from confirmed success.
- Rapid open/close/reopen never flashes, restarts from a visibly wrong endpoint, leaves a backdrop, or loses keyboard focus. Dialog panel and backdrop enter/exit together.
- After loading at least three pages, focus/timer refresh preserves the loaded extent and the top visible film's viewport position unless that film was legitimately removed.
- Target p75 interaction latency at or below 200ms when field measurement exists; use local event/paint traces as local evidence only. At 60Hz, inspect work against a 16.7ms frame budget and investigate interaction-attributable tasks above 50ms. These are targets, not current measurements.
- Verify desktop Chromium plus Safari/iOS, mobile widths 320/375/414px and tablet 768px, light/dark, keyboard, reduced motion, slow API, errors, and repeated interaction. Record hardware, refresh rate and power mode so comparisons are meaningful.
- Local implementation verification: 187 unit/data tests, 23 isolated Chromium browser tests, typecheck, lint, scoped formatting and whitespace checks passed. The browser suite built an isolated production fixture. The original audit itself did not change source or run builds.
