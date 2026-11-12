# Saved-state consistency — 5 November 2026

Saving a film keeps immediate pending feedback, then publishes confirmed membership to details, Discover, and retained search results before releasing the pending overlay. Removal and watched mutations use the same handoff. Pending removals keep their removal control until confirmation, rather than briefly appearing as a save action.

A metadata poll started after a save could previously replace confirmed membership with an older snapshot. Contradictory metadata now triggers a dedicated account-membership read. A newer local mutation wins if it completes while that check is pending. A failed verification preserves the last confirmed state and displays recovery feedback. Successful verification can still accept changes made in another tab. Reopening a film uses its latest confirmed local membership while details load.

Fresh detail responses prune removed films and films belonging to the other watched section from retained library rows. They also update retained search badges, preventing a dialog and its search result from disagreeing. Library reads capture a personal-state generation; a read crossing a confirmed change is retried before committing rows and totals, with a bounded retry limit. When pagination overlaps a removal, the loaded range is rebuilt because offsets have shifted; retrying only the next page could skip a film. Cancelled JSON/blob reads cannot publish successful results, and cancelled catalogue reads cannot update the metadata cache.

The mutation protocol, write reconciliation, partial-batch behavior, pagination, and Undo remain server-confirmed. This change adds no dependencies or database migrations. It does not repeat ambiguous writes.

## Validation

Regression scenarios cover every intermediate save-label handoff, metadata polling after save and watched updates, externally removed membership, older library responses, stale metadata after removal, unavailable conflict verification, retained search badges, and cancellation during body consumption. Existing scenarios cover rejected writes, lost responses, partial removal, Undo with watched dates, pagination, and navigation races. Browser tests use disposable local services with the real application API handlers and no production credentials.

- `npm run check` passed formatting, lint, strict TypeScript, all **257 unit/database tests**, and the encrypted-backup restore fixture.
- The full production-build browser suite passed **123 scenarios**. Both the retained search-badge and overlapping-pagination regressions also passed independently after their fixes.
- The Vercel upload manifest was checked against local file hashes and excludes local credentials, environment files, browser output, and build artifacts.

## Deployment

Production deployment `dpl_ANaqgh83VLCKsyZSyavVRrbBBGTu` is READY and serves [the canonical A-list domain](https://a-list-nine.vercel.app). The production build repeated the checks successfully. Live HTTP checks returned 200 for sign-in, confirmation, privacy, and both auth photographs; unauthenticated membership returned 401 with `no-store`. The live sign-in form and optimized artwork loaded without browser exceptions. The deployment's runtime error query returned zero records at verification time. Authenticated mutation behavior was verified through disposable browser fixtures rather than changing a production user's library.
