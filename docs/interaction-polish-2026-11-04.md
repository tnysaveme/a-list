# Interaction polish — November 4, 2026

The roughness came from several small interaction defects within the existing design.

| Finding | Evidence | Fix |
| --- | --- | --- |
| Filter requests pushed the collection down and back up | A delayed request moved the desktop grid from 641.58 px to 675.58 px, then back: a 34 px jump | Keep desktop status inline with the heading. On phones, show a pending icon in the count's existing space and retain the live announcement. The collection stays stationary at 320, 375, 768 and 1440 px. |
| List rows were too far apart on larger screens | Grid breakpoint rules overrode the list's zero gap with 32 px | Give the list layout sufficient specificity to retain zero inter-row gaps at every breakpoint. Row padding and separators remain. |
| Clicking the current layout made film information fade again | Grid/list handlers ran even when the requested layout was already selected | Return before writing preferences or starting motion when the layout is unchanged. |
| Layout changes sent films through long paths outside the viewport | Cards visible in either arrangement were translated to distant positions | Move artwork only when the film is visible in both arrangements; newly visible rows use a brief fade. |
| Animations outlived keyboard input and preference changes | Existing Web Animations were only cancelled by another transition or unmount | Cancel content, layout and tab motion on keyboard input and changes to reduced motion; clear layout markers and listeners. Layout changes also stop fallback content animations. |

The root now reserves a scrollbar gutter so opening a dialog does not change the available page width on systems with classic scrollbars.

Validation uses an isolated production build and disposable fixture services, without loading the checkout's private environment. Lint, TypeScript, formatting, 248 unit/integration tests and the full 78-test browser suite passed. Focused browser checks were repeated after the final mobile pending-indicator refinement. Light and dark screenshots were reviewed at phone and tablet sizes, with desktop checks through 1440 px.

These are local interaction fixes, not production latency measurements. Fixture artwork is intentionally absent, and physical-device rendering and touch behavior were not measured in this pass.

## Production release

Deployed on November 4 at 11:52:45 UTC through the existing Vercel project, in London (`lhr1`). Deployment `dpl_6REbaffH3RK4pZscUjhyG9pVmDDo` is READY and explicitly verified as the target of [a-list-nine.vercel.app](https://a-list-nine.vercel.app). The production build took approximately 135 seconds. The current working tree was uploaded directly, based on commit `539dfb1`; no Git commit or push was made.

The complete `npm run check` passed again before release, including the backup restore fixture. The upload excluded local environment files, credentials, generated builds and browser artifacts. Its file-manifest SHA-256 was `23025008bc47643f399fc57f062f560707bd801f0d28dff6ef38945531358bf3`.

Live checks confirmed login and privacy return 200, the signed-out home redirects to login, and catalogue, library and private health APIs return 401. The served CSS contains the new loading indicator, corrected list selector and stable scrollbar gutter. A bounded runtime error/fatal log scan since deployment readiness returned no entries.

Public source readiness returned 503/degraded. Read-only database inspection found an existing WTS lookup failure (last success 08:40 UTC, failed attempt 11:50 UTC, before this deployment), three recorded refresh failures, and a current WTS reports failure. Feed and discovery checks were recent and successful. This source-health condition was reported separately from deployment verification; no source records, scheduler settings or database schema were changed during this release.

## Follow-up: image loading and section motion

The first pass's browser fixtures intentionally omitted posters, so they did not exercise image decoding during section changes. A new fixture serves an actual local JPEG, with separate controls for network completion and browser decoding, plus a normal HTTP-cache path.

The remaining causes were full-opacity artwork appearing abruptly after load, cached remounts initially showing loading UI, and native view-transition snapshots freezing an intermediate loading state while data and artwork continued to arrive. Destination requests also started after the section snapshot, allowing an unloaded destination to render an empty state before its pending state.

Section/results transitions now animate live DOM elements using the Web Animations API. Their existing directions, duration tokens, keyboard behavior and reduced-motion alternatives remain. Rapid reversals read the current opacity and transform before cancelling the old animation. Requests and pending state begin with navigation, and results arriving during section motion do not trigger a second entrance.

Cold posters remain hidden until Next.js's decoded-image callback, then crossfade with their placeholder over 180 ms. Ref callbacks recognize completed cached images before paint and bypass both placeholder and fade. Missing/failed artwork keeps its explicit fallback. No image-provider permissions, upstream URLs or optimization settings changed.

New browser regressions verify the network/decode boundary, stable poster geometry, failure fallback, cached remounts, immediate destination skeletons, and successful image decoding while section motion is still active. Mobile and desktop captures use the real fixture JPEG. These checks establish the behavior under controlled delays; they are not physical-device or upstream image-latency measurements.

The full follow-up suite passed all 81 browser tests. `npm run check` passed formatting, lint, strict TypeScript, all 248 unit/integration tests and the encrypted backup restore fixture.

Follow-up deployment `dpl_H5XV7antcU1NNx2D6Cn3aXHvL5Kd` became READY at 12:10:45 UTC, after approximately 151 seconds. The canonical production alias was explicitly verified against that deployment. Uploaded file-manifest SHA-256: `24c589a482c20a6f258703e962938cf6e5ac983f84b812a905b096d087804566`.

Live verification confirmed the cached-artwork styles are present and frozen-section snapshot styles are absent. Public pages and private API boundaries passed again, with no error/fatal runtime log entries in the bounded post-release scan. Source readiness remains 503/degraded, as recorded for the earlier deployment; the follow-up did not change source ingestion or health rules. Already-open tabs need a reload to run the new client bundle.
