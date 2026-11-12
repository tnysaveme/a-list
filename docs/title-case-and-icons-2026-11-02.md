# Title Case and Browser Icons — 2 November 2026

Applied title case to interface headings, navigation, short actions and form
labels across the library, weekly summary, menus, details, settings, sign-in and
privacy screens. Explanatory sentences, error messages and source movie titles
retain their original casing. The exact link-preview description is unchanged.
The page and social titles now consistently use A-List.

Replaced the miniature full-wordmark favicon with a bold A on a solid rounded
tile with a keyline. The self-contained SVG inverts its tile and letter through
`prefers-color-scheme`, following browser/OS chrome rather than the website's
appearance override. A neutral keyline preserves the tile boundary. The ICO
contains 16px, 32px and 48px raster variants with a fixed dark tile and white A;
the 180px Apple touch icon uses the same fallback treatment. Versioned metadata
URLs help browsers refresh their cached favicon.

Reviewed SVG and ICO rendering at 16, 32 and 64px in light and dark Chromium
contexts. Comparison captures are `outputs/review/favicon-light.png` and
`favicon-dark.png`. Verified generated head links, MIME types and 200 responses
for all three icon assets in the built app. Platform-specific Safari and
physical-device home-screen rendering were not tested.

The project check passes with 238 unit/data tests. The complete browser run passed
64 tests and identified one old-case test selector for Include Unconfirmed Dates;
the selector was updated, and all four focused final checks passed (calendar
recovery, sign-in, pagination/save/remove, and account controls).
