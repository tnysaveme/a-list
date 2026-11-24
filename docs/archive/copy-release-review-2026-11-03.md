# Copy review and optimistic UI release — 3 November 2026

Reviewed the help dialog, film cards and details, search, library summaries, calendar settings and setup prompt, account controls, sign-in, privacy note, error messages, email template, metadata and calendar event descriptions against the current implementation.

## Copy changes

- Rewrote **How A-List Works** to explain movie-only coverage, When To Stream identity checks, links to release evidence, the meaning of Available and TBA, preservation of saved dates during source outages, optional unconfirmed dates, calendar subscription versus download, reminder timing, optimistic saves, Undo and account controls.
- Removed the repeated region labels from the collection header, film release heading, no-date descriptions and calendar statistics. Calendar statistics now use two columns. Kept the coverage qualification once in help, **In US theatres** for theatrical dates, and the region inside calendar events that are read outside the app. Locale/timezone identifiers and provider request headers are not UI labels and remain unchanged.
- Explained that saving adds dates to the **feed** and that users must subscribe separately in their calendar app. Refresh timing is controlled by that app; the help no longer implies a guaranteed update interval.
- Clarified that a saved TBA film is already in the library, instead of asking its owner to save it again. An unresolved source match does not claim that no release has been announced.
- Replaced the placeholder social/SEO description with the actual product behavior. Unified the help entry points and dialog name as **How A-List Works**.
- Removed unsupported assurances about data remaining unchanged from generic failure messages. Simplified the unavailable-subscription message without exposing hosting configuration details.
- Sign-in, privacy, account export/reset/deletion, and email-template statements were consistent with the implementation and retained.

## Verification

- `npm run check`: formatting, ESLint, strict TypeScript, **246/246 tests**, and the encrypted-backup fixture passed.
- Full isolated production-browser suite: **73/73 passed**, including optimistic saves/preferences, failure recovery, stale-response handling, navigation, account controls and calendar behavior.
- Local browser review at 1280×900 and 375×812 confirmed the help copy, mobile scrolling, reachable Done control, no horizontal overflow, the two-column calendar summary, and the new metadata description.
- Release uses the current working tree based on commit `539dfb1`. No new dependencies, database migrations, account emails, or hosting setting changes are needed. The existing London region is retained.

## Production release

- **Status:** READY, 3 November 2026 at **13:15:39 UTC**.
- **URL:** [a-list-nine.vercel.app](https://a-list-nine.vercel.app), explicitly verified as assigned to deployment `dpl_5taZzNFKJvjYrmEz5zYNYK9X2C3b`.
- **Target:** production; **framework:** Next.js; **region:** `lhr1` (London); **build duration:** approximately 169 seconds.
- **Source:** 349 reviewed files from the uncommitted working tree based on `539dfb1`. Upload SHA-256: `2be54833a2c7a291882678518e6c9ab3f231c0a3cfcb5ff7f1ee893c766542c9`. Credentials, local tool state, generated output, and dependencies were excluded.
- Vercel's required `npm run check && npm run build` gate passed before publication.
- Live `/api/status`: HTTP 200, `healthy`. Anonymous `/api/health`: expected HTTP 401, `Sign in required`. Login and privacy: HTTP 200. Security headers remained present; dynamic responses reported London execution.
- Live login HTML contains the new product description and no placeholder description. The bounded runtime-error scan since deployment readiness returned no errors; this is not a long-term uptime observation. Existing health checks and scheduled worker remain in place; no drain or monitoring configuration was changed.
- Desktop and mobile screenshots are saved in ignored `outputs/review/how-a-list-works-*-2026-11-03.png` and `outputs/review/calendar-copy-mobile-2026-11-03.png`. The temporary fixture server was shut down after review.

This release includes the optimistic UI from the previous task. The local changes remain uncommitted.
