# WTS consistency, matching and queue completion — October 29, 2026

Released to [A-List](https://a-list-nine.vercel.app) as `dpl_9jXFZnCmEjwvLmixzNbdDRrWVQJw`.

The latest interface changes were inspected before implementation. The request/recovery handling, navigation state, membership updates, motion and performance-reporting changes were preserved. The baseline passed 199 unit/data tests; all 53 isolated browser scenarios subsequently passed. This release changes backend source verification, matching and scheduled work without adding a service or review screen.

## Automatic consistency checks

The existing refresh job now compares approved WTS evidence with stored windows across verified IMDb aliases. An unexplained missing or changed window gets an urgent source check; the audit never restores an old snapshot. Listed primary-source dates retain their preference. Confirmed withdrawals retire the corresponding approved proofs, preventing restoration loops. Failures and changed source formats retain last-good evidence and retry.

Native VOD/PVOD/SVOD fields remain the first source of dates. Where a native field has no current date, an existing approved announcement can supply it only after its current article and film identity are verified again. Article outages preserve last-good data; confirmed article withdrawals retire its proof. Verity, Resident Evil and 2000 Meters to Andriivka passed fresh checks through this path on the final release.

The live automatic-repair probe removed one unsaved film's WTS window, confirmed that the audit queued it without copying its snapshot, then dispatched the existing signed refresh job. Fresh WTS verification restored the window and cleared its urgent priority. No artificial gap remains. The final audit at 08:48 UTC found zero unexplained approved-evidence gaps.

## Matching and retries

The resolver first checks independently verified IMDb records already in the catalogue. Incomplete metadata can fall back to primary-source credits for fiction and nonfiction. Credited director prefixes are handled consistently during discovery and later refreshes. Failed candidates cannot be discarded to manufacture an apparently unique match. Positive TV-series evidence rejects the subject and invalidates any older approved mapping.

Matching rule 6 preserves valid mappings from earlier rules while isolating its identity cache. No title/year-only mappings or per-title exceptions were introduced.

The database queue prioritises unexplained gaps, overdue work, saved films and new or changed profiles. Four due profiles can share each existing bounded worker pass, with two concurrent source operations. Transient failures and partial checks retry with bounded backoff; repeated identity ambiguity backs off up to seven days for unsaved films. Saved profiles retry within a day. New source revisions reset the old retry state. Version, priority and attempt guards prevent stale workers from overwriting newer queued work.

The complete public index was refreshed. The catch-up checked 193 queued profiles, including 24 verified matches. At 08:51 UTC the inventory contained 804 profiles: 562 matched, 77 withheld, 58 ambiguous, 89 with insufficient evidence and 18 temporarily unavailable. The ordinary scheduler cleared the last due checks: zero were overdue, compared with 105 before the work. These are profile outcomes, not counts of newly imported movies; withheld includes sources without a publishable date. Ambiguous and unavailable profiles remain queued for automatic rechecks. Zero consistency gaps does not mean every WTS identity is resolved.

## Rollout and verification

- Applied `20261029074821_wts_consistency_and_fair_queue.sql` before deploying. Queue and reconciliation RPCs are service-only; no client database access was added.
- Created and restore-verified an encrypted application backup before the migration. Personal library rows, calendar credentials and existing movie/event IDs were preserved.
- Formatting, lint, types, 206 unit/data tests and the backup restore fixture passed. Both final local checks and the Vercel check/build gate passed.
- All 53 isolated browser scenarios passed against the preserved interface.
- Forced final-production refreshes retained the WTS windows for Filipiñana, The Odyssey, Forgotten Island and Primetime. The older Filipiñana short stayed separate and undated.
- A disposable-account save/feed/remove test passed: Filipiñana on October 27, 13:00–13:30 GMT, alarm at the start and stable UID. The account was deleted and existing accounts/libraries were unchanged.
- The bounded final-deployment runtime-error scan returned zero records.

Apply the new migration before deploying this code to another database. The existing ten-minute signed scheduler and operator commands continue to perform rechecks; no new service, scheduler or manual review workflow is required.
