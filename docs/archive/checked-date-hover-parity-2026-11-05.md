# Source-check footer and hover parity — 5 November 2026

Expanded film details retain the source-button row and replace its visible Sources heading and disclaimer with one final row: “Sources checked on [actual date]”. The date comes from the film's recorded release check, with the existing primary-listing check as a fallback for native listings. Unchecked IMDb records and invalid timestamps do not invent a check date. The footer is the article's final child and uses a semantic time element.

Library and Discover share the same hover component, presentation, timing, bounded synopsis and release formatting. Discover was losing its synopsis because the SQL catalogue snapshot deliberately strips that field. The application now retrieves the stored synopsis for only the displayed page's missing entries in one authenticated batch, in parallel with personal membership. The response retains at most 320 characters per film. Hover still makes no detail requests. Optional synopsis-read failures preserve release browsing and use the same truthful missing-synopsis line in either collection. No database migration, new permission or upstream request was needed.

The browser provider now models the production SQL snapshot by omitting overview text and supports the selected-JSON synopsis read and its outage case. Seven targeted browser scenarios passed: identical complete hover markup in both themes, graceful synopsis outage, original hover Escape/focus/click behavior, direct touch detail opening, actual recorded date and preserved distinct source links, and two responsive detail stress scenarios at eight widths in both themes. Formatting, lint, TypeScript, all 257 unit/database tests and the encrypted-backup restore fixture passed.

## Final visual review

ROUND 1

Seen in one second: film details close with two source actions and one quiet freshness line.

Idea (one sentence): evidence actions remain together while their shared check date becomes the film's final note.

Live thing: source links preserve their actual destinations; both collections expose the same local hover preview.

Layout words by section: identity=poster split / personal actions=compact group / synopsis=reading column / releases=aligned rows / sources=matching button row / checked date=single final line.

Scores: design 8 · usability 8.5 · creativity 7 · content 8 → overall 8.0.

Caps applied: app-component refinement follows the existing True-black flat direction, seed 540024218; no redraw or new imagery. Native floating-dialog shadow retains the existing overlay allowance.

Top three problems: none remaining that require a visible revision. The source date is reachable above Done on phones; long provider names retain full-width buttons. Tests use fixture films and a stored-date example; no fixture content is shipped as production data.

Taste source lint and rendered inspection passed with 0 FAIL / 0 WARN at 1440, 768 and 390px in both themes. Every final inspector screenshot was reviewed, alongside real phone screenshots scrolled to the date row and both collections' hover screenshots. Artifacts are under `outputs/film-details-review/checked-date-preview-parity/`, `checked-date-preview-parity-bottom/` and `consistent-previews/`.

## Deployment

Production deployment `dpl_6tLoRq3GPD6y387zaCjk7tMQhAZA` reached READY and the canonical <https://a-list-nine.vercel.app> alias was verified against that exact ID. Production repeated the 257-test suite and backup fixture before compiling. The upload manifest verified all 403 source-file hashes and excluded credentials and generated artifacts.

Read-only live checks passed for login, confirmation, privacy and both authentication images; the sign-in form and decoded image rendered with no browser errors. Private membership still returned 401 with no-store for an unauthenticated request. The new deployment returned zero error/fatal runtime records after these checks. Authenticated preview parity and footer behavior were exercised with local fixtures, without changing production library data.
