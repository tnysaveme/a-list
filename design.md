<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->

# Design — A-List

The approved shared system for the entire app. Extend this file and `tokens.css` together; individual screens share the same visual language.

## Genre and structure

Modern-minimal: quiet, precise and functional. Audience: the owner and friends. The main action is finding and saving a movie, then following its sourced US home-release dates through a private calendar.

- App: Workbench — compact navigation, useful collection controls, real film artwork and aligned metadata. Routine navigation has no decorative hero or entrance choreography. Successful sign-in has one brief welcome.
- Authentication: the user-selected film still fills the left side of desktop sign-in, beside a focused form. Confirmation uses its own supplied still within the same shell. On phones it becomes a short image masthead above the form. The shared wordmark and direct action hierarchy remain.
- Privacy: Long Document with a comfortable reading measure.
- Navigation: a centered pill bar frames the wordmark, search field and account/calendar controls. The collection heading and main navigation share a row on desktop. Footer: compact wordmark.

## Brand and typography

The wordmark is exactly **A-List**, in Figtree 600 with tight tracking. It is text only, without an icon, monogram or decorative punctuation. A shared `Wordmark` component owns its rendering. Browser and home-screen icons are the exception: a bold A on a solid rounded tile remains legible at 16px. The SVG icon inverts its tile and letter for the browser color scheme; a neutral keyline and solid background keep the raster fallback visible on either theme.

The welcome greeting also uses Figtree. Other interface text uses Inter: headings, metadata, forms, controls, status labels and body copy. Fonts come from Google Fonts, self-hosted by Next.js. All headings are upright. Display tracking is -0.035em, wordmark tracking -0.045em. Interface weights are 400, 500 and 600. Data uses tabular numerals. No third typeface.

## Theme

Light: pure white canvas and surfaces, charcoal text and neutral grey secondary text. Very light neutral grey separates secondary controls and hover states. Dark: graphite canvas, slightly raised graphite surfaces, near-white text. Appearance defaults to System and follows the device. A Light / Dark / System segmented pill in Account settings overrides it for this browser. The preference persists locally, syncs between tabs, and applies before the first paint on every route; explicit choices also set native controls and browser chrome to the selected palette. Film posters supply visual colour; interface primary actions are monochrome. Blue is reserved for keyboard focus. Semantic green, amber and red distinguish success, uncertainty and destructive actions, always with text.

All web colours and font families reference named tokens from `tokens.css`. Framework aliases in `app/globals.css` map to those tokens. Email uses sRGB equivalents and font-stack fallbacks because email clients cannot consistently resolve CSS variables or web fonts.

## Spacing and shape

4-point named spacing scale. Controls and touch targets are at least 44 px. Page gutters expand from 16 px on phones to 48 px on desktop. Controls use an 8 px radius, posters 12 px, dialogs 16 px. Secondary metadata is 13 px; page titles range from 24 to 32 px. Layout tracks containing images use `minmax(0, 1fr)`. Dialogs fit the viewport and scroll internally. Below 640px they anchor to the bottom edge, with safe-area padding and a persistent Done action below their internally scrolling content. Desktop dialogs remain centered. Root overflow uses clip, never hidden. When enlarged text leaves too little room for search, the header places search on a second row while keeping the wordmark and account controls together. Navigation groups and action labels wrap when necessary to remain readable and reachable.

## Motion and states

