# Library membership motion — October 28, 2026

Confirmed saves draw a check into the existing save control. Confirmed removals fade/shrink locally while neighboring films move into the gap. Undo reuses the current visual position if the outgoing film is still fading, and brings a restored film into place after confirmation.

## Behavior and implementation

- Save confirmation: stable plus/check layers crossfade and transform over 120–180ms; the small check path draws over 180ms. Initial saved films do not play an entrance. Loading icons exist only while actually pending; failures retain the add state.
- Membership changes originate from the existing batch reconciliation result. Only completed IDs participate; rejected/unknown removals do not fade away. Partial results animate completed films and retain failed selections.
- Collection motion uses local WAAPI transform/opacity animation, rather than a document-wide overlay. Exit copies stay below native dialogs, are inert/aria-hidden, contain no element IDs or live `[data-movie-id]` selectors, and disappear on completion/interruption.
- A React snapshot boundary measures positions before DOM removal, then batches target measurements after the commit. Normal movement takes 260ms, exits 180ms, and reduced motion uses 120ms fades. Dialog-triggered exits allow the 120ms dialog fade to hand over to collection movement. Controls remain usable throughout.
- Motion is restricted to the visible neighborhood: up to 32 measured active cards and 24 exit copies. A refresh revealing additional films participates in the same local reflow. Polling, first load, section/filter/layout changes do not independently trigger membership choreography.
- Interruptions, a new layout/section, keyboard input, preference changes and unmount cancel retained copies/animations. No per-frame React state or new package was introduced.
- Keyboard membership actions are immediate. Reduced motion avoids spatial movement and the check stroke animation. Removed-film focus returns to the next visible poster or the collection heading; an intervening navigation/control retains its focus. Undo and partial batch flows retain their original data semantics.

Changed components: `CollectionMotion`, `MembershipIcon`, `MovieCollection`, `MovieDetails`; membership-event delivery in `useLibrary`; the shared input modality helper; collection/focus wiring in AList; shared CSS/design documentation. No API, schema, environment or scheduler change is required.

## Verification

- Formatting, lint, TypeScript, all 194 unit/data tests and the backup restore fixture pass.
- All 42 isolated browser checks pass against the final application source, including save failure versus confirmation, in-flight Undo, inert exits, neighbor movement, list-mode partial batch failure, keyboard and reduced motion, and the last-film empty-state/Undo sequence at 375px in dark mode.
- Existing startup, request deadlines, cached navigation, focus restoration, source/feed correctness, pagination/refresh anchoring, appearance and section/layout motion checks remain passing.
- Inspected intermediate save/removal captures and the settled mobile dark empty state. Artifacts: `outputs/review/membership-save-confirmation.png`, `outputs/review/membership-removal-midpoint.png`, `outputs/review/membership-empty-mobile-dark.png`.
- Static Impeccable detection is clean. Fixed the requested action feedback; added no suppressions; retained approved typography and the existing narrow inherited Arial fallback exception.

These are headless Chromium/viewport fixtures, not physical-phone or Safari certification. Authenticated interactions use disposable providers; no production save/remove is required for these checks. Real-user metrics remain outside this motion change.

## Production base and release

The live production base was checked before staging: `dpl_7QXZxEHxbGu2BGx66WyQzRk25Z33`, https://a-list-r97usryid-terence-yebuahs-projects.vercel.app. This includes the separately released WTS refresh repair. SHA-1 comparison of all 72 existing `lib/` source modules, excluding the motion helper being edited, matched production. The backend fix is preserved.

The Vercel connector could not access this team scope, so the existing authenticated CLI was used with explicit project/team selectors. No reconnection or credential changes were made. The build is staged with production configuration and no live-domain assignment, checked, then promoted without rebuilding. No commit or push is performed; the release uses the reviewed working tree based on `c1de7fc`.

Project/team: `prj_eV35BkjAL547jBP5t73vsI2fsmSC` / `team_QRbcE5QYR9UroFoG1dF2RVnz`. Framework/runtime: Next.js 16.4.3 / Node 24. Final deployment and endpoint checks are recorded below.

## Final release checks

- Live URL: https://a-list-nine.vercel.app.
- Production / READY: `dpl_HFxHxNFDCxxa4cNkXmzv1iV6c4vx`, https://a-list-dcihsc7qt-terence-yebuahs-projects.vercel.app.
- The live domain still pointed to the inspected WTS-fix base immediately before promotion; it resolved to the new animation deployment afterward.
- Staged login, privacy and CSS: HTTP 200. Staged private health: HTTP 401.
- Staged/live readiness: HTTP 200, healthy.
- Deployed CSS contains save-check drawing, local exits and keyboard/reduced-motion variants. Compiled timing tokens resolve correctly to 260ms / 180ms / 120ms.
- The remote production build repeated the project check/build pipeline successfully.
- A bounded runtime error/fatal scan through 23:29:13 UTC returned zero records. This is a brief release observation, not ongoing monitoring.
