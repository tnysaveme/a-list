# WTS end-to-end reliability — 13 November 2026

The integration now separates successful discovery from successful processing and keeps unfinished announcement work outside the bounded RSS snapshot.

## Matching

A series result excludes that shortlisted candidate; it cannot classify other namesake films or the WTS subject as a series. Candidates with unavailable evidence still prevent a unique match. Explicit WTS series evidence and exact verified-subject checks keep their existing safeguards. Metadata must return the requested IMDb ID before its media type can be trusted. Matching rule 9 preserves earlier approved mappings while isolating its identity cache; title lookups use namespace v13. Previously excluded non-series profiles and announcement outcomes receive a fresh bounded check at rollout.

## Durable announcements and catch-up

`a_list_wts_announcements` is a rebuildable, service-only source cache with RLS enabled and no anonymous or authenticated access. The additive migration seeds it from the current recent-feed buffer. Polling queues every fetched report before trimming that snapshot to 80 entries. Unfinished entries survive both snapshot eviction and the seven-day recent-feed boundary. New revisions reset retry state. Source revision, queue version and attempt guards prevent stale checkpoints from completing newer work.

Complete announcements are rechecked while recently visible, then retired from scheduled work after seven days without another observation. Only complete entries unseen for thirty days are pruned. Unresolved identities back off up to seven days; availability failures and partial checks back off up to a day. Local budget exhaustion remains due. The cache is excluded from personal-data backups and rebuilds through normal discovery.

Normal expansion retains a five-item limit. Eight due profiles/announcements, or work more than thirty minutes overdue, enables a sixteen-item catch-up limit. Up to twelve profiles and eight announcements can enter selection, sharing at most two concurrent film checks and fourteen seconds of source work. Saved-film refreshes run first. The existing overall job deadline and ten-minute scheduler remain in place; catch-up is bounded capacity, not a freshness guarantee.

## Readiness

Public status still returns only readiness. Owner health and scheduled health transitions now use the same live queue health and stored discovery/audit checkpoints. Readiness degrades for:

- Profile, announcement or saved-film work over an hour overdue; title lookups over a day overdue.
- Missing queue diagnostics, an audit over ninety minutes old, or unexplained approved-evidence gaps.
- A complete recovery scan over twelve hours old, in addition to the existing feed and incremental-discovery freshness checks.

Discovery and report verification record separate source checks, so a successful index request cannot clear a report failure.

## Date provenance and drift

Each release window shows its own source-check date, or explicitly states that its verification date is unavailable. Independently verified conflicting WTS evidence is retained alongside a preferred listed primary date and explained in film details. Verified aliases receive the same conflict evidence. Agreement or retirement of the supporting report clears the disagreement. Calendar dates, IDs and UID rules continue to use the selected release windows; check timestamps and conflict annotations do not change calendar content revisions.

Captured public HTML/RSS excerpts cover N/A fields, punctuation, split TBA markers, canonical subjects and original WordPress structure. `npm run wts:drift` checks the corresponding live public profiles and feed without credentials or writes. The daily workflow records failures in logs and sends no messages. Legitimate date changes are allowed; source format and subject changes fail the check.

Apply the additive migration before deploying the new worker. Validate service-only permissions and create/restore-verify the encrypted application backup before migration. Release checks include database concurrency/retention regressions, real-source fixtures, per-window rendering and phone-layout browser coverage.