Routine page loads do not play entrance sequences or image zoom. Poster buttons lift 4px on fine-pointer hover; a 350ms intentional hover opens a collision-aware film preview, with a 180ms opacity/scale entrance. The preview contains existing metadata, the same bounded synopsis and release information in Library and Discover, and never fetches details. Discover restores missing stored synopses for only the displayed page in one authenticated batch; unavailable text uses a shared, explicit fallback. Escape dismisses it; clicking opens full details. Preview state unmounts for touch, disabled and selection modes. Touch opens full details directly. Reduced motion removes the lift and preview entrance. Explicit action controls use a subtle 0.97 scale with 100ms press and 160ms release; primary section switches fade in live content with a directional 24px entrance over 260ms while navigation stays fixed. The selected tab underline and filter pill travel to the selected control. User-requested filter/sort results fade in with opacity only over 220ms once data arrives; polling and pagination do not replay this transition. Section and results motion never freezes content into a snapshot: loading states and decoded images remain visible throughout. Destination requests start with navigation so an unloaded section shows its skeleton from the first frame. Cold posters fade in over 180ms after decoding; cached posters appear immediately, with no replayed placeholder or fade. Loading tiles use a quiet film icon; unavailable artwork retains its explicit label. Grid/list switches move card positions and uniformly scale poster artwork over 280ms, leaving text unscaled. Keyboard changes are immediate, reduced motion uses brief fades, and repeated pointer changes interrupt from the current position. Dialog panel and backdrop crossfade together over 180ms in and 120ms out, retaining modality and content until exit finishes. Mobile panels also translate from the bottom over 260ms in and 180ms out; reduced motion uses a 120ms opacity transition and keyboard actions are immediate. These are dismissible sheets with buttons, not draggable surfaces. Menus use 120ms opacity; pointer-opened search keeps its restrained 4px entry over 180ms, while keyboard search opens immediately. Transitions reverse from their current state. Focus rings appear immediately, and closing overlays never steal focus from a newly chosen control. Reduced motion removes spatial feedback, retains brief opacity continuity, and uses static pending icons with readable labels. Loading indicators convey actual pending work. Initial collections use static, noninteractive poster and text skeletons matching grid/list geometry, with a single accessible loading announcement. Loaded collections stay visible during background refresh. Save confirmation is distinct from ancillary refresh, and background refresh preserves loaded pages and the visible film position. Confirmed library changes draw the save check, fade removed cards and move nearby films over 180–260ms. Undo reverses from the current visual position. Temporary exit copies are inert and hidden from assistive technology; failures and routine refreshes do not replay membership motion. Every interactive family distinguishes default, hover, focus, active, disabled, loading, error and success states where applicable. Shared hover styles live in `app/interactions.css`: a 140ms change of surface, border or text contrast, without shifting the surrounding layout. Poster hover is the explicit exception: the artwork lifts within its reserved space while metadata and neighboring cards remain fixed. Neutral hover tokens derive from the active theme; text actions retain readable ink and reveal an underline. Inactive segments show a stronger neutral tone while selected segments retain their marker. Destructive actions retain their semantic colour. Fine-pointer hover is gated by both hover capability and pointer precision. Keyboard focus reveals poster actions and has an immediate blue outline; reduced motion makes control-state changes immediate.

Authentication artwork starts with a small embedded, softly blurred preview. The decoded full image reveals over 1200ms using the shared ease-in-out curve, including cached images. A CSS animation starts reliably even if decoding finishes before the first painted frame. The form and image caption remain available throughout, failed decorative artwork retains its preview, and reduced motion shortens the fade to 120ms. The blur is static, never animated.

After successful email confirmation or the legacy sign-in callback, a unique, non-sensitive arrival marker enables a one-time “Welcome home.” greeting. The wordmark and greeting enter over 400ms, with an 8px translation. A 1600ms reading beat precedes an 800ms opacity crossfade into the live site; data and posters load underneath. Ordinary visits and reloads do not replay it. The marker is removed from the URL, repeat markers are remembered in optional session storage, and keyboard/pointer input can skip the greeting. Reduced motion bypasses the hold and spatial movement. CSS completes the reveal even without hydration, with a bounded JavaScript cleanup fallback. The greeting never traps focus or waits for every image.

## Actions and copy

Use title case for interface headings, navigation, menu items, form labels and short
actions (Your Library, This Week, View Upcoming). Keep articles, conjunctions and
short prepositions lowercase within titles. Explanatory text, full-sentence status
messages and errors stay in sentence case. Preserve source-provided movie titles
and the exact link-preview description. Never apply CSS capitalization to content.

Primary: solid charcoal (light) or near-white (dark), clear action verb. Secondary: neutral bordered surface. Destructive: red with an existing explicit confirmation flow. Preserve existing optimistic updates, Undo, source certainty, release-date semantics, private-account behavior and calendar identities. Avoid decorative slogans where a functional label is clearer.

