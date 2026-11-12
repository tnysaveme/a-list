# Code efficiency review — 5 November 2026

Reviewed the production app, hooks, components, shared libraries, database row contracts, scripts and dependencies. Import/export scans included 238 source/test files after adding the focused regression coverage. Candidate dead code was checked against routes, dynamic imports, scripts and tooling references rather than deleted solely because it had no ordinary import. Existing user changes were preserved.

## Changes

- Release-window selection is a single pass over verified evidence. It preserves available/upcoming intent, listed/unconfirmed priority and the existing stable same-day tie behavior. Catalogue ordering reuses already-sanitized releases instead of validating and sorting them again.
- Catalogue sorting computes lowercase title keys once per film. Its code-point comparator reads the strings directly, avoiding two temporary character arrays per comparison while preserving Unicode order, title prefixes and ID tie breaks.
- Calendar line folding counts UTF-8 bytes by code point, avoiding a TextEncoder instance and typed-array allocation per character. Calendar content, UIDs, alarms and the 75-byte physical-line limit are unchanged.
- Mounted poster cards share one hover-capability media query and one browser change listener. The last subscriber removes the listener; subsequent mounts obtain a fresh query. Server snapshots still avoid browser access, and touch behavior remains direct opening.
- Removed the unused `readLibraryMembership` and `lookupMovieReports` wrappers, `CacheRow` type, the `checked` re-export from the large data module, two redundant React imports and the no-op catalogue `fresh` parameter/query flag. Actual revision validation remains intact.
- Library writes reuse the existing database-result checker. Health reads import that checker directly rather than through the full data module.
- TypeScript now rejects unused locals and parameters in the checked project, preventing this class of cleanup from accumulating again.

Registered Next route exports, development interaction sheets, Sites/connector runtime files and operational scripts were retained. No dependency was removed without evidence that its runtime/tooling consumers were gone. No database migration, permission change or new package was required.

## Measurements

The reproducible input shape uses the checked-in catalogue, repeated to the stated size with unique IDs and prefixed titles. Measurements alternate before/after calls, take 20 samples per version after six warm-ups and report the median on Node 24.22.0. Calendar generation uses a fixed timestamp and produced identical output. These are local CPU/serialization fixtures, not production response-time or capacity claims. Full measurements are in [the JSON record](measurements/code-efficiency-2026-11-05.json).

| Workload                         |    Before |    After | Reduction |
| -------------------------------- | --------: | -------: | --------: |
| Release sort, 10,000 films       |  27.71 ms |  9.31 ms |       66% |
| Title sort, 10,000 films         |  10.31 ms |  7.79 ms |       24% |
| Theatrical sort, 10,000 films    |  17.73 ms | 10.32 ms |       42% |
| Calendar generation, 1,000 films | 143.74 ms | 12.15 ms |       92% |

A seeded 16,500-case comparison against the pre-change source found equivalent catalogue pages, release selections and calendar text across every supported filter/sort combination, empty records, duplicate same-day windows, invalid dates and mixed Unicode titles. Permanent regressions cover same-day selection ties, non-BMP title order, mixed-width UTF-8 folding and a 200-subscriber hover lifecycle with exactly one browser listener.

## Verification

`npm run check` passed formatting, lint, TypeScript, all 261 unit/database tests and the encrypted-backup restore fixture. Both authentication emails rendered successfully after removing their unused imports, with unchanged generated templates; the standalone renderer now uses explicit `createElement` calls rather than depending on an implicit classic-JSX React binding. The isolated production build compiled successfully. All 134 browser scenarios passed in one full run, including auth/sign-out, hover/focus/touch, catalogue ordering and filters, stale/lost-response recovery, watched history, refresh and pagination, calendar behavior, responsive layouts and source evidence.

## Production deployment

Deployment `dpl_7KGqdZ7rwHaTP5PSdGX23Knnsg1e` reached READY on 5 November 2026. The canonical <https://a-list-nine.vercel.app> alias was verified against that deployment ID. Production repeated the check gate and all 261 tests before building; the preflight upload manifest verified 408 source files and excluded credentials and generated artifacts.

Read-only smoke checks passed for login, confirmation, privacy and both auth images. The login form and decoded image rendered without browser errors, and unauthenticated membership requests retained their 401 and no-store response. The new deployment returned zero error/fatal runtime records after the smoke checks. Authenticated library and calendar flows were verified against isolated local fixtures without changing production account data.
