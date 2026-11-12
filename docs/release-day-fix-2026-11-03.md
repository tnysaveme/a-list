# Release-day classification fix — 3 November 2026

## Behavior

- Listed releases dated today or earlier are Available. Coming Soon requires a later date in both the database library query and Discover.
- A film with an already released rental and a later subscription release may still appear in both filters; each filter displays its qualifying window.
- Rumored dates never become Available just because their date arrives. They remain under Unconfirmed and All.
- Today's reminders remain in the calendar and this-week summary. Same-day listed dates take precedence over rumored dates in upcoming previews.
- Malformed dates and unsupported confidence values cannot affect filters or calendar previews.
- The UI shares the source-market day (America/New_York) with server and database logic. Open tabs check for a new day every 30 seconds and on resume; collection cache freshness also includes the day.

## Verification

- 248 unit/database tests passed, including release-day boundaries, DST, invalid dates, same-day certainty, full-library summaries, account isolation and anonymous-access denial.
- All 73 existing browser tests passed. Both new release-day browser tests passed three consecutive runs after correcting test synchronization.
- Production migration `20261103181512_release_day_boundaries` applied successfully. Production deployment details follow below.

No stored movie dates, library memberships, calendar identifiers or reminder times were changed.

## Production verification

The live authenticated library query places Primetime, Resident Evil, and Your Mother Your Mother Your Mother under Available, and excludes all three from Coming Soon. The migration SQL MD5 matches the local file: `d116b0813c466f12ad77357f918bb0b3`.

Source upload: 353 files; SHA-256 `1163e1a07e65a86cd494c72b950e0c93b7a4b3c68a121ad4f763d0e8629543c6`. Deployment: `dpl_7kMMgt8RQoGakpHvXTnTu2CUbrba`; London (`lhr1`), production.

Function permissions remain SECURITY INVOKER with an empty search path, executable by authenticated users only. Post-migration security advisor findings are unchanged: informational missing-policy notices for three service-only tables, plus the existing leaked-password-protection warning for the passwordless app. See [RLS policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Deployment READY at 18:19:36 UTC (194 seconds build duration). Production alias: https://a-list-nine.vercel.app. Post-release checks: public status healthy (200), private health endpoint protected (401), login and privacy pages 200. The bounded runtime-error scan from deployment readiness found no errors. Function region remains London; edge ingress can vary by request location.