## Screen allowances

Movie details use a 940px composition on desktop: a 216px poster beside the title, a compact save/watched action group and the synopsis, with aligned release rows underneath. At tablet width the poster is 176px and the synopsis spans the reading column's full width. Below 640px, a 104px poster shares the identity row in a scrollable bottom sheet; actions wrap at small widths, and Done stays reachable. All main listing, release evidence and synopsis links live in a dedicated button row near the bottom. Matching source buttons show their purpose and provider; duplicate URLs appear once. The row wraps on smaller screens. One final row says “Sources checked on [actual date]” using the recorded check date, with no visible Sources heading or repeated disclaimer. Long source names wrap, and missing artwork has an explicit fallback. Mutation and refresh errors appear beside the personal actions; release uncertainty stays beside the release record. Calendar/account use grouped settings rows. Search keeps its keyboard controls. Real posters are product content, not enrichment. Privacy and emails share the typography and brand. No screen invents a new palette or changes the meaning of a release status.

Your Library separates To Watch from Watched with the shared segmented-control pattern and counts. Watched is personal history, sorted by most recently watched by default; its cards show watched dates instead of release metadata. Details offer Mark as Watched and Mark as Unwatched for saved films. Watched films remain saved, leave release calendars and upcoming summaries, and return to tracking when marked unwatched. Undo after removal preserves the original watched date. Shelf switches keep the displayed heading, summary, controls and films coherent until the destination is ready, then fade the new content together with no spatial entrance. The shelf tabs remain stationary and the requested tab shows pending feedback. Fresh visited library queries retain their appended pages for up to one minute in bounded, account-local memory; mutations, revisions and release-day changes invalidate them. Known empty destinations open immediately. Empty shelves remain visible during replacement requests, and To Watch explains when every saved film has been watched.

This Week uses a compact release agenda: prominent tabular day numerals, small portrait artwork, clear film titles and understated release metadata. Three entries form a compact strip inside a neutral surface on desktop and a horizontal, scroll-snapping strip below 900px, keeping the film shelf near the first screen. Quiet weeks use a subtle neutral surface with the next release separated below; dates retain their uncertainty labels. The entire release row opens the film, with no decorative colour.

Calendar settings place Subscribe and copy/download controls before summary counts and optional Setup help. Feed inclusion never claims that an external calendar is connected; tentative upcoming dates retain an explicit Unconfirmed label. A dismissible, nonmodal setup reminder appears after a confirmed first save during the visit, without shifting an existing library on initial load. Available uses newest-first release dates; Coming Soon remains nearest-first.

Collections and Home Releases state that dates follow US listings. Film titles and their metadata open details through one accessible action, separate from save and selection controls. Cards show Available, Coming Soon or Unconfirmed as visible text. Saved status is informational; details use an explicit Remove from Library action with the existing Undo recovery.

On phones the introduction is compact and This Week starts collapsed, with a release count and an explicit expand control. Desktop keeps the agenda visible. Expanding it preserves the same release rows and certainty labels. Long mobile film titles use the full reading width beneath their artwork; enlarged text also switches short identities to that layout when the remaining column becomes too narrow. Detail titles remain complete, actions wrap when needed, and Done remains reachable.

Calendar previews include production years, label tentative dates Unconfirmed, and open the corresponding film with a clean modal handoff. The subscription action has an always-visible explanation of the 1pm GMT, 30-minute reminder and its optional alert. Counts use singular labels when appropriate. Inline Privacy links are underlined at rest, and labelled button groups expose their group role.

Sign-in success identifies the destination email and offers Resend Link separately from Use Another Email. Resend waits at least 60 seconds after a successful send and respects server Retry-After responses. The countdown is not a live region; successful sends and failures are announced without repeating the timer each second. Existing server rate limits and authentication checks remain authoritative.

## Verification

Inspect 320 / 375 / 414 / 768 px and desktop in light and dark. Check horizontal overflow, nonwrapping control labels, touch targets, focus, long titles and dialog scrolling. Run existing checks, build and isolated browser flows. Keep routes, component ownership and application logic intact.

