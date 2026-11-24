# Visual polish — 1 November 2026

Refined the existing neutral, poster-led interface without changing release data,
matching rules, or save behavior.

- Moved selection and grid/list controls beside the collection heading.
- Replaced the horizontally scrolling filter strip below 640px with a native
  select alongside sorting. Both filter presentations share query/history state.
- Tightened mobile intro and toolbar spacing. The first poster in the 375px
  Discover fixture moved from y=452 to y=366.
- Separated film year, release date, and platform into clear lines; preserved
  uncertainty labels and allowed long platform names to wrap.
- Made grid/list targets at least 44px for all input types, themed text selection
  and input carets, and retained existing reduced-motion behavior.
- Prevented the desktop filter indicator from animating zero-size geometry while
  its mobile replacement is visible.

Reviewed rendered grid layouts at 320, 375, 768, and 1280px in light and dark themes,
using real poster assets and explicit fixture titles/release data. Included long
titles, long platform names, uncertain dates, missing dates, and missing artwork.
Screenshots live in `outputs/review/polish-before-*` and `polish-after-*`.

`npm run check` passed (237 unit/data tests, formatting, lint, type checking,
and backup self-test). Browser coverage includes native filtering, breakpoint
changes with retained selection, empty-state recovery, keyboard focus, target
sizes, list layout, and bulk selection. Verification uses Chromium and simulated
phone viewports; physical-device and screen-reader testing was not performed.

## This week — 2 November 2026

Added the requested compact library summary: up to three saved films releasing
today through six days ahead, using the app's US release timezone. A native date
block and title open film details. “View upcoming” switches to Coming Soon in
release-date order and focuses the collection heading. An empty week states that
there are no releases and preserves the next known release when one exists.

The existing authenticated library RPC returns `weekReleases` over the full saved
library, independently of pagination and filter state. It retains caller RLS,
respects the unconfirmed-date preference, and adds no separate request. No library
records or account settings are modified. The additive migration is deployed as
`20261102102245_library_week_summary.sql`; the existing app ignores the extra field.

Final verification: all 238 unit/data tests and the 20-test UX suite pass. The
earlier complete browser run passed 65 tests before the weekly-summary addition,
including a temporary visual capture spec now retained in `outputs/review`.
The new database test checks account isolation, date boundaries, preferences,
removal, and independence from the visible page/filter. Browser tests exercise
off-page film details, the upcoming action, and responsive rendering in both themes.
Production verification confirms the RPC compiles, returns no data without an
identity, remains security-invoker, and denies anonymous execution. Supabase
security-advisor findings are unchanged from before this migration.
