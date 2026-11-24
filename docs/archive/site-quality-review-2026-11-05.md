# Site quality review — 5 November 2026

Reviewed the current A-List implementation and exercised its main flows through an isolated production build. Existing workspace changes were preserved. Fixes retain the established visual system and account, release-date and calendar semantics.

## Corrections

| Priority | Verified defect                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | After a failed search, changing only capitalization or surrounding spaces cleared the error and left search permanently busy. The normalized query had not changed, so no request would finish that state.       | Cosmetic query edits preserve results, errors and pending state. Retry stays available. The same correction covers expired search-cache entries.                                                                                               |
| P1       | Undo was still clickable during another library write. The action cleared its notice before the mutation lock rejected it, discarding recovery. Its countdown could also expire while another write was pending. | Undo is disabled during personal updates and checked again in its handler. Its recovery window resumes after the update finishes. Ordinary notification lifetimes remain independent of unrelated busy changes.                                |
| P1       | At 200% text size, the search input shrank to approximately 5px at a 320px viewport and 18px at 375px. Navigation, shelf controls and subscription labels could overflow.                                        | The header reflows search onto a second row when text and controls need more space. Navigation groups wrap; action labels can wrap; calendar secondary actions use their content width. Normal-size layouts retain their existing arrangement. |
| P2       | Calendar settings labeled the active-feed count as all films in the library and told an entirely watched library to save films again.                                                                            | Counts explicitly describe films in the feed. The introduction explains watched exclusions, and the empty state points to marking a film unwatched.                                                                                            |
| P2       | A freshly loaded library showed an unverified-listings warning derived from the still-unloaded Discover catalogue.                                                                                               | Catalogue freshness appears in Discover. Per-film source-check dates remain in film details.                                                                                                                                                   |

Six new browser regressions cover these cases in `tests/e2e/site-quality.spec.ts`. The original implementation failed the relevant assertions before correction.

## Coverage

| Area                      | Checks                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication            | Email validation, failed and slow requests, confirmation, expired sessions, sign-out, session refresh, foreign origins, restricted storage and no-JavaScript rendering.                                                     |
| Library and Discover      | Empty and populated collections, filters and ordering, pagination, navigation/history restoration, grid/list changes, selection, save/remove/Undo, watched history and external membership changes.                         |
| Failure and race recovery | Delayed or lost responses, rejected writes, late metadata, concurrent pagination changes, cached membership, failed initialization, unavailable database/cache fixtures, partial refreshes and retry.                       |
| Calendar and account      | Feed content, unconfirmed-date preference, watched exclusions, pagination, clipboard success/failure, export cancellation, uncertain reset/deletion outcomes and private/public endpoint boundaries.                        |
| Release logic and data    | Source parsing, exact film identity, confidence rules, date withdrawals, US release-day boundaries, stable calendar identities, database constraints and account isolation through the existing unit/database suite.        |
| Accessibility and layout  | Keyboard search and menus, modal focus/return, Escape, reachable mobile Done actions, touch opening, reduced motion, long titles, missing artwork, light/dark themes, phone/tablet/desktop viewports and 200% text scaling. |
| Performance               | Search cache reuse, coalesced revision polling, hidden/offline pauses, retained loaded pages, bounded source requests, local hover previews, cached image behavior and the existing 100-card/4× CPU frame sample.           |

Browser checks use headless Chromium and emulated viewports/touch. The enlarged-text regression changes the root font size to 200%; it does not simulate a physical device's accessibility settings. Safari, Firefox, physical-device gestures and external Apple Calendar refresh behavior were not exercised. Upstream providers and accounts are disposable fixtures in browser tests, so this review does not establish current live-provider availability.

## Verification

- `npm run check` passed formatting, lint, TypeScript, all **261 unit/database tests**, and the encrypted-backup restore fixture.
- The isolated production build succeeded and the full `npm run test:e2e` run passed **140 browser tests**, including all six new regressions.
- The source/design detector and edit hooks reported no deterministic findings on the reviewed UI sources. Keyboard, responsive and visual checks supplement those results; this is not a full WCAG certification.
- The final 100-card headless stress sample, with 4× CPU slowdown and detail polling, recorded about **16.7ms median / 16.8ms p95** frame spacing. Its maximum gap was **200.1ms**, with two long tasks of **133ms and 59ms**. This is a local regression sample, not a production capacity result or a claimed speedup. Existing request coalescing, pagination, caching and bounded source work remain intact.
- `git diff --check` passed. The design documentation records the enlarged-text reflow behavior.

Machine-readable results are in [the verification record](measurements/site-quality-2026-11-05.json). Layout captures are under `outputs/review/`, including `site-quality-enlarged-{320,375,768}.png` and `site-quality-calendar-enlarged-{320,375,768}.png`.

No production deployment or live account mutation is part of this pass.

## Deployment follow-up

The user subsequently requested deployment. Production deployment `dpl_F8iix6V6fMXkTrq4zND3juoNnAyP` reached **READY**, and [A-List](https://a-list-nine.vercel.app) was verified against that deployment ID. The remote gate passed all 261 unit/database tests, backup verification, lint, types and formatting before building Next.js successfully. Read-only live smoke checks passed for mobile/desktop sign-in, privacy, authentication redirects, private endpoint protections and healthy public readiness, with no browser errors. The deployment's bounded runtime error/fatal scan returned zero records. Source came from the tested workspace, including its existing uncommitted changes; no Git commit or database migration was created for this release.

Deployment evidence is in [the production record](measurements/site-quality-deployment-2026-11-05.json).