## Exports

Load Figtree and Inter before using these portable exports. The app’s `tokens.css` uses Next.js font variables for metric-adjusted fallbacks. Dark appearance overrides the same roles.

### tokens.css

```css
:root {
  --color-paper: oklch(100% 0 0);
  --color-surface: oklch(100% 0 0);
  --color-paper-2: oklch(97% 0 0);
  --color-ink: oklch(21% 0 0);
  --color-text-secondary: oklch(48% 0 0);
  --color-muted: var(--color-text-secondary);
  --color-rule: oklch(90% 0 0);
  --color-rule-strong: oklch(66% 0 0);
  --color-action: oklch(25% 0 0);
  --color-accent: var(--color-action);
  --color-accent-hover: oklch(35% 0 0);
  --color-accent-wash: oklch(96% 0 0);
  --color-accent-ink: oklch(100% 0 0);
  --color-focus: oklch(53% 0.19 255);
  --color-green: oklch(41% 0.09 155);
  --color-green-wash: oklch(95% 0.025 155);
  --color-amber: oklch(43% 0.08 75);
  --color-amber-wash: oklch(96% 0.025 80);
  --color-danger: oklch(47% 0.16 25);
  --color-danger-wash: oklch(96% 0.018 25);
  --color-overlay: oklch(15% 0 0 / 0.42);
  --color-shadow: oklch(15% 0 0 / 0.12);
  --color-on-dark: oklch(100% 0 0);
  --color-on-dark-muted: oklch(85% 0 0);
  --color-artwork-scrim: oklch(14% 0 0 / 0.8);
  --color-artwork-surface: oklch(100% 0 0 / 0.96);
  --color-artwork-ink: oklch(21% 0 0);
  --color-clear: oklch(0% 0 0 / 0);
  --font-brand: 'Figtree', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-display: 'Inter', sans-serif;
  --font-code: 'Inter', sans-serif;
  --space-2xs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-compact: 20px;
  --space-lg: 24px;
  --space-comfortable: 28px;
  --space-xl: 32px;
  --space-inset: 36px;
  --space-section: 40px;
  --space-control: 44px;
  --space-2xl: 48px;
  --space-panel: 56px;
  --space-3xl: 64px;
  --space-page: 72px;
  --space-wide: 80px;
  --text-xs: 0.8125rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(1.5rem, 2.4vw, 2rem);
  --radius-sm: 8px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-poster: 12px;
  --radius-round: 100px;
  --rule-hair: 1px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-short: 120ms;
  --dur-medium: 180ms;
  --z-dropdown: 40;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-paper: oklch(20% 0.004 250);
    --color-surface: oklch(24% 0.004 250);
    --color-paper-2: oklch(28% 0.004 250);
    --color-ink: oklch(94% 0.002 250);
    --color-text-secondary: oklch(72% 0.006 250);
    --color-rule: oklch(34% 0.004 250);
    --color-rule-strong: oklch(54% 0.006 250);
    --color-action: oklch(94% 0.002 250);
    --color-accent-hover: oklch(83% 0.003 250);
    --color-accent-ink: oklch(21% 0.004 250);
    --color-accent-wash: oklch(30% 0.004 250);
    --color-focus: oklch(73% 0.14 255);
    --color-green: oklch(78% 0.1 155);
    --color-green-wash: oklch(28% 0.03 155);
    --color-amber: oklch(81% 0.1 80);
    --color-amber-wash: oklch(29% 0.025 80);
    --color-danger: oklch(77% 0.13 25);
    --color-danger-wash: oklch(28% 0.035 25);
    --color-overlay: oklch(8% 0.003 250 / 0.66);
    --color-shadow: oklch(5% 0.002 250 / 0.4);
  }
}
```

### Tailwind v4

Use with the root tokens and their dark override.

