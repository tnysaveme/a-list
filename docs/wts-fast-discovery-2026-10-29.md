# Frequent WTS discovery — October 29, 2026

Released to [A-List](https://a-list-nine.vercel.app) as `dpl_GUaXKtXKfZyZDMDp2GNRnSHGD3aM`, using the staged production build that passed its sign-in smoke before promotion. Commit base: `c1de7fc`, with the existing working-copy changes preserved. Vercel's check/build gate passed and the build reached READY in approximately 129 seconds.

The existing ten-minute refresh job now checks announcements and recently modified WTS profiles independently of the six-hour catalogue refresh. It publishes only dates that pass the existing movie identity and source checks. The normal target is roughly 10–20 minutes after WTS exposes a change; this is not a guaranteed maximum during upstream failures, unresolved identities or a busy queue.

## Changes and cost

- The shared two-page RSS snapshot refreshes on each normal job pass. Its nine-minute cache allows one minute of scheduler jitter and suppresses immediate duplicate requests. Legacy six-hour cache timestamps do not delay rollout. Partial failures keep the prior work and retain the fifteen-minute retry.
- A modified-page query reads at most 100 compact records containing native ID, URL, title and modification timestamp. It queues only new or changed revisions through the existing idempotent database function. An unchanged or empty response does not schedule film-page verification.
- A persistent service-only JSON cursor freezes the upper timestamp during a paginated catch-up. The cursor advances only after queuing the current page, with a two-minute overlap at the lower boundary. Failed requests or queue writes retain replayable progress. A stale worker cannot overwrite a newer cursor.
- The complete page index remains an independent recovery scan with a six-hour pause between completed sweeps. Saved-film priority, ordinary refresh intervals, the five-item expansion limit, two concurrent film checks and the existing time budgets remain in force.

In steady state, discovery adds one small modified-page request per job and refreshes the two RSS pages more frequently. The complete index adds a request when due. A live six-hour change query returned four records in 718 bytes; this measures the compact index response, not the RSS pages or later film checks. No visitor polling, new scheduler, service, dependency or review screen was added.

## Verification

- Formatting, lint, types, 210 unit/data tests and the backup restore fixture passed.
- All 53 isolated browser scenarios passed.
- An integrated fixture discovered an edited native profile and published its current VOD date while the full-index cache remained six hours away. It used one compact index request and one native profile request.
- Cursor tests cover timestamp overlap, bounded pagination, fixed-window resume, outages, ignored source filters, failed queue writes and immediate cache reuse. Existing database fixtures verify unchanged revisions do not requeue films and new revisions reset retry state.
- An encrypted application backup was created and restore-verified before applying `20261029154220_wts_incremental_discovery.sql`. The migration adds only a rebuildable status cursor and expires the legacy announcement delay. Server-only access and existing account/library data are preserved.
- The signed production refresh completed at 15:46:45 UTC with zero job failures. It persisted the change cursor, set the RSS cache nine minutes ahead, and kept the full scan scheduled independently at 21:30 UTC. Immediate repeated discovery calls reused both snapshots with zero WTS requests.
- Forced production refreshes preserved dates for Filipiñana, The Odyssey, Forgotten Island and Primetime. A disposable-account save/feed/remove check retained the 13:00–13:30 GMT block, alarm at the start and stable UID. The older short remained separate, the test account was deleted and existing accounts/libraries were unchanged.
- The final database check found 804 indexed profiles, zero due checks and zero unexplained approved-evidence gaps. The bounded runtime-error scan returned zero records. The existing active ten-minute QStash schedule was verified without changes.

Rollout uses the existing A-List project and production domain, with the additive migration applied before promotion. Apple Calendar still controls its own subscription refresh interval after website dates have updated.
