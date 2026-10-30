# Motion production release — October 28, 2026

- Live URL: https://a-list-nine.vercel.app
- Deployment: `dpl_42VLsvPpPV5chiUTbYkjbmVLpowy`
- Build URL: https://a-list-kh6slq4ca-terence-yebuahs-projects.vercel.app
- Target/state: production / READY.
- Project/team: `prj_eV35BkjAL547jBP5t73vsI2fsmSC` / `team_QRbcE5QYR9UroFoG1dF2RVnz`.
- Source: reviewed working tree based on `c1de7fc`, including the existing backend changes and motion implementation. No commit or push was performed.
- Framework/runtime: Next.js 16.4.3 / Node 24.
- Rollback deployment: `dpl_HkQRAMdfGwUS7qfoz9rRJbHqKp3f`, https://a-list-jchkkqofm-terence-yebuahs-projects.vercel.app.

The user explicitly authorized production deployment and production testing after the preview backend setup was declined. No isolated database/Redis resource was created and no production credentials were copied into Preview.

## Release sequence

The existing authenticated Vercel CLI was used with explicit project and team selectors. The release was built using `--prod --skip-domain`, verified at its unique build URL, then promoted without rebuilding. A final inspection of the live domain confirmed the new deployment ID.

The local release check passed formatting, lint, TypeScript, all 187 unit/data tests and the synthetic backup restore check. All 23 isolated browser tests had passed for the same application source. The remote build repeated the check/build pipeline successfully and completed in approximately three minutes.

Database inspection was read-only: the existing profile inventory table, identity function and status columns required by this code were already present. No migration, scheduler or environment-variable change was required.

## Verification

Before promotion:

- Staged `/api/status`: HTTP 200, `{"status":"healthy"}`.
- Staged `/login`: HTTP 200 with A-List title and email form.
- Staged `/privacy`: HTTP 200.
- Staged `/api/health`: HTTP 401, `Sign in required`.

After promotion, the existing signed-in production browser was reloaded and exercised:

- Library loaded all six saved films.
- Movie details loaded; Escape closed the dialog and focus returned to its poster trigger.
- Cmd+K focused search; searching Odyssey returned matching records and the saved-film indication.
- Coming Soon filtered the view to three films; All films restored six.
- List view and grid view both worked. The original All films/grid state was restored.
- No save/remove or account action was performed; library membership was not changed by these checks.
- The bounded new-deployment error/fatal log scan returned zero records. This is a short observation, not ongoing monitoring.

## Readiness warning after promotion

The scheduled 16:50 UTC source refresh marked `wts_reports` unsuccessful. `/api/status` subsequently returned HTTP 503 with `{"status":"degraded"}`. Six source inventory records checked during that interval were marked `source_unavailable`, each with six failed attempts. The worker retained its normal retry/checkpoint behavior; no readiness flags were manually cleared.

The previous deployment's readiness endpoint returned the same degraded response against the shared backend. Thus switching the UI back would not itself clear the recorded backend failures. The release remains live because its signed-in interaction checks passed and there were no observed runtime exceptions; the previous deployment is retained for rollback if application regressions appear.

Source-sync investigation remains separate from this motion release. The failed-check counters show repeated unavailable records, but no full upstream/network diagnosis was completed here, so this record does not assert that every failure was caused by a provider outage.