```css
@theme inline {
  --color-paper: oklch(100% 0 0);
  --color-surface: oklch(100% 0 0);
  --color-paper-2: oklch(97% 0 0);
  --color-ink: oklch(21% 0 0);
  --color-text-secondary: oklch(48% 0 0);
  --color-muted: var(--color-text-secondary);
  --color-rule: oklch(90% 0 0);
  --color-rule-strong: oklch(66% 0 0);
  --color-action: oklch(25% 0 0);
  --color-accent: var(--color-action);
  --color-accent-hover: oklch(35% 0 0);
  --color-accent-wash: oklch(96% 0 0);
  --color-accent-ink: oklch(100% 0 0);
  --color-focus: oklch(53% 0.19 255);
  --color-green: oklch(41% 0.09 155);
  --color-green-wash: oklch(95% 0.025 155);
  --color-amber: oklch(43% 0.08 75);
  --color-amber-wash: oklch(96% 0.025 80);
  --color-danger: oklch(47% 0.16 25);
  --color-danger-wash: oklch(96% 0.018 25);
  --color-overlay: oklch(15% 0 0 / 0.42);
  --color-shadow: oklch(15% 0 0 / 0.12);
  --color-on-dark: oklch(100% 0 0);
  --color-on-dark-muted: oklch(85% 0 0);
  --color-artwork-scrim: oklch(14% 0 0 / 0.8);
  --color-artwork-surface: oklch(100% 0 0 / 0.96);
  --color-artwork-ink: oklch(21% 0 0);
  --color-clear: oklch(0% 0 0 / 0);
  --font-brand: 'Figtree', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-display: 'Inter', sans-serif;
  --font-code: 'Inter', sans-serif;
  --spacing-2xs: 4px;
  --spacing-xs: 8px;
  --spacing-sm: 12px;
  --spacing-md: 16px;
  --spacing-compact: 20px;
  --spacing-lg: 24px;
  --spacing-comfortable: 28px;
  --spacing-xl: 32px;
  --spacing-inset: 36px;
  --spacing-section: 40px;
  --spacing-control: 44px;
  --spacing-2xl: 48px;
  --spacing-panel: 56px;
  --spacing-3xl: 64px;
  --spacing-page: 72px;
  --spacing-wide: 80px;
  --text-xs: 0.8125rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(1.5rem, 2.4vw, 2rem);
  --radius-sm: 8px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-poster: 12px;
  --radius-round: 100px;
  --rule-hair: 1px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-short: 120ms;
  --dur-medium: 180ms;
  --z-dropdown: 40;
}
```

### DTCG tokens.json

Light defaults; dark values remain in the CSS export.

