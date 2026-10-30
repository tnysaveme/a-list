# Section motion release — October 28, 2026

The visible motion pass adds Library/Discover section transitions, a traveling primary-tab underline and filter pill, data-ready filter/sort transitions, and grid/list poster movement. Existing dialogs, menus, search and feedback surfaces retain the earlier motion work.

## Implementation

- Section body: 24px directional entrance and opacity over 260ms; outgoing content fades over 120ms. Navigation remains in the live DOM outside the captured content.
- Filter/sort: the selected control updates immediately; results transition only when the explicit request succeeds. Stale requests cannot commit inside a deferred snapshot callback. Background refresh and pagination do not replay these entrances.
- Layout: 280ms FLIP translation for card positions and uniform poster scaling. Metadata fades without scaling text. Geometry reads are batched; at most 24 cards participate, with offscreen destinations skipped.
- Selected underline/pill: WAAPI transform animation, measured again on resize. Current interpolated geometry is captured before interruption.
- Keyboard changes are immediate. Reduced motion keeps short opacity continuity. Browsers without native View Transitions receive a WAAPI content fallback.
- All animated properties are transform/opacity; no new dependency or per-frame React state was introduced.

Files: `lib/content-motion.ts`, `lib/motion-duration.ts`, `components/moving-tabs.tsx`, `app/afterlight.tsx`, both collection hooks, shared stylesheet and motion tokens.

## Verification

The release check passes formatting, lint, TypeScript, 188 unit/data tests and the synthetic backup restore check. All 30 browser tests pass. The browser suite covers the existing app journeys plus section interruption, layout reversal, delayed results, keyboard/reduced motion, fallback behavior, compiled CSS token units, and mobile/tablet alignment in both themes. Rendered frames and settled 375px / 768px layouts were inspected.

A production-minification issue was caught during asset verification: CSS converts `260ms` to `.26s`, which a naive parseFloat interpreted as 0.26ms. Deployment `dpl_AP9ATpsf7SX6sbtMxyCPQA3tjCfj` was briefly promoted, then the previous production release `dpl_42VLsvPpPV5chiUTbYkjbmVLpowy` was restored while correcting the parser. The final parser handles both seconds and milliseconds, with unit and compiled-browser regression coverage.

Signed-in interaction tests use the isolated disposable fixture backend. The current production browser tab is signed out, so authenticated production interactions cannot be verified in that browser without sign-in. No production saves/removals, credentials, schemas, schedules or backend resources were changed for this release. Headless Chromium tests and a bounded CPU-throttled sample do not constitute a physical-phone or Safari performance certification.

## Design finding triage

Fixed the abrupt section, filter and layout changes. No new suppressions were added. The existing narrow `overused-font: arial` suppression remains: the inherited declaration is overridden by the approved Inter body token. Typography remains outside this motion pass.

## Release

Production project/team: `prj_eV35BkjAL547jBP5t73vsI2fsmSC` / `team_QRbcE5QYR9UroFoG1dF2RVnz`.

Rollback release: `dpl_42VLsvPpPV5chiUTbYkjbmVLpowy`, https://a-list-kh6slq4ca-terence-yebuahs-projects.vercel.app.

The release is built from the reviewed working tree based on `c1de7fc`; no commit or push was performed. Final deployment identifiers and endpoint verification are recorded below.


- Live URL: https://a-list-nine.vercel.app
- Production deployment: `dpl_5S2XUQVDroz44PPsgCCNjn4JJZp6` / READY.
- Build URL: https://a-list-hl0f1uks0-terence-yebuahs-projects.vercel.app.
- Framework/runtime: Next.js 16.4.3 / Node 24.
- The remote build repeated the project check/build pipeline successfully.
- Staged login/privacy/CSS: HTTP 200; readiness: HTTP 200, healthy; private health: HTTP 401.
- Deployed CSS tokens `.26s`, `.22s`, `.28s` were parsed by the corrected helper as 260, 220 and 280 milliseconds. All named section/result animations and reduced-motion styles were present.
- After promotion, inspecting the live URL resolved the final deployment ID above; live readiness returned HTTP 200, healthy.
- A bounded runtime error/fatal scan through 17:46:48 UTC returned zero records. This is a brief release observation, not ongoing monitoring. Existing monitoring configuration was not changed or comprehensively audited.
