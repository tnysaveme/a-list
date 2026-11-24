# Motion preview — October 28, 2026

- Preview: https://a-list-5wcuzi9rq-terence-yebuahs-projects.vercel.app
- Deployment: `dpl_DjpBokdShvs5rfaA16tkXCEHj8a3`
- Project: `a-list` / `prj_eV35BkjAL547jBP5t73vsI2fsmSC`
- Team: `terence-yebuahs-projects` / `team_QRbcE5QYR9UroFoG1dF2RVnz`
- State: READY; target: preview; Next.js 16.4.3 / Node 24.
- Source: current uncommitted working tree based on `c1de7fc`, including existing backend changes and the motion implementation. No Git commit/push or database migration was performed.

The existing CLI login was used because the connector does not have this team's access. The deployment used explicit preview, project and team selectors. Remote formatting, lint, TypeScript, all 187 unit/data tests, synthetic backup restore, and the optimized Next.js build passed. Local browser verification had passed all 23 cases before deployment.

The upload excludes local environment files, credentials, keys, dependencies, generated builds and browser artifacts. Impeccable tool state was also excluded. Deployment Protection remains enabled; checks used authenticated `vercel curl` without disabling it.

## Verification and configuration gap

- `/login`: HTTP 200; A-List page title and email input rendered.
- `/privacy`: HTTP 200.
- `/api/status`: HTTP 503 with the app's unavailable response, consistent with missing preview API configuration.
- Only the existing public Supabase sign-in configuration and access settings are scoped to Preview. Required Redis settings, `ALIST_KEY_SALT`, server-side source credentials and `ALIST_APP_URL` are absent. A new preview therefore cannot support library interaction yet.
- Production domain `a-list-nine.vercel.app` still resolves to the separate READY production deployment `dpl_HkQRAMdfGwUS7qfoz9rRJbHqKp3f`. This preview was not promoted or aliased to production.

The user initially selected an isolated backend; the branch provisioning request did not create a resource. The user then chose production deployment/testing instead. No production credentials were copied into Preview and no isolated database or Redis resource was created. The preview remains limited by the configuration gap above. See [production release](motion-production-2026-10-28.md).

When runtime configuration is supplied, also verify the preview's exact request origin: `lib/request-origin.ts` requires `ALIST_APP_URL` on Vercel. Configure a stable preview origin or implement an exact platform-provided preview-host rule with regression coverage before claiming sign-in/write flows work. Verify Supabase redirect configuration without sending an unsolicited sign-in email.