```json
{
  "color": {
    "paper": {
      "$type": "color",
      "$value": "oklch(100% 0 0)"
    },
    "surface": {
      "$type": "color",
      "$value": "oklch(100% 0 0)"
    },
    "paper-2": {
      "$type": "color",
      "$value": "oklch(97% 0 0)"
    },
    "ink": {
      "$type": "color",
      "$value": "oklch(21% 0 0)"
    },
    "text-secondary": {
      "$type": "color",
      "$value": "oklch(48% 0 0)"
    },
    "muted": {
      "$type": "color",
      "$value": "{color.text-secondary}"
    },
    "rule": {
      "$type": "color",
      "$value": "oklch(90% 0 0)"
    },
    "rule-strong": {
      "$type": "color",
      "$value": "oklch(66% 0 0)"
    },
    "action": {
      "$type": "color",
      "$value": "oklch(25% 0 0)"
    },
    "accent": {
      "$type": "color",
      "$value": "{color.action}"
    },
    "accent-hover": {
      "$type": "color",
      "$value": "oklch(35% 0 0)"
    },
    "accent-wash": {
      "$type": "color",
      "$value": "oklch(96% 0 0)"
    },
    "accent-ink": {
      "$type": "color",
      "$value": "oklch(100% 0 0)"
    },
    "focus": {
      "$type": "color",
      "$value": "oklch(53% 0.19 255)"
    },
    "green": {
      "$type": "color",
      "$value": "oklch(41% 0.09 155)"
    },
    "green-wash": {
      "$type": "color",
      "$value": "oklch(95% 0.025 155)"
    },
    "amber": {
      "$type": "color",
      "$value": "oklch(43% 0.08 75)"
    },
    "amber-wash": {
      "$type": "color",
      "$value": "oklch(96% 0.025 80)"
    },
    "danger": {
      "$type": "color",
      "$value": "oklch(47% 0.16 25)"
    },
    "danger-wash": {
      "$type": "color",
      "$value": "oklch(96% 0.018 25)"
    },
    "overlay": {
      "$type": "color",
      "$value": "oklch(15% 0 0 / 0.42)"
    },
    "shadow": {
      "$type": "color",
      "$value": "oklch(15% 0 0 / 0.12)"
    },
    "on-dark": {
      "$type": "color",
      "$value": "oklch(100% 0 0)"
    },
    "on-dark-muted": {
      "$type": "color",
      "$value": "oklch(85% 0 0)"
    },
    "artwork-scrim": {
      "$type": "color",
      "$value": "oklch(14% 0 0 / 0.8)"
    },
    "artwork-surface": {
      "$type": "color",
      "$value": "oklch(100% 0 0 / 0.96)"
    },
    "artwork-ink": {
      "$type": "color",
      "$value": "oklch(21% 0 0)"
    },
    "clear": {
      "$type": "color",
      "$value": "oklch(0% 0 0 / 0)"
    }
  },
  "font": {
    "brand": {
      "$type": "fontFamily",
      "$value": "'Figtree', sans-serif"
    },
    "body": {
      "$type": "fontFamily",
      "$value": "'Inter', sans-serif"
    },
    "display": {
      "$type": "fontFamily",
      "$value": "'Inter', sans-serif"
    },
    "code": {
      "$type": "fontFamily",
      "$value": "'Inter', sans-serif"
    }
  },
  "space": {
    "2xs": {
      "$type": "dimension",
      "$value": "4px"
    },
    "xs": {
      "$type": "dimension",
      "$value": "8px"
    },
    "sm": {
      "$type": "dimension",
      "$value": "12px"
    },
    "md": {
      "$type": "dimension",
      "$value": "16px"
    },
    "compact": {
      "$type": "dimension",
      "$value": "20px"
    },
    "lg": {
      "$type": "dimension",
      "$value": "24px"
    },
    "comfortable": {
      "$type": "dimension",
      "$value": "28px"
    },
    "xl": {
      "$type": "dimension",
      "$value": "32px"
    },
    "inset": {
      "$type": "dimension",
      "$value": "36px"
    },
    "section": {
      "$type": "dimension",
      "$value": "40px"
    },
    "control": {
      "$type": "dimension",
      "$value": "44px"
    },
    "2xl": {
      "$type": "dimension",
      "$value": "48px"
    },
    "panel": {
      "$type": "dimension",
      "$value": "56px"
    },
    "3xl": {
      "$type": "dimension",
      "$value": "64px"
    },
    "page": {
      "$type": "dimension",
      "$value": "72px"
    },
    "wide": {
      "$type": "dimension",
      "$value": "80px"
    }
  },
  "text": {
    "xs": {
      "$type": "dimension",
      "$value": "0.75rem"
    },
    "sm": {
      "$type": "dimension",
      "$value": "0.875rem"
    },
    "base": {
      "$type": "dimension",
      "$value": "1rem"
    },
    "md": {
      "$type": "dimension",
      "$value": "1.125rem"
    },
    "lg": {
      "$type": "dimension",
      "$value": "1.25rem"
    },
    "xl": {
      "$type": "dimension",
      "$value": "1.75rem"
    },
    "display": {
      "$type": "dimension",
      "$value": "clamp(1.75rem, 3vw, 2.25rem)"
    }
  },
  "radius": {
    "sm": {
      "$type": "dimension",
      "$value": "8px"
    },
    "md": {
      "$type": "dimension",
      "$value": "8px"
    },
    "lg": {
      "$type": "dimension",
      "$value": "16px"
    },
    "poster": {
      "$type": "dimension",
      "$value": "12px"
    },
    "round": {
      "$type": "dimension",
      "$value": "100px"
    }
  },
  "rule": {
    "hair": {
      "$type": "dimension",
      "$value": "1px"
    }
  },
  "ease": {
    "out": {
      "$type": "string",
      "$value": "cubic-bezier(0.16, 1, 0.3, 1)"
    },
    "in": {
      "$type": "string",
      "$value": "cubic-bezier(0.7, 0, 0.84, 1)"
    },
    "in-out": {
      "$type": "string",
      "$value": "cubic-bezier(0.65, 0, 0.35, 1)"
    }
  },
  "dur": {
    "short": {
      "$type": "duration",
      "$value": "120ms"
    },
    "medium": {
      "$type": "duration",
      "$value": "180ms"
    }
  },
  "z": {
    "dropdown": {
      "$type": "string",
      "$value": "40"
    }
  }
}
```

