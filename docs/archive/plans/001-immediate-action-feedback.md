# 001 — Acknowledge saves and collection changes immediately

- **Status**: DONE — serialized writes retained; affected-film feedback and independent reconciliation verified
- **Commit**: c1de7fc, existing working tree included
- **Severity**: HIGH
- **Category**: Responsiveness / state indication
- **Estimated scope**: `app/afterlight.tsx`, `hooks/use-library.ts`, collection CSS, meaningful fixture tests

## Problem

`hooks/use-library.ts:79-99` globally locks mutations and awaits a full reload before returning. `app/afterlight.tsx:523-542` disables all save buttons and leaves the clicked button's icon unchanged. `lib/library-batch.ts:37-61` performs read/write/reread intentionally to resolve uncertain writes.

```tsx
// hooks/use-library.ts
if (mutating.current) return null;
mutating.current = true;
setBusy(true);
// finally
await loadLibrary();
mutating.current = false;
setBusy(false);
// app/afterlight.tsx
disabled={busy || !ready}
```

Filter/sort handlers at `app/afterlight.tsx:182-192` immediately select the new control, but loading feedback at `:457-461` only applies to empty collections.

## Target

Show a distinct **Saving…** state on the affected film within 100ms, independent of network time. Keep pending distinct from confirmed saved membership. For filters/sorts, immediately expose `aria-busy` on the collection and a reserved-height **Updating films…** status. Preserve old results until replacement arrives, visibly identified as updating. Do not add grid entrance choreography or delay keyboard interactions.

Reuse `--dur-short: 120ms`, `--dur-medium: 180ms`, and existing `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`. Pending status may fade with 120ms opacity; no whole-grid dimming or animation per result. Under reduced motion, pending text and a static icon remain sufficient.

## Repo conventions to follow

Keep `applyLibraryBatch` and its confirmed/remaining IDs as the source of truth. It intentionally rereads after lost responses. `tests/library-batch.test.ts` covers partial writes and uncertain outcomes; `tests/e2e/library.spec.ts` already covers save/remove/Undo and out-of-order filter responses. Search input state already belongs to `AppHeader` and stays there.

## Steps

1. Add affected-ID pending state to `useLibrary`, published before the first request and cleared reliably after completion/error. Render a local spinner or static pending icon, `aria-busy`, and a Saving accessible label for those IDs in collection and details controls. Keep mutation serialization initially: do not enable other mutations while the existing single global lock would silently discard them. Unrelated browsing/search remains usable.
2. Separate confirmation from ancillary page refresh. Publish the `applyLibraryBatch` result to catalogue/details before waiting for the full listing refresh. Keep reconciliation failures explicit. Track ancillary refresh independently so a confirmed save does not retain a pending icon solely for a list read.
3. Do not label the film Saved until membership is acknowledged/reconciled. Keep failed or uncertain state retryable, and offer Undo only for confirmed changed IDs. Do not remove the pre/post reads to gain speed.
4. Distinguish initial load, user filter/sort replacement, append and background refresh. Add a collection status slot and `aria-busy` for user-requested replacement; do not flash the initial empty state during a populated refresh. Keep selected-filter/result association clear during the request.
5. Preserve abort/request-generation guards. A slower earlier filter response must never replace the latest selected view. Clear pending state only for the current request; retain visible content on recoverable failures.
6. After correctness, consider per-film concurrent mutations only as a separately scoped change with a queue and tests. It is not required for this plan's first pass.

## Boundaries

No changes to source evidence, release labels, calendar identity, authorization, batch reconciliation or Undo semantics. No new dependencies, artificial waiting, optimistic success claims, or global collection animation. Read installed Next documentation before editing. Refresh stale code excerpts before implementing.

## Verification

- **Mechanical**: `npm run typecheck`, `npm run lint`, `npm test`, then `npm run test:e2e`. Extend existing fixture coverage for 1s delayed membership/list reload, lost write response, partial batch failure, rapid filters and failed filter request. Run these after implementation, not as part of this audit.
- **Feel check**: on slow API, a save instantly explains what is happening and changes to confirmed state without waiting for unrelated list refresh. No second action is silently swallowed. Rapid filter input stays responsive. Keyboard focus never fades/delays; reduced motion retains readable pending state.
- **Done when**: first feedback is within the 100ms target on the baseline device and existing correctness regressions still pass. Document confirmation latency separately.
