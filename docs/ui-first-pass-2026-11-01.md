# UI first pass — November 1, 2026

Initial library and Discover loads now use static poster/text skeletons matching grid or list layout. They contain no controls and expose one loading status. Existing collection content continues to survive background refresh. Layout animation only measures real movie cards, so switching layouts during loading does not query nonexistent poster buttons.

Below 640px, the existing native dialogs become bottom sheets with internally scrolling content, safe-area padding, and a persistent Done button. Close buttons, Escape, focus restoration, native modality, and busy-state dismissal restrictions remain. Pointer entrance uses the existing 260ms token and exit 180ms; reduced motion uses a 120ms fade and keyboard changes are immediate. Desktop dialogs remain centered. This pass uses CSS transitions, with no drag gesture or new dependency.

Collection cards receive individual primitive selection/membership props and are memoized. Both selection and save controls remain mounted; the inactive control is hidden from layout, focus, and accessibility. Poster callbacks are stable, and poster images and membership icons skip unchanged renders. All films remain in the DOM for browser find and keyboard access.

## Measurement

The same existing diagnostic ran before and after against disposable production-build fixtures, with 100 and 500 synthetic cards and 4× CPU slowdown in headless Chromium. Three selection-mode click-to-two-frame samples at 500 cards changed from 224.5/371.0/216.6ms to 162.1/248.3/165.2ms: median 224.5ms to 165.2ms, about 26% lower. Long tasks remain. Keeping controls mounted increases the sampled selection-state DOM from 13,212 to 16,712 nodes, trading memory for less repeated construction. These small synthetic samples do not establish phone or real-user performance, nor eliminate the need for future bounded rendering if collections grow further.

Raw samples: [before](measurements/ui-collection-before-2026-11-01.json), [after](measurements/ui-collection-after-2026-11-01.json). The diagnostic source is the pre-existing `outputs/review/ux-scaling.spec.ts`; its temporary copy was removed from the active browser suite.

## Verification

- Formatting, lint, typecheck, 236 unit/data tests, and backup/restore self-test passed.
- Full browser run: 63 passed, one new skeleton-layout test failed. The failure exposed the real-poster measurement assumption and was fixed.
- Final targeted production-build run: all seven affected cases passed, covering loading grid/list changes, mobile sheet geometry/scrolling/focus, reduced motion/keyboard/desktop behavior, 500-film selection, dialog exit, grid/list reversal, and removal/Undo. All 63 permanent browser scenarios have passed across these runs.
- Inspected generated screenshots of grid/list loading and sheets at 320, 375, and 414px in light/dark. No horizontal overflow in tested sheet layouts. Screenshots use disposable fixture content.
- Physical iPhone/Android gesture and screen-reader testing were not performed; no swipe-to-dismiss behavior is advertised.

## Production

Released to https://a-list-nine.vercel.app as `dpl_658rhXgXzqAcjwJNGJKK2XQJxGjF` (READY, production). Public login returned HTTP 200; its styles include the new skeletons, mobile sheets, and hidden-control rules. The title and sharing description remain correct. `/api/status` returned HTTP 200 with `healthy`. Deployment-scoped error/fatal log inspection returned no records in the immediate release window. Authenticated interaction verification used the isolated production-build fixtures above, not users' production libraries.
