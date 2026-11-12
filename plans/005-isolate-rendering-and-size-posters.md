# 005 — Reduce measured render work and align poster sizes

- **Status**: DONE — targeted collection memo boundary, stable actions/membership, shared formatter and responsive sizes; no extra per-card memo or virtualization
- **Commit**: c1de7fc, existing working tree included
- **Severity**: Profiling candidate; image correction LOW
- **Category**: Performance
- **Estimated scope**: collection/card extraction if warranted, image sizes, targeted verification

## Problem

Details polling sets parent movie state in `hooks/use-movie-details.ts:21-34`; `app/afterlight.tsx:488-585` maps all loaded films in that same component:

```tsx
{movies.map((m, index) => {
  const release = releaseForView(m, filter, currentDay);
  const saved = savedIds.has(m.id);
```

Each parent render repeats release/date work and creates new callbacks. This is confirmed work, but dropped frames are unmeasured. Do not claim memoization is necessary until plan 000 profiles it.

Poster sizes at `app/afterlight.tsx:501-505` also differ from CSS geometry:

```tsx
layout === 'list'
  ? '80px'
  : '(max-width: 620px) 45vw, (max-width: 1000px) 25vw, 220px'
```

CSS uses two, three, four and five columns, with 40rem and 56rem breakpoints (`app/afterlight.css:1410-1422,1462-1465`) plus the later desktop breakpoint around `:1497`.

## Target

If traces show material collection work during details updates, isolate the collection behind stable props so details-only polling does not rerender unrelated cards. A save or selection change updates only relevant card work where data permits. Match poster `sizes` to actual rendered widths, gutters, gaps and breakpoint rules. No layout or visual redesign.

## Repo conventions to follow

Search already keeps transient state in `AppHeader`. Preserve this. `MovieCardPoster` owns its own image loading/error state; `FilmPoster` centralizes provider-aware optimization; collection cards omit heavy synopsis fields. Preserve their responsibilities.

## Steps

1. Reprofile after plans 001–004. If collection rendering is immaterial, record that result and skip extraction. Do not add memo wrappers everywhere based only on component length.
2. If warranted, extract `MovieCollection` and a memoized `MovieCard` from the existing collection map. Pass primitive `saved`, `selected`, `pending` and release display props plus stable actions; avoid a changing global movie object or regenerated Set/Map crossing every boundary. Keep a meaningful comparison: film metadata, releases, saved state and dates must remain fresh.
3. Stabilize actions by passing film ID/current record deliberately; do not freeze closures around old filters, membership or dates. Keep release computations scoped to actual film/filter/day changes. A new US day must still update displayed release status.
4. Correct `sizes` after measuring computed poster boxes at 320, 375, 620, 639, 640, 768, 896, 1000px and the actual five-column breakpoint. Derive `calc()` expressions from the existing container max width, gutters, column count and gap. Use source breakpoint values directly; do not guess a new set of image sizes from this report. Fix list thumbnail sizes too. Inspect DPR 1 and 2 resource choices.
5. Keep lazy loading after the first five, high priority only on the first relevant image, stable 2:3 aspect ratios, and provider allowlist. Consider virtualization only if a later trace proves DOM size is a bottleneck; it is outside this plan.

## Boundaries

No React compiler/framework upgrade, new memoization dependencies, source/date semantic changes, arbitrary list clipping, virtualized focus behavior or image provider migration. Read installed Next documentation before changes. If cited structure has drifted, update this plan first.

## Verification

- **Mechanical**: typecheck/lint, relevant catalogue/release tests and E2E. Verify current membership, release updates and filter changes still repaint correctly. Do not add tests that merely assert component memo wrappers exist.
- **Feel check**: compare the same 25/100-card flows from plan 000. Details-only polling should avoid unrelated collection commits after extraction; verify with render instrumentation. Capture main-thread tasks/frame gaps, not just render counts. In image tools, compare actual box width to selected resource at DPR 1/2, with no blurry 621–639px regression.
- **Done when**: measured work improves without stale UI, or extraction is explicitly skipped with evidence; image resource declarations match actual geometry and loading behavior remains stable.
