# Cinematic redesign — November 4, 2026

The first polish pass was too subtle for the requested visible change. This pass replaces the floating capsule, reduces the stacked collection chrome and adds an actual film hover preview. It also makes sign-in visually distinct, using the existing blue/cyan brand photograph.

Taste direction: **True-black flat**, seed **1536448081**, preserving the existing neutral appearances, Figtree wordmark and Inter text. The poster artwork is the product's identity; the interface frames it with neutral surfaces. The app-shell alternative is a full-width header because this personal library has only two primary destinations and needs no sidebar. No new stock imagery, generated art, dependencies or database migrations are involved.

The screen's question is “What should I watch, and when can I watch it?” Film artwork becomes the shelf; hovering a poster opens its compact film note. The existing full detail dialog remains the keyboard and touch destination.

- Full-width wordmark/search/calendar/account header; collection title and main navigation share a desktop row.
- Compact weekly surface; on smaller screens, its entries scroll horizontally rather than occupying three stacked rows.
- Larger film titles, tighter poster corners, a 4px pointer lift and a clearly labelled View Film action on hover/focus.
- A real, viewport-aware hover card appears after 350ms. It shows existing year/rating/library state, a synopsis when stored, and release information with uncertainty retained. It performs no detail request. Escape dismisses it, and opening details cancels pending preview presentation. Touch, selection and disabled states bypass the hover wrapper.
- Card API responses retain at most 320 synopsis characters, with remaining detail metadata omitted and original movie objects preserved. Complete details still load on opening.
- Larger film-detail composition: 180px artwork beside the title/library actions on desktop, then a full-width release panel; mobile uses 96px artwork in the existing scrollable sheet.
- Sign-in becomes a split photographic composition on desktop and a short image masthead above the phone form. Existing sign-in, expiry, retry and success flows remain.

## Visual review

ROUND 1
Seen in one second: Film artwork is present, but the weekly agenda still pushes it too far down on phones.
Idea: A film shelf with a small film note emerging from each poster.
Live thing: Intentional hover preview, full details, saved/watched shelves and release calendar.
Layout words by section: header=full-width bar / library=title plus shelf tabs / week=compact agenda / films=poster shelf / details=split film note / login=photograph plus form.
Scores: design 7.0 · usability 7.0 · creativity 7.0 · content 7.5 → overall 7.1.
Caps applied: App-screen rules apply; film posters are real product content. Review data is disposable and never replaces production catalogue entries.
Top three problems:

1. Phone weekly entries formed a tall vertical list. Replace it with a horizontal scroll-snapping strip.
2. Phone sign-in vertically centered the form with unnecessary space after the photograph. Align the form to the top of its content area.
3. The first hover footer looked like an action but was informational. Keep the actionable View Film control on the poster and use a plain release-date note in the preview.

Review artwork comes from the project's existing catalogue poster URLs; downloaded copies are only ignored local QA assets in `outputs/cinema-review/posters/`. The sign-in photograph is the existing `public/link-preview.jpg`. Fixture IDs and dates, including the visual fixture's ten-film subset, are test data only. No customer quotes, activity counts or business claims were invented.

ROUND 2 — final
Seen in one second: A film shelf with a full-width search header; sign-in leads with the brand photograph.
Idea: Film artwork becomes the shelf and an intentional hover reveals the film note beside it.
Live thing: Mouse/focus hover preview with Escape dismissal; poster click or touch opens the larger film dialog.
Layout words by section: header=full-width bar / library=aligned title and navigation / week=compact strip / films=poster shelf / preview=floating film note / details=split poster and release panel / login=photographic split.
Scores: design 7.5 · usability 8.0 · creativity 7.0 · content 8.0 → overall 7.6.
Caps applied: App-screen rules apply. These are subjective review scores, not a substitute for the user's visual judgment.
Top three problems from Round 1: resolved. The retained limit is that a long collection naturally continues below the fold; the inspector treats each film as a block. The neutral chrome and existing typefaces remain deliberate, while the composition and hover behavior are visibly changed.

## Validation

- `npm run check` passed formatting, ESLint, strict TypeScript, all 256 unit/database checks and the backup/restore fixture.
- The full browser suite passed **97 scenarios**, including the two new hover/touch regressions. The existing poster-press check now waits for the intentional hover lift before asserting that pressing causes no additional movement.
- Taste inspections of the final production fixture build passed with **0 failures and 1 warning** in each appearance at 1440, 768 and 390px. The warning is the long collection continuing below the fold. Every fold and page-sheet screenshot was opened.
- Real-artwork review also checked 320px, hover cards, larger details, and desktop/phone sign-in. No horizontal page overflow was detected at 320, 390, 768 or 1440px in either appearance. Representative first-poster positions in the populated fixture were 600px on desktop, 658px on tablet and 645px on a 390px phone.
- The bounded-synopsis unit assertion confirms 320-character card excerpts while complete original movie objects retain their full synopsis. Hover regression confirms there are zero `/api/movie/` reads before opening details.
- React best-practices review: preview state is scoped to the hover-only child and unmounts for touch/selection; pending hover opening cannot reappear over the detail dialog; media subscriptions clean up; there is no per-frame React update or hover fetch; existing keyboard/touch targets, modality and focus return remain covered by the suite. The informational preview is hidden from assistive technology because the existing named poster button opens the same complete information; the preview contains no separate interactive controls.
- `git diff --check` passed. Routes, private writes, calendar identities, release confidence and source health rules remain intact.

Evidence lives in ignored local `outputs/cinema-review/`: real-artwork screens, hover/detail/sign-in captures, both taste reports, and browser regression output. Visual dates and memberships are isolated fixtures; production accounts and catalogue rows were not edited for review.

## Deploy Result

- **URL**: <https://a-list-nine.vercel.app>
- **Deployment**: `dpl_GWTuLq5udmceEo39jB6LSSokQKeJ`
- **Target**: production
- **Status**: READY at 2026-11-04 19:03:46 UTC
- **Commit**: current working tree based on `539dfb1`; no commit or push was made.
- **Framework**: Next.js 16.4.3, Node.js 24.x.
- **Build Duration**: 161.433 seconds.

The 388-file upload (2,766,668 bytes) excluded local credentials, generated outputs and downloaded QA artwork. The canonical file-manifest SHA-256 is `99bc2ea74650a9d7b97077d00c74e91e115d662459e54aa9dbcfa39758f751bf`. Each uploaded file's SHA-1 was checked against the dry-run manifest immediately before release. This post-deploy record was appended afterward.

Vercel independently passed all 256 tests, backup/restore verification and the production build. The canonical domain explicitly resolves to this READY deployment. Live login/privacy returned 200, signed-out home redirected to login, and private catalogue/library/health reads returned 401. Live HTML contains the new photographic composition; served CSS contains the real hover-preview, preview animation and updated layout selectors. A separate live browser check verified that the photograph loads and the sign-in page renders without horizontal overflow at 1440px and 390px; both screenshots were opened.

### Post-Deploy Observability

- Error/fatal scan: 0 records for this deployment in the bounded 18:54:56–19:04:56 UTC window, including readiness and smoke requests. No additional log pages were reported.
- Runtime logs remain available; the project's previously checked external drain count is zero.
- Public source readiness remains 503/degraded, consistent with the existing source-health condition. This redesign does not change source ingestion or health rules.

Production accounts and catalogue rows were not changed for QA, and no migration was applied. Existing tabs need a reload to use the new client bundle.
