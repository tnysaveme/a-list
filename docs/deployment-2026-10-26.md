# A-List production deployment — October 26, 2026

The owner explicitly authorized the production migration and application deployment. The release was deployed from the tested local working tree, including uncommitted additions; no Git commit or push was performed.

| Field               | Result                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| Production URL      | https://a-list-nine.vercel.app                                                |
| Vercel project      | `a-list` / `prj_eV35BkjAL547jBP5t73vsI2fsmSC`                                 |
| Team                | `terence-yebuahs-projects` / `team_QRbcE5QYR9UroFoG1dF2RVnz`                  |
| Deployment          | `dpl_jJ75BzmFwvgmHJLXEP2sJ3rc93Mj`                                            |
| Build URL           | https://a-list-qxpo11ve0-terence-yebuahs-projects.vercel.app                  |
| State / environment | READY / production                                                            |
| Source              | Working tree based on `875c8d7`, with the reviewed local changes              |
| Framework / runtime | Next.js 16.4.3 / Node 24                                                      |
| Database migration  | `20261026183555_release_consistency.sql`, applied and verified before release |
| Remote build        | Approximately two minutes; completed at 18:41 UTC                             |

The existing Vercel CLI login confirmed the linked project and team. The connector lacked access to this team, so deployment used the authenticated CLI. An upload dry run confirmed that credential files, generated builds, backup/output contents and browser artifacts were excluded. The empty output-directory entries in the manifest contained no files.

The release used `--prod --skip-domain`. The staged build passed readiness and access checks before promotion. A subsequent inspection confirmed that `a-list-nine.vercel.app` points to this deployment.

## Verification

- Vercel ran formatting, ESLint, strict TypeScript, all 156 unit/database tests and the synthetic encrypted-backup restore check, then completed the production build.
- The existing local browser suite had passed all 10 cases before release.
- Both staged and live `/api/status` returned HTTP 200 with exactly `{"status":"healthy"}`.
- Both staged and live `/api/health` and `/api/init` returned HTTP 401 without an authenticated session.
- Live `/privacy` returned HTTP 200.
- An isolated anonymous Chromium session followed the production root to `/login`, rendered the email input and reported zero page errors. No email was submitted and no account mutation was performed.
- The new deployment's bounded runtime error scan returned zero records as of 18:42 UTC. This is a short post-release observation, not a long-term availability guarantee.

The public login screenshot is in ignored `outputs/review/production-login-2026-10-26.png`.

## Operational state

The existing ten-minute QStash schedule was not changed. Health transitions remain structured logs only. No production rows were exported. The new GitHub health workflow remains local until the working tree is committed and pushed to the default branch; a Vercel CLI deployment does not activate a GitHub workflow.

Real signed-in/device acceptance, calendar-client refresh behaviour and production cold-query/concurrency measurements remain acceptance checks. The [operations runbook](operations.md) describes rollback: retain the additive database migration if rolling back the application.
