# WTS reliability — 12 November 2026

Investigated the production `wts_reports_failed` state after syncing the deployed
application into Git. The worker and discovery cursor were current, with no
overdue profile, saved-film or title-lookup work at the initial inspection. The
816 indexed profiles then comprised 618 matches, 97 verified profiles without
dates, 96 insufficient-evidence outcomes, three ambiguous identities and two
source-unavailable outcomes. These are a point-in-time inventory, not a claim
that every source film has enough independent identity evidence to import.

## Reproduced defects and fixes

- [Bad Day](https://whentostream.com/bad-day-2026/) and
  [The Take](https://whentostream.com/here-comes-the-flood-2026/) list `N/A` for
  premium rental alongside explicit Netflix dates. The parser incorrectly treated
  `N/A` as malformed, repeatedly publishing a partial match and failing source
  health. `N/A` and `not applicable` now follow the existing explicit-undated
  window handling. They never supply a date and can withdraw only a matching
  source's affected window, preserving other kinds and primary-source priority.
- [The Bay](https://whentostream.com/the-bay-2026/) uses `July 17. 2026`. That
  punctuation prevented its verified digital window from being imported. Named
  date parsing now accepts the period/comma variants, including compact commas,
  while validating actual calendar days and rejecting malformed years.
  Read-only reconciliation identifies its exact IMDb subject and the missing
  home window. The same check finds a missing window for
  [The Step Daddy](https://whentostream.com/the-step-daddy-2026/).
- [Iron Boy](https://whentostream.com/iron-boy-2026/) contains the split marker
  `TB A`. Split TBA/TBD tokens now remain undated instead of generating a format
  error. Read-only checks of Iron Boy and
  [Saturn Return](https://whentostream.com/saturn-return-2026/) produce complete,
  undated outcomes without inventing releases.
- Fully successful WTS checks retained earlier WTS format warnings on stored
  movies. Publication now clears recovered WTS issues and retains unrelated
  primary/metadata issues. Partial WTS checks likewise retain other providers'
  diagnostics instead of replacing them.
- Missing metadata records and contradictory identity evidence were classified
  as WTS unavailability. They now remain explicit unresolved identity outcomes,
  with bounded retries and operator diagnostics. They cannot publish a new date,
  claim a successful identity match or invalidate last-good windows solely because
  corroborating metadata is unusable. Real native-subject conflicts, explicit
  withdrawals, HTTP failures, malformed source responses and timeouts retain
  their existing safeguards.
- Lookup failures previously logged no affected film or category. Logs now add
  public film ID, verification stage, safe error category, duration and HTTP
  status when known. Raw errors, credentials and private URLs are excluded.
  The title-lookup namespace advances from v11 to v12 so old parser outcomes
  cannot hide a fresh check.

The source identity gate remains exact. In live read-only checks, V/H/S Mixtape
remains an identity-evidence conflict and Unidentified remains insufficiently
corroborated. Their dates are not imported by relaxing title/year matching.

## Verification and release

Regressions first reproduced the N/A, punctuation and warning-recovery defects.
Coverage includes explicit undated windows, malformed input, impossible dates,
source-specific recovery, metadata identity conflicts, last-good date retention,
safe diagnostic logging, unresolved-work backoff and calendar event identity/time.
The local isolated browser suite passed all 140 scenarios, including calendar
preferences, feed contents, watched recovery, release-market midnight and failure
handling. The final CI result and deployment evidence are recorded on the release
pull request.

The release includes an opt-in disposable-account live calendar check. It sends
no email and uses the normal sign-in, library and anonymous subscription endpoints.
It verifies stable event UIDs and feed links, 13:00 UTC reminders, conditional
refreshes, watched exclusions and recovery, removal and cleanup. It does not
simulate Apple's own refresh scheduling or change the owner's account.

Rollout repairs must run through the same verified-source publication path after
deployment. Recheck the affected profiles, confirm successful signed worker
delivery and inspect readiness; do not clear health flags manually. No schema
migration, scheduler change, billing change or notification service is required.
