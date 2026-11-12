# Public readiness implementation — 2 November 2026

Implemented in the existing working tree based on `539dfb1`, preserving the uncommitted UI and application work already present. The additive migration was applied through the connected Supabase service at 21:10 UTC. The final application deployment is live in London. Verified-email signup stays open.

| Audit item                   | Implementation                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. WTS identity invalidation | Fingerprints include runtime, theatrical date, nonfiction and series evidence. Legacy approved fingerprints are upgraded from the stored profile, so new page facts cannot silently inherit the previous fingerprint. Matching rule/cache namespace advanced.                                  |
| 2. Search deadline           | Search handlers have a seven-second total deadline, including auth and throttling. Provider work shares the remaining budget; completed local/provider results survive a failed peer. The proxy bounds its auth request to two seconds, below the browser's ten-second timeout in combination. |
| 3. Security headers          | Enforced framing/base/object CSP, frame denial, MIME sniffing protection, no-referrer policy and disabled camera/microphone/geolocation. Existing session responses remain private/no-store.                                                                                                   |
| 4. Browser reliability       | The harness now copies the real `proxy.ts`. The intermittent Discover test waits for the actual catalogue response and rendered target before advancing time. Added expired-session cookie refresh and security-header verification.                                                           |
| 5. Worker scheduling         | Discovery precedes bounded saved-film work and WTS verification. Catalogue and missing-window phases have remaining-time limits; separate checkpoint room and phase durations are recorded.                                                                                                    |
| 6. WTS queue fairness        | Inventory priority, saved status and due timestamps survive merging with RSS. Integrity repairs, overdue work and saved films rank first; ordinary batches reserve representation for both inventory and RSS.                                                                                  |
| 7. No-date identities        | A service-only RPC stores approved identity independently of releases. Verified TBA profiles retain their mapping, publish no invented date, and still withdraw explicitly removed windows.                                                                                                    |
| 8. Adaptive lookup cadence   | Saved/recent films stay daily; old unsaved negative checks back off to two/four/seven days. Alias checkpoints move together, cached checks preserve misses, source changes reset cadence, and indexed profiles are consulted before RSS fallback.                                              |
| 9. Diagnostics               | Persist stage, category, duration, HTTP status where present, and last successful check. Local budget/database errors retry quickly without increasing provider failure counts. Owner health includes queue age and recent diagnostics.                                                        |
| 10. Profile field states     | Absent, explicit TBA/withdrawn and malformed fields are separate. Malformed/previously populated missing windows remain partial and retry sooner, preserving last-good dates.                                                                                                                  |
| 11. Archive outages          | Per-source catalogue partitions retain films and successful timestamps on failure. Successful replacement retires old partition contents. A bootstrap fallback preserves prior catalogue coverage before partition history exists.                                                             |
| 12. Enrollment and recovery  | Open verified-email behavior retained. Runbook updated, real proxy/email/calendar fixture flows verified, backup state rechecked. The real sign-in email was delivered, and the owner confirmed sign-in and calendar subscription work on their device.                                        |
| 13. Catalogue reads          | One compact canonical snapshot RPC replaces JSON download plus multiple hydration reads. Database-backed revisions and a shared Redis fill lease handle cross-instance caching and missed invalidations. Shared payloads omit personal membership and detail-only synopsis fields.             |
| 14. Fonts and posters        | Inter and Figtree WOFF2 files and OFL licenses are bundled locally. Builds no longer fetch Google Fonts. Broken poster URLs switch to the existing local placeholder while retaining dimensions.                                                                                               |

## Validation

- `npm run check`: formatting, ESLint, strict TypeScript, unit/database tests and encrypted-backup fixture. **246/246 tests passed.**
- Full isolated production browser build and suite: **66/66 passed**.
- After the final search/proxy deadline changes: **4/4 affected browser scenarios passed**, including the previously intermittent revision scenario and real session refresh.
- The complete migration chain was exercised in disposable PGlite, including service-only privileges, identity conflicts, no-date persistence, canonical cache invalidation, alias lookup resets and compact authenticated reads.
- Supabase production migration dry run: only `20261102211042_pilot_readiness.sql` is pending. The connected service subsequently applied the identical SQL as `20261102211042`; the recorded SQL MD5 `158c793b581ba0e4120c992044c4e026` matches the local file exactly. The filename was aligned to this recorded timestamp.
- Vercel connector confirmed project `a-list` / `prj_eV35BkjAL547jBP5t73vsI2fsmSC`, team `team_QRbcE5QYR9UroFoG1dF2RVnz`, Node 24 and canonical domain `a-list-nine.vercel.app`.
- Supabase backup inspection: `backups=null`, `pitr_enabled=false`. No recovery point was demonstrated, no rows were exported and no paid backup setting was enabled.

