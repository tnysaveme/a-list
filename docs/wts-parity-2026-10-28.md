# WTS profile reconciliation — October 28, 2026

Deployed to [A-List](https://a-list-nine.vercel.app): `dpl_8PdUMaCgY7G1yqobeKmjjsfFd5F3`.

The shared resolver now handles line-break fields, sparse documentary/concert credits, presentation titles and restoration years. Director-credit prefixes are removed from search titles only when they match the profile's director. Sequel numbers and ordinary subtitles remain significant. The four outstanding cases—EPiC, Billie Eilish, Cookie Queens and Pan's Labyrinth—passed both automatic discovery and live stored-film checks. EPiC's malformed PVOD year remains unknown; its valid subscription date was published.

The existing scheduled job indexes WTS's public WordPress page API and reconciles due profiles with stored dates. It checks one index page and up to two film profiles within its existing time budget, prioritising saved-film work first. Oldest due checks take precedence so repeated failures cannot indefinitely starve other films. Changed source revisions requeue work; temporary failures back off and uncertain identities retry automatically. There is no new service or user review workflow.

## Initial full sweep

All nine index pages were fetched: 864 pages, comprising 803 film profiles and 61 calendar/archive/About pages. Every film profile was attempted; no unstarted inventory rows remained.

| Outcome                                                 | Profiles |
| ------------------------------------------------------- | -------: |
| Matched and published/checked                           |      486 |
| Explicit TBA/withdrawal fields with no publishable date |       53 |
| Insufficient identity evidence                          |       90 |
| Ambiguous identity/candidate shortlist                  |       67 |
| Provider/source unavailable                             |       92 |
| Source-work deadline reached                            |       15 |

The inventory audit recorded **379 missing release windows repaired**, one changed window and eight conflicts where the existing listed primary-source date retained priority. No stored windows were withdrawn during this sweep. Operator logs can omit a row completed during the checkpointed restart; these counts come from the final database inventory.

This is a measured coverage improvement, not complete date parity. The 157 identity gaps and 107 availability/deadline failures remain on automatic retries. Missing or malformed date fields preserve last-good evidence. The inventory covers native profiles; existing RSS and title lookups continue to handle announcements.

## Verification and recovery

- 183 isolated unit/database tests passed, including series rejection, sparse-credit matching, line-break fields, duplicate-date rejection, queue permissions, revision guards, retries and date reconciliation.
- Formatting, lint, types, backup restore checks and production builds passed.
- Live authenticated film checks and a disposable-account save/feed/remove round trip passed. Events remained 13:00–13:30 GMT with an at-start alarm. The test account was deleted; existing accounts and libraries were unchanged.
- The scheduled production job completed successfully with the inventory enabled. The final deployment's runtime-error check returned zero records.
- An encrypted application backup was restore-verified before migration. The service-only inventory is rebuildable source cache, excluded from personal-data backups.

Apply `20261027235816_wts_profile_inventory.sql` before deploying this worker to another database. Use `npm run wts:reconcile -- --limit 1000` for a read-only source-to-storage audit. `--repair --due --concurrency 4` resumes a bounded one-off catch-up; `--repair --index` refreshes the public inventory. Personal libraries and calendar credentials are not edited by these commands.