### shadcn/ui aliases

Use with the root tokens above.

```css
:root {
  --background: var(--color-paper);
  --foreground: var(--color-ink);
  --card: var(--color-surface);
  --card-foreground: var(--color-ink);
  --primary: var(--color-action);
  --primary-foreground: var(--color-accent-ink);
  --secondary: var(--color-paper-2);
  --secondary-foreground: var(--color-ink);
  --muted: var(--color-paper-2);
  --muted-foreground: var(--color-text-secondary);
  --destructive: var(--color-danger);
  --border: var(--color-rule);
  --ring: var(--color-focus);
}
```

The A-List tagline is “Cinema at home”, used on authentication screens and the library footer.

## Shared terminology and inline search

The library's “This week” summary initially shows three saved films releasing in the
next seven days, with today included in the US release timezone. When more films qualify,
“Show all N releases” expands the complete week, and “Show fewer releases” restores the
preview. Desktop adds rows; phones keep a horizontally scrollable list. No database cap
silently hides additional films. It comes from the
full private library, independent of the visible page and filter, and respects
the unconfirmed-date preference. Compact date blocks lead to film details. Fine-pointer
hover gives each row a stronger neutral surface, lifts its artwork 2px and nudges its
arrow. Gaps separate the items, without divider lines beside hover highlights; reduced motion keeps the surface feedback without movement. Empty weeks say so
and retain the next known release when available.

Collection view and selection actions sit beside the collection heading. Below 640px,
filtering uses a native select alongside sorting, exposing every filter without a
horizontal strip; larger screens keep the animated filter tabs. Both presentations
share the same query state. Grid/list controls have 44px targets for every input type.
Card metadata places the film year above the release date and platform, keeping the
certainty marker attached to its date and long platform names free to wrap. Mobile
intro and toolbar spacing is tighter so artwork appears earlier in the viewport.

Use **Available**, **Coming Soon**, and **TBA** for release timing throughout the app. **Unconfirmed** is a certainty qualifier, replacing the ambiguous “Reported” label; it must never imply a verified release or availability. Storage/API confidence values stay unchanged. Calendar titles use `[Unconfirmed]` and preserve their existing event identities and 1pm GMT alarms.

The floating pill contains a real search field between the text wordmark and calendar/account controls. Results open in an anchored, non-modal panel; typing stays focused in the field, arrow keys navigate, Enter opens, Escape dismisses, and Cmd/Ctrl+K focuses search. Search state belongs to the header, so typing does not rerender the film collection. The panel uses restrained opacity/position feedback and respects reduced motion.

Search focus never changes navbar geometry. Calendar/account controls remain visible on narrow screens, the desktop shortcut/clear slot has a fixed width, and phone clear/close controls live in the results panel. The input retains the same position and width when focused, typed into, cleared, or dismissed.

On touch, pressing artwork never reveals the mouse-only View Film cue. Phone cards
lead with the release date, then timing status and platform; Home Releases stacks
the provider, date, certainty and source-check information in one reading column.
Film sheets expose a 44px drag-handle target for swipe-down dismissal. Native
modality, title focus, focus return, and explicit close controls remain available;
scrolling the details content does not start a drag. Reduced motion keeps direct
finger tracking and uses a brief settle without a momentum animation.
