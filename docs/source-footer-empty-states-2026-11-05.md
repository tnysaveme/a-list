# Sources footer and empty categories — 5 November 2026

Library and Discover empty categories now show their message and recovery action without the decorative bookmark. The functional My Library navigation icon remains.

Expanded film details gather the primary listing, every distinct release-evidence URL, and any available synopsis source in one Sources section after the release information. Matching source buttons show their purpose, provider and an external-link icon. Repeated URLs appear once. Source dates and uncertainty remain in the release rows, and the last-check date stays beside the Sources heading.

The footer uses an even button row on desktop and tablet. Phone buttons stack at full width to keep provider names readable. Controls retain 44px minimum targets, visible keyboard focus and restrained theme-aware hover feedback. Links keep their original destinations and open in a new tab.

This component refinement inherits the existing True-black flat direction, seed 540024218; no redraw, new assets, dependencies or backend changes. Its idea is a clear evidence rail beneath the film's reading content. The before state is the film-details review's prior final; the after screenshots are in `outputs/film-details-review/sources-footer-final/`. Empty-category and three-source fixtures are in the sibling `sources-footer/` folder. The native sheet's Done action remains reachable while its content scrolls.

## Final review

Seen in one second: the same poster-led film detail, with release data separated from a single Sources footer.
Idea: source evidence becomes one consistent button rail after the film's information.
Live thing: links retain every distinct original destination, while duplicate URLs appear once.
Layout: poster split / compact personal controls / synopsis / release record / source-button row; the source row stacks on phones.
Scores: design 8 · usability 8.5 · creativity 7 · content 8 → 7.95, rounded 8.0.
Caps: app-component rules; existing floating-dialog shadow is allowed. No new photography or sample production content.
Remaining visible problems: none requiring another revision. Long source names wrap; phones deliberately use full-width source buttons.

`npm run check` passed formatting, lint, TypeScript, all 257 unit/database tests and the encrypted-backup restore fixture. Seven targeted browser scenarios passed, including both empty-category sections, distinct evidence URLs, narrow responsive layouts in both themes, watched state and failure/retry feedback. Taste source lint and rendered inspection passed with 0 FAIL / 0 WARN at 1440, 768 and 390px in both themes; the dark native-dialog shadow uses the same documented overlay allowance as the preceding redesign. Actual mobile footer screenshots also verify the source controls after scrolling, with Done still reachable.

## Production verification

Deployment `dpl_sW11ozKv3TXYKtLqmcPU4bLntmPX` reached READY and was verified behind <https://a-list-nine.vercel.app> on 5 November 2026. Vercel repeated the checks, all 257 tests and the restore fixture before compiling the production app. The upload manifest's 403 source files matched their local hashes and excluded credentials and generated artifacts.

Read-only live checks passed for sign-in, confirmation, privacy and both authentication images. The sign-in form and decoded artwork rendered without browser errors; unauthenticated library membership remained private with a 401 and no-store response. The new deployment returned no error/fatal runtime records after the smoke check. Authenticated category and source-button flows were verified using local browser fixtures, without modifying production library data.
