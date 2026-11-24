# Friends-only account controls — October 25, 2026

The owner clarified that A-List is for the owner and friends. Keep email sign-in and the existing IP/email throttles; no CAPTCHA, Cloudflare account, support inbox or paid service is added. A short `/privacy` data note accompanies a single Account panel.

## Changes

- Upgrade the identified vulnerable Zod dependency from 3.25.76 to pinned 4.6.7. Adapt the preview protocol's record schemas to the v4 key/value API and test its strict grants and response projection.
- Download a complete JSON library export, including unknown-date films, original saved times and reported-date preference. Exclude secret feed URLs and credentials. A single database snapshot avoids pagination truncation and inconsistent cross-page reads.
- Reset the authenticated user's calendar link with an explicit confirmation. Existing account triggers advance the revision. Old links fail authorization before any cached calendar can be returned. The UI explains that the old subscription must be removed and the new link subscribed to.
- Delete only the authenticated user's account after typing DELETE. Globally revoke refresh sessions before Auth deletion; clear local session cookies afterward. Existing foreign keys delete the account/library/cache and null any historical reviewer reference. Shared source films remain. No body-supplied user ID or service key reaches the browser.
- Owner-scoped export/reset SQL functions use security-invoker, empty search paths, existing RLS and no anonymous execution grants. Account operations have an additional ten-per-hour per-user throttle. POST origin checks and JSON bounds remain in force.

## Sign-in review

Resend's connected account reports 100 emails/day and 3,000/month, with zero sent today and one this month at review time. Aggregate October 23–25 delivery: one sent, one delivered, zero bounces, failures or complaints. These are provider delivery events, not an independent inbox placement test. Existing project notes document a 30-auth-email/hour Supabase cap; that live Auth setting was not changed or independently re-read. Existing IP throttle: eight per 15 minutes; per-email: three per 15 minutes. Provider caps still apply to any direct Auth API requests.

CAPTCHA can be reconsidered if unwanted sign-ups or abuse appear, or the audience expands. No paid capacity or authentication limits were increased.

## Source use

See [source-use-review-2026-10-25.md](source-use-review-2026-10-25.md). Review completed; explicit redistribution rights remain unconfirmed. The clarified small-group scope does not imply permission, and no provider outreach was sent.

## Verification

All 80 isolated tests pass, along with ESLint, TypeScript and the optimized production build. The fresh production dependency audit reports zero vulnerabilities. The connector regression covers the major-version record API change and rejects broadened grants.

Migration `20261025132526_account_privacy_controls.sql` was applied. Both new RPCs are security-invoker; anonymous execution is denied. Existing Supabase advisory notices remain unchanged: two informational notices for intentionally private RLS tables without client policies ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), and the existing unused password-protection setting ([reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

The final built server passed the disposable integration suite: complete private export, unknown-date films, origin and typed-confirmation checks, cached old-link revocation, user-ID injection isolation, session revocation, session-cookie clearing and deletion cascades. Tests send no email and do not touch the owner's browser session. Fixture accounts and their two movie records were removed. The original library digest remains `352bac852a62aa0d3c8ee610fa8584b4` (three films), with all ten historical review records intact.

The public data note is accessible without sign-in; export/reset/deletion require authentication. Existing public sign-in/API/calendar boundary smoke checks also pass.

Browser verification on the canonical app confirmed the new Account entry and a real export download with exactly three films, original saved times and no feed secret. Reset uses an explicit typed confirmation and was cancelled on the owner's account. Reset and permanent deletion were executed only on disposable fixtures. Confirmation inputs receive focus and scroll into view; cancellation returns focus to the invoking control. The account button is outside the personal label hidden on phones; sign-out is also available in the panel.

The first staged production build was verified and promoted as `dpl_6xPmjKx6TwPWcHutwKqi1CeGYhgY`. The final build includes the confirmation-focus improvement. No server-only credential values were found in compiled client JavaScript. Post-release error scan: zero records.

Final deployment: `dpl_J36VrXrhYjCjEd7FTDbCbcjLJAJe` ([A-List](https://a-list-nine.vercel.app)), production target, staged READY and checked before promotion. The account panel was visually checked at a 320-pixel emulated viewport; text wraps, controls remain reachable and the panel scrolls. This is browser emulation, not a physical-device check. No commit was created.

The final phone-width browser check confirmed that reset and delete confirmations focus their text field, keep the action disabled until the exact phrase is entered, and restore focus on cancellation. Both were cancelled on the real owner account. Browser responsive tools were closed afterward. The final public endpoint smoke check passed; final deployment runtime error scan returned zero records.
