# Discover removal feedback — 5 November 2026

Confirmed removals use the shared removal notice and Undo in both Discover and Library. Discover keeps the film visible with its unsaved control; Library removes its row.

A removal already completed elsewhere was silent: the batch result contained a completed ID but no changed IDs, so the film dialog stayed open and no notice was produced. The UI now closes details for every confirmed completed removal and acknowledges an already-absent film with “is no longer in your library.” Undo remains limited to changes made by this action. Library focus recovery also uses confirmed completed IDs.

Rejected removals keep details open and show the error inside the dialog, where it is visible above the native modal backdrop. Retrying clears the old error and can complete normally.

Browser checks cover an actual viewport-visible notice and clickable Undo on a deeply scrolled Discover page in desktop grid and narrow dark list layouts, already-absent films in both sections, failed removals with a successful retry, watched-date restoration, partial batches, and existing removal animations.

`npm run check` passed formatting, lint, TypeScript, all 257 unit/database tests, and the encrypted-backup restore fixture. All 13 targeted browser scenarios passed. The desktop and mobile notification screenshots were inspected.

Production deployment `dpl_6Ywf9bPEBUxiFsoyNPpLcqAbPk5G` is READY on [A-list](https://a-list-nine.vercel.app). The canonical domain was verified against that deployment ID. Live sign-in, confirmation, privacy, and artwork checks passed; private membership requests still require authentication. The browser reported no exceptions, and the deployment runtime error query returned zero records at verification time. Authenticated removals were exercised against disposable fixtures with the real API handlers rather than changing a production user's library.
