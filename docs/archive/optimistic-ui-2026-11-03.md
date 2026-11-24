# Optimistic UI — 3 November 2026

Saving a film now shows its checkmark immediately on cards and in film details, and updates the search-result badge while the request is pending. Controls still announce “Saving” and prevent duplicate writes. This is a temporary display overlay: unconfirmed membership is never stored in the catalogue cache. The existing batch reconciliation decides the final state, including when a write commits but its response is lost. Rejected saves restore the add control and show an error inside the film dialog.

The “Include Unconfirmed Dates” switch updates immediately, including its event-count and date previews. A rejected write restores the previous preference. An ambiguous response triggers a read of the saved preference without repeating the write; if that read also fails, the UI restores the previous display and explicitly says the outcome could not be confirmed. Downloading a calendar snapshot is disabled while the preference is saving. A failed ancillary library refresh cannot undo an acknowledged preference write.

Delayed film-detail responses preserve membership confirmed after the read began. Opening film details also removes the exiting search layer immediately so Escape reaches the native dialog during a pending save.

Library totals, paginated collection contents, removals, Undo availability, account deletion, calendar-link resets and WTS release dates remain server-confirmed. Existing layout, filter selection and appearance controls already update locally. There are no new dependencies, database migrations or hosting settings.

## Validation

Browser coverage exercises immediate feedback before network completion, rejected saves, failed membership preflight, stale detail responses, committed writes with lost responses, calendar preference success/rejection/unknown outcomes, and persistence after reload. The fixture suite uses local disposable services and no production credentials.

- `npm run check` passed formatting, lint, strict TypeScript, all **246 tests**, and the encrypted-backup fixture.
- The full production-browser suite passed **72 of 73** scenarios; the remaining test used an ambiguous alert selector that also matched Next.js's route announcer. After correcting that selector, all **11 targeted scenarios** passed, including the remaining scenario. All 73 scenarios are therefore verified across these runs.
- Save feedback appeared in **4.2 ms** in the final local latency sample. This measures the DOM update, not network persistence or a production percentile.
- The pending-save screenshot was inspected at `outputs/review/optimistic-save-pending.png`.

This work remains uncommitted. Its production rollout is recorded in [the copy and release review](copy-release-review-2026-11-03.md).
