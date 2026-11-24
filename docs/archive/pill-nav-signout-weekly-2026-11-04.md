# Pill navigation, sign-out and weekly release feedback

Restored the centered pill navigation by removing the cinematic layout's header overrides. The approved film shelf, previews and sign-in design remain in place. Removed the “View Upcoming” button and its callback from the weekly summary; each film still opens its details.

Weekly rows now have a stronger neutral hover surface, a 2px artwork lift and a small directional arrow movement. Keyboard focus remains immediate and visible. Hover motion only runs on fine pointers with no reduced-motion preference; reduced motion retains surface feedback.

Both sign-out forms were reproducibly rejected with HTTP 403: the global `Referrer-Policy: no-referrer` caused Chromium's native POST forms to submit `Origin: null`. Changed the policy to `same-origin`, preserving the same-site form origin while suppressing cross-site referrers. The existing POST-only route, origin validation and Supabase cookie clearing remain intact.

Regression coverage checks both account and menu sign-out with pointer and keyboard, the outgoing origin, cleared auth cookies, redirect to sign-in, and rejection of further private API access. Foreign and opaque origins remain rejected without clearing the session. Weekly coverage checks details access, removal of the redundant action, pointer feedback and reduced motion.

Validation: `npm run check` passed, including 256 unit/database checks and the backup self-test. The complete Playwright suite passed all 102 tests. Real-artwork screenshots were reviewed in light and dark themes at 320, 390, 768 and 1440px, with no horizontal page overflow. The targeted Taste source scan reports zero failures; its one warning is the existing floating film-preview shadow.