## Live release and acceptance

1. The migration is applied, and production deployment `dpl_9J4oo6NHnczAv843wuwdjAx8UzEy` became READY at 21:16 UTC. The canonical domain was verified against that deployment. The London-region redeployment followed the owner's explicit approval and became READY at 21:22 UTC, as recorded below.
2. The one authorized sign-in email was sent through the live UI to `tyyebuah@gmail.com` at **21:20:02 UTC**. Resend reported **delivered**. The owner subsequently confirmed **sign-in and calendar subscription work** on their device. No second email was sent.
3. Public signup/confirmation settings and verified Resend sending domains were checked through existing credentials/connections. Exact hosted SMTP quotas were not re-read; the keychain-backed configuration command was cancelled and was not used for rollout.
4. A full provider backup and real account recovery drill remain outside the prior tooling-only choice. The existing synthetic application restore check does not prove Supabase Auth or whole-project recovery.

The changes add no new hosted service, paid plan, recurring notification or invite restriction. External sources can still be unavailable or ambiguous; the implementation deliberately retains conservative identity matching and last-good dates.

## Live migration verification

The compact RPC returns all **628** catalogue films in **592,871 bytes**, compared with **818,304 bytes** for the previous snapshot (27.5% less before compression). Anonymous catalogue execution and authenticated identity writes are denied. Queue health at the post-migration check showed no saved-film/profile checks due and 55 eligible lookup rows due, with the oldest about an hour old.

The security advisor reported the existing informational no-policy notices for three intentionally service-only RLS tables and the existing leaked-password-protection warning. This release does not add password sign-in or change those protections. See Supabase's [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [RLS notice explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Public Auth settings confirm that signup remains open and email confirmation is required. The connected Resend service reports both sending domains verified; the single authorized live email test was delivered and confirmed by the owner.

## Production behavior

- The signed scheduled worker at **21:20 UTC** completed in **13,586 ms**, with **zero failures**. Phase durations: discovery 2,121 ms; saved-film checks 656 ms; WTS expansion 515 ms; catalogue skipped because current; missing-window lookups 8,129 ms. Database verification found eight adaptive lookup checkpoints, an advanced WTS change cursor, and no overdue saved-film/profile checks.
- Public `/api/status` returned `healthy`; anonymous `/api/health` returned application HTTP 401 with `Sign in required`. Login and privacy returned 200 with all new security headers, local WOFF2 references and no Google Fonts dependency.
- A short post-release runtime-error scan returned no errors. This is a bounded observation, not a long-term uptime claim.
- Read-only reconciliation of the previously problematic **Cliffhanger** profile returned `verified_no_date` in **5.779 seconds**, with no publication, unresolved match, date withdrawal or invented date.
- The upload package contained 347 explicitly selected source/configuration files, excluding credentials, keychain data, local tool state, generated output and dependencies. Its SHA-256 was `3529e97503b467fc78f4ddad94a334187a65e56e3bdeb389c3c9b600f777092b`. The package itself passed all 246 tests and the backup self-test before upload. The existing working tree remains uncommitted.

## Final deployment

- Deployment: `dpl_7Rso1SAHHgCHd8LTqg5qSMx4wkeC`, READY at **21:22 UTC**, execution-region configuration **lhr1 (London)**.
- Canonical domain: [a-list-nine.vercel.app](https://a-list-nine.vercel.app), explicitly verified as pointing to the final deployment.
- Source: redeployment of the same tested 347-file package; region-only change after the first successful production rollout. The owner explicitly approved the persistent London setting. No further keychain-backed CLI calls were used.
- All remote release checks and production build passed. The final bounded runtime-error scan returned no errors.
- The sign-in request screenshot is saved locally in ignored `outputs/review/sign-in-email-sent-2026-11-02.png`. It records the email-sent confirmation, not the owner's private library or calendar URL.

No further implementation or device acceptance action remains for the fourteen-item audit. Optional future operational work is a separately approved full-provider backup/recovery drill and exact hosted SMTP quota inspection; neither was silently enabled or changed.
