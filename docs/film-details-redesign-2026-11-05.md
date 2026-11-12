# Film details redesign — 5 November 2026

The expanded film is a component of the existing A-List app. The taste skill's component exception applies: inherit the existing True-black flat direction (seed 540024218), Inter/Figtree, neutral palette, and product behavior. No new draw or redraw; the pill navigation is outside this change.

## Inventory and intention

- A film's own portrait poster, full title, year and content rating identify the object.
- Theatrical dates are separate from sourced home-release windows.
- Available, Coming Soon, Unconfirmed and TBA have different meanings.
- Digital, premium rental and subscription releases name their access model.
- Every release retains its source, confidence and date.
- Saving follows a film in a personal library and calendar feed.
- Watched films stay saved but leave the calendar feed.
- Synopsis length and title length vary; missing artwork and metadata are valid states.
- People glance at release dates and save a film, then return to their collection.
- Phone use needs thumb-sized controls and a scrollable sheet with a reachable Done action.

Question: when can I watch this film at home, and am I following it?

Idea: the film's poster becomes the spine of a compact programme, beside its identity, personal actions and synopsis, with the sourced release record underneath. The live interactions remain save/remove, watched status, synopsis disclosure and source links.

## ROUND 0

Seen in one second: a poster above two settings rows and a large release container.
Idea (one sentence): the existing poster has no stable relationship to the reading and action columns.
Live thing: save/remove, watched state and synopsis disclosure.
Layout words by section: identity=split / personal state=settings rows / releases=large well / synopsis=full-width text.
Scores: design 6 · usability 6.5 · creativity 6 · content 8 → overall 6.35.
Caps applied: app component rules; marketing-page imagery and motion floors do not apply.
Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `before/1440-light.png`: saved and watched state consume two wide rows; their explanations crowd the controls. Combine actions and keep one quiet state note.
2. `before/1440-light.png`: one release occupies a 279px panel, with its evidence link detached. Align release type, date and source on one desktop row.
3. `before/390-light.png`: repeated personal-state descriptions push the release record and all synopsis text below the first sheet view. Give mobile its own compact action group and readable content rhythm.

## Review method

Screenshots use the real production-build component and disposable local API handlers. Existing Black Phone 2 poster artwork is reused from the prior review. The short synopsis preview paraphrases the studio premise; no preview data is added to production records. Isolated inspector documents export the rendered component and compiled CSS, promoting its heading levels for a standalone document while retaining their measured styles. Browser interaction checks use the actual authenticated application and native dialog.

## ROUND 1

Seen in one second: a film poster paired with its title, personal actions and synopsis.
Idea (one sentence): the poster anchors a compact film programme rather than a stack of settings rows.
Live thing: save/remove, watched state, synopsis disclosure and source links.
Layout words by section: identity=poster and reading column / personal state=action group / synopsis=reading column / releases=aligned evidence rows.
Scores: design 7.5 · usability 7.5 · creativity 7 · content 8 → overall 7.45.
Caps applied: app component rules; no marketing-page image or motion floor.
Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `round1/390-light.png`: both actions take full rows. Reduce inline button padding so the pair fits at 390px while retaining 44px touch targets.
2. `round1/768-dark.png`: synopsis beside the shorter tablet poster leaves an unused column. Span the synopsis across the tablet width instead.
3. `round1/1440-light.png`: synopsis and release source links occupy different horizontal positions. Align their right edges.

## ROUND 2

Seen in one second: title and poster first, one action group, then a clearly separated release record.
Idea (one sentence): the film programme carries identity, synopsis and sourced release information without repeating saved-state explanations.
Live thing: all existing personal actions and evidence links.
Layout words by section: identity=split / personal state=compact row / synopsis=responsive reading block / releases=evidence well.
Scores: design 7.8 · usability 8 · creativity 7 · content 8 → overall 7.72.
Caps applied: app component rules; full film names remain readable rather than being truncated to meet a marketing headline limit.
Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `round2/1440-light.png`: the release source footer remains inset inside the well. Move it below the well so both source buttons meet the same right edge, as requested.
2. `round2/768-dark.png`: the heading begins below the poster's top. Align the identity block to the top of its grid track.
3. The rendered long-source stress fixture overflowed at 320px (`/tmp/alist-film-details-stress.log`). Allow source labels to wrap and constrain the desktop evidence column instead of clipping content.

## ROUND 3 — final

Seen in one second: the film's poster and name, followed by the controls to keep and track it.
Idea (one sentence): a poster-led programme keeps the film identity, personal state, synopsis and release evidence in a compact reading order.
Live thing: saving/removing, watched status, full synopsis disclosure and source navigation.
Layout words by section: identity=poster split / personal state=action group / synopsis=reading column, full width on tablet and phone / releases=aligned rows with a source footer.
Scores: design 8 · usability 8.5 · creativity 7 · content 8 → overall 7.95, rounded 8.0.
Caps applied: app component rules. The conventional object-detail approach limits creativity to 7; no marketing-page imagery or motion floor applies.
Top three problems: none remaining that prevent the composition or interaction. Long genuine film titles intentionally wrap; 320px actions stack, and long release lists scroll inside the sheet while Done stays available.

| Measurement                               | Before                            | Final                                                       |
| ----------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Desktop dialog width                      | 880px                             | 940px                                                       |
| Desktop height for the same reviewed film | 859px                             | 712px                                                       |
| Desktop poster                            | 180px                             | 216px                                                       |
| Phone poster                              | 96px                              | 104px, 88px below 360px                                     |
| Personal actions at 390px                 | Separate settings rows            | One compact action row                                      |
| Synopsis and release source alignment     | Different inset and row placement | Same right edge, under 1px difference at every tested width |
| Failed personal action                    | In the release block              | Beside the personal actions                                 |

## Verification

- Taste source lint: 0 FAIL, 0 WARN.
- Final taste inspector: 0 FAIL, 0 WARN at 1440 / 768 / 390 in light and dark. The dark inspection explicitly allows `heavy-shadow` because the flagged object is the existing native modal in the browser's top layer; the app rules permit shadows on floating dialogs. No resting panel has a shadow. All final fold and page-sheet images were opened, alongside actual application screenshots.
- The full browser run passed 129 of 130 scenarios. The remaining assertion expected the old watched-state sentence; it was updated to verify the same calendar exclusion in the new compact note. That scenario and eight related scenarios then passed. All 130 scenarios are verified across those runs.
- New browser coverage checks 320 / 375 / 390 / 414 / 640 / 768 / 1024 / 1440px in both themes, full titles, three release kinds, long source names, empty dates, 44px targets, synopsis disclosure, and matching source-button edges.
- `npm run check` passed formatting, lint, strict TypeScript, all 257 unit/database tests, and the encrypted-backup restore fixture.
- Existing artwork and production data remain the only product content. No generated images, new photographs, dependencies, migrations or production sample records were added. The review synopsis is a paraphrase of the [studio premise](https://preview.universalpicturesathome.com/movies/black-phone-2); illustrative stress-test windows and names stay in tests.

## Deployment

Production deployment `dpl_9fYrUGwDCY7NUjoT1xCi3zGMKnYL` is READY on [A-list](https://a-list-nine.vercel.app). The canonical domain points to this exact deployment. Production checks passed; live sign-in, confirmation, privacy and artwork requests returned 200, private membership returned 401 with `no-store`, and the browser reported no exceptions. The deployment error query returned zero records at verification time. Authenticated details and mutations were tested against the disposable local services with the real application API handlers, without changing a production user's library.
