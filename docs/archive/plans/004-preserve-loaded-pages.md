# 004 — Preserve collection extent and scroll during refresh

- **Status**: DONE — atomic range refresh, scroll anchoring and failure retention verified for library/catalogue
- **Commit**: c1de7fc, existing working tree included
- **Severity**: HIGH
- **Category**: Continuity / pagination correctness
- **Estimated scope**: catalogue/library hooks, AList refresh calls, fixture regressions

## Problem

`app/afterlight.tsx:140-144` refreshes page zero on focus/timer:

```tsx
view === 'library'
  ? await loadLibrary(0, false, { sort, filter }, controller.signal)
  : await loadCatalogue({ sort, filter }, false, controller.signal);
```

The hooks then replace all displayed items (`hooks/use-library.ts:60-63`, `hooks/use-catalogue.ts:74-77`):

```tsx
if (!append) return data.movies;
```

This collapses an appended collection. Mutation reconciliation and details completion also call `loadLibrary()` and need the same deliberate refresh behavior.

## Target

Separate user-requested view replacement from refresh of the current loaded extent. Refresh updates existing loaded pages atomically, retains pagination reach, and restores the top visible film's viewport coordinate after legitimate data/order changes. Filter/sort changes still reset to the first page. No animation is used to disguise a collection collapsing.

## Repo conventions to follow

Server page size is 25 (`lib/pagination.ts:27`); catalogue pages cap at 50 (`lib/catalogue-view.ts:61`). `nextOffset` is server-owned. Preserve catalogue memory membership overlays, fallback provenance, cancellation, library request generation, and the existing refresh gate.

## Steps

1. Add explicit load reasons: replace, append, refresh. Track the query identity and loaded page range separately for each collection. Replace resets extent only for a new view/filter/sort or explicit reset.
2. For refresh, fetch offsets covering the already loaded extent using the current API page size. Use one refresh generation and abort scope, accumulate responses, then publish one merged collection. Reuse existing guards so a filter change invalidates old refresh work. Bound concurrency to two requests; do not generate one request per film.
3. Deduplicate by film ID while preserving refreshed server order. Use the last successfully refreshed page's `nextOffset`; handle fewer records and true end-of-list. Commit only a coherent successful range; on partial failure retain the prior list and surface retryable stale/error status. Do not append old removed records to hide a genuine deletion.
4. Before publish, capture a visible anchor film ID and its viewport offset. After layout, restore its offset with one read/write pair. If that film was removed, use the nearest surviving visible neighbor. Use immediate scroll restoration (`behavior: auto`), including under reduced motion; avoid per-frame measurement loops.
5. Use the same extent-preserving operation for post-mutation listing reconciliation and saved-details completion. Coordinate with plan 001's pending state, retaining membership overlays and not replacing newly confirmed membership with an older response.
6. Keep append paging operational during/after refresh; serialize or invalidate conflicting operations explicitly. Page return focus must not request duplicate appends or shrink the list.

## Boundaries

No backend page-size expansion, infinite-scroll rewrite, virtualization, schema changes or altered release ordering. Do not keep removed films indefinitely. Read installed Next docs before editing. Refresh drifted excerpts before implementing.

## Verification

- **Mechanical**: typecheck/lint, unit/data tests and isolated E2E. Add fixture cases for 75+ rows, three loaded pages, focus refresh, timer refresh, mutation refresh, changed ordering, genuine deletion, partial refresh failure, duplicate IDs and filter change during refresh.
- **Feel check**: scroll into page three, leave/return to the tab and wait for background refresh. Loaded extent and anchor position persist. Repeat after saving/removing, in grid/list and narrow viewport. Inspect for forced-layout loops and unintended smooth scroll.
- **Done when**: every refresh source preserves loaded reach and the user's visible place except for genuine data removal, with correct next-page offsets and no stale response replacing the chosen filter.
