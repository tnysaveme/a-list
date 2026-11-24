# Site-wide hover and visual polish — November 4, 2026

## Direction

Used `design-taste-frontend` with its app-screen workflow. Dealt **True-black flat**, seed **540024218**, preserving the existing palette, Figtree wordmark, Inter interface, layout and content. No redraws. Its lightness-based surface hierarchy applies to both existing appearances; this is a restyle of the established product rather than a new shell.

The screen's question is “Which saved films can I watch, and when do the others arrive?” The product's face is its film artwork against quiet monochrome controls. Its signature is the sourced weekly release agenda alongside To Watch and Watched shelves. Detail answers when a particular film arrives; Calendar answers how those dates reach the user's calendar; Account answers how to manage appearance and private library data. No production sample content or imagery was added.

## Changes

- `app/interactions.css` owns shared hover feedback across navigation, shelves, filters, layouts, buttons, menus, search results, source links, disclosures, settings, form fields, batch controls and toast actions. Small neutral tone changes last 140ms, derived from the current theme. Artwork and control geometry stay fixed.
- Text actions reveal an underline without lowering text contrast. Saved and unsaved poster controls have distinct readable hover feedback. Keyboard focus inside a poster keeps its save action visible; touch exposes those actions without requiring hover.
- Pointer effects require both hover capability and a fine pointer. Disabled, aria-disabled and saving controls do not pick up enabled hover treatment. Reduced motion makes the control transitions immediate. Existing focus rings, content motion and sheet behavior remain.
- Corrected success-state specificity on the saved-film detail action and destructive-action specificity in Account settings. Confirmed destructive actions no longer need `!important` declarations to retain their semantic fill.
- Removed resting shadows from navigation and segmented choices. Small metadata increases from 12px to 13px; fluid page titles now range from 24px to 32px. Movie metadata uses tabular numerals.

## Visual review

ROUND 1 — before
Seen in one second: A personal film library with a prominent floating search capsule.
Idea: Sourced release dates and personal shelves turn a catalogue into a viewing plan.
Live thing: Search, save, switch shelves, inspect dates and manage a calendar feed.
Layout words by section: header=capsule / library=tabs / week=agenda / films=poster grid / details=dialog / settings=sections.
Scores: design 7.0 · usability 7.5 · creativity 7.0 · content 7.5 → overall 7.2.
Caps applied: None; app-screen rules apply. These are subjective screenshot scores, not user research.
Top three problems:

1. Desktop and tablet header shadows compete with the collection. Remove the resting shadow while retaining the established capsule and border.
2. Desktop title is oversized at 36px while much of the metadata is only 12px. Use a 24–32px title and 13px metadata.
3. Control states are inconsistent across action families. Centralize hover feedback and inspect pointer, keyboard, disabled and touch states.

## Validation

Validation uses the existing isolated production fixture app. It builds from an explicit source allowlist without loading the checkout's private environment; all authentication, personal data and provider responses are disposable fixtures. The inspection screenshots intentionally retain its unavailable-artwork states. Fixture film names and dates are not production content.

Before taste inspection: **0 failures, 6 warnings**, at 1440, 768 and 390px. The title-size and tiny-text warnings are actionable; the other warnings reflect a long film collection, its empty-week state and unavailable fixture artwork rather than new page-layout defects. Source lint's email-placeholder warning refers to an illustrative email address in the login field, not invented product data. Shadows on actual dialogs, menus, toasts and batch overlays are intentional; the search field's inset line is its focus indicator.

The browser run also caught palette transitions being applied to all poster save controls during a grid/list change. Poster actions now switch their contrast immediately and retain only opacity/press transitions, avoiding a page of simultaneous colour fades. The existing layout-motion scenarios explicitly use a viewport tall enough to show the first posters below the weekly summary. The mobile filter regression now verifies the visible outline on its containing control, which owns the new single focus ring.

ROUND 2 — final
Seen in one second: A quiet film library with clear shelves and readable release metadata.
Idea: Sourced release dates and personal shelves turn a catalogue into a viewing plan.
Live thing: The existing search, saved/watched shelves, film details and calendar controls; each has coherent interaction feedback.
Layout words by section: header=flat capsule / library=tabs / week=agenda / films=poster grid / details=dialog / settings=sections.
Scores: design 7.5 · usability 8.5 · creativity 7.0 · content 7.5 → overall 7.7.
Caps applied: None; app-screen rules apply. Scores remain subjective and the absence of film artwork limits the visual assessment.
Top three remaining limitations, with their disposition:

1. The desktop/tablet/phone page sheets show unavailable artwork in the disposable fixture. Keep the explicit fallback; existing browser scenarios separately exercise decoded, cached and failed images. No replacement assets or production-provider changes are justified by this fixture.
2. The phone first screen retains the useful weekly agenda above the film grid. Keep its existing placement and empty-week message; this hover/restyle pass preserves navigation and content hierarchy.
3. An unconfirmed release with a distant year wraps before its whole date in the phone page sheet. The date remains unbroken and readable; the 13px metadata is preferable to shrinking the label again.

| Measurement                                       | Before     | Final light and dark |
| ------------------------------------------------- | ---------- | -------------------- |
| Taste failures, 1440/768/390px                    | 0          | 0                    |
| Taste warnings                                    | 6          | 3                    |
| Page title, desktop/tablet/phone                  | 36/28/28px | 32/24/24px           |
| Small metadata                                    | 12px       | 13px                 |
| Tiny-text, tabular-figure and title-size warnings | Present    | Resolved             |

The three retained inspector warnings concern the empty-week screen, the long catalogue below the fold, and missing fixture artwork. Every final fold and page-sheet screenshot was opened in both themes at all three widths. Additional interaction screenshots covered details, calendar, account settings, login and privacy; overflow checks covered 320, 390, 768 and 1440px in both appearances.

Validation completed:

- Production fixture build, ESLint, strict TypeScript, formatting and `git diff --check` passed.
- All 256 unit/database checks passed.
- All 95 existing browser scenarios passed after the grid/list and focus corrections.
- The final calendar-switch hover refinement was rebuilt and verified with 37 targeted interaction checks plus 9 focused calendar, layout and focus regressions and the final light/dark taste inspections (0 failures each). These checks cover changed hover contrast without geometry movement, disabled controls, keyboard discovery of unsaved poster actions, touch visibility, reduced motion, disclosures and responsive overflow.

Evidence is in `outputs/hover-review/` (ignored local artifacts): before/after reports and screenshots, `hover-checks.json`, `browser-regressions.txt`, and source-lint output. These are local fixture checks, not production latency or physical-device measurements. No deployment, account or database migration was performed.

## Deploy Result

- **URL**: <https://a-list-nine.vercel.app>
- **Deployment**: `dpl_G38QsXAR8bAnJY9fTgh1uhbKHBQa`
- **Target**: production
- **Status**: READY at 2026-11-04 18:36:29 UTC
- **Commit**: current working tree based on `539dfb1`; no commit or push was made.
- **Framework**: Next.js 16.4.3, Node.js 24.x; configured function region `lhr1`.
- **Build Duration**: 155.073 seconds.

Published the current source with the installed Vercel CLI after confirming the linked team and project. The connector's team access required renewal; the CLI's existing authorization worked. The dry upload manifest verified that credentials, project links, dependencies and generated outputs were excluded. It contained 386 regular files, 2,740,120 bytes; canonical file-manifest SHA-256 `d454b307545c0516ee82af8643b433c41ed7cee92045e8b02b703ec135c6c57a`. This post-deployment record was appended afterward.

Vercel independently passed `npm run check && npm run build`, including all 256 tests and the backup/restore fixture. The canonical alias was explicitly resolved to this exact READY deployment. Live login and privacy pages returned 200, signed-out home redirected to login, and private catalogue/library/health APIs returned 401. The served CSS contains the shared hover duration and tones, calendar-switch hover, keyboard poster discovery and text-action feedback.

### Post-Deploy Observability

- **Error scan**: 0 error/fatal records for this deployment in the bounded 18:27:07–18:37:07 UTC window, which includes readiness and the smoke requests. No additional log pages were reported.
- **Drains**: 0 configured for the project. Vercel runtime logs remain available.
- **Readiness**: `/api/status` remains 503/degraded, consistent with the previously documented release-source health condition. The UI release did not change source ingestion or health rules.

Already-open tabs need a reload to receive the new client bundle and styles. No database migration was required or applied.
