# Shelf switching and interaction polish — 2026-11-04

## Findings

The requested shelf was driving the heading, intro, weekly summary and controls before the matching films arrived. A delayed Watched request relabelled the old 24-film watchlist as Watched and removed its weekly summary immediately, moving the grid up 210px. The arriving results then replayed a separate 12px entrance. At 320px the two library introductions wrapped differently, shifting the shelf controls by another 22.39px.

Returning to a previously visited shelf also fetched the first page again, losing the loaded range. An already empty shelf could expand into ten skeleton cards while its replacement loaded.

## Changes

- The heading, summary, controls, films and count commit together from the applied query. Pending feedback belongs to the requested shelf; the current content remains readable until its replacement is ready.
- Both shelves share the same introduction. Shelf content uses one opacity transition, while the introduction and tabs stay still. Filter/sort result transitions also use opacity only. Keyboard navigation is immediate; reduced motion retains brief fades.
- A bounded per-account, in-memory cache retains up to six fresh library queries and their appended pages for one minute. Writes and refreshes invalidate it, release-day changes expire it, and ranges above 250 films are not retained. Known empty Watched results can open without a request. Reversing a pending switch cancels it and reuses the displayed shelf.
- Empty shelves remain visible while a replacement is requested. To Watch explains when all saved films are watched and offers Browse Watched. Watched omits the unrelated release-date legend, with normal footer spacing retained.
- Foreground navigation aborts superseded requests across sections. Filter/sort changes no longer recreate the minute revision timer and postpone refreshes.
- Watch-status reconciliation verifies both saved membership and watched state, including acknowledged writes and lost responses. A film removed by another client cannot be reported as saved by an unwatch. Undo restores old timestamps only for films it actually re-added.
- Details initially focus the title, so pressing Enter again cannot remove a saved film. Dialog handoffs retain a connected external return-focus target, and dragging selected text onto the backdrop no longer dismisses the dialog. Calendar pagination deduplicates overlapping film IDs.

## Verification

The slow-request regression confirms no intermediate heading, film or grid-position mismatch. Fresh round trips preserve a 29-film appended range with one destination read, and a watched-status write invalidates the retained views. Additional browser regressions cover rapid reversals, empty shelves, phone/desktop control stability in both themes, safe initial focus, backdrop drags, dialog handoff focus, overlapping calendar pages and the scheduled revision refresh.

- `npm run check`: formatting, ESLint, TypeScript, 256 unit/database checks and the backup/restore fixture passed.
- Full browser suite: 95 scenarios passed. Five shelf/empty-state scenarios passed again against the release build after the final spacing and selection-control refinements. Visual review covered 320, 375, 414, 768 and 1440px in light/dark themes. Pending desktop grid geometry is unchanged; shelf-control displacement remains under 1px at every tested width.
- `git diff --check` passed. No database migration is required.

## Production release

- Canonical URL: <https://a-list-nine.vercel.app>
- Deployment: `dpl_3nUd6UsBzDDXXE72T1MxLXJfX3m3`, production, READY at 2026-11-04 13:36:37 UTC. Function region `lhr1`; build duration 166.7 seconds.
- Uploaded the current working tree based on `539dfb1`, retaining the existing uncommitted work. The 382-file upload manifest, before this post-release record, has SHA-256 `78a3b0f78ead60f6dd8efaed05b245c587d56a0895a50446c74a35f2e6672723`. Local credentials, project links, dependencies and generated outputs were excluded.
- Vercel ran `npm run check && npm run build` successfully. The canonical alias points to this deployment.
- Live smoke checks passed: login/privacy 200, anonymous root redirects to login, private catalogue/library/health APIs return 401, and compiled CSS contains the shelf pending indicator and Watched footer spacing. The existing WTS upstream readiness warning still produces a degraded `/api/status` response; this predates this release.
- No error/fatal runtime log groups were returned in the post-readiness scan, including after the smoke requests. Personal watched history was tested only against isolated fixtures.
