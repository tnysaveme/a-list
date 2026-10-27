<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 -->

# Design — A-List

The approved shared system for the entire app. Extend this file and `tokens.css` together; individual screens share the same visual language.

## Genre and structure

Modern-minimal: quiet, precise and functional. Audience: the owner and friends. The main action is finding and saving a movie, then following its sourced US home-release dates through a private calendar.

- App: Workbench — compact navigation, useful collection controls, real film artwork and aligned metadata. No decorative hero or entrance choreography.
- Authentication: focused form, shared wordmark and direct action hierarchy.
- Privacy: Long Document with a comfortable reading measure.
- Navigation: N5 floating pill. A compact capsule contains the wordmark, search, calendar and account controls. The surrounding header uses the page canvas colour. Its solid surface, visible separation from the edges and restrained shadow provide depth without blur. Footer: compact Ft1 wordmark.

## Brand and typography

The wordmark is exactly **A-List**, in Figtree 600 with tight tracking. It is text only, without an icon, monogram or decorative punctuation. A shared `Wordmark` component owns its rendering. The favicon also spells the brand.

Every other piece of interface text uses Inter: headings, metadata, forms, controls, status labels and body copy. Fonts come from Google Fonts, self-hosted by Next.js. All headings are upright. Display tracking is -0.035em, wordmark tracking -0.045em. Interface weights are 400, 500 and 600. Data uses tabular numerals. No third typeface.

## Theme

Light: pure white canvas and surfaces, charcoal text and neutral grey secondary text. Very light neutral grey separates secondary controls and hover states. Dark: graphite canvas, slightly raised graphite surfaces, near-white text. Appearance follows the device. Film posters supply visual colour; interface primary actions are monochrome. Blue is reserved for keyboard focus. Semantic green, amber and red distinguish success, uncertainty and destructive actions, always with text.

All web colours and font families reference named tokens from `tokens.css`. Framework aliases in `app/globals.css` map to those tokens. Email uses sRGB equivalents and font-stack fallbacks because email clients cannot consistently resolve CSS variables or web fonts.

## Spacing and shape

4-point named spacing scale. Controls and touch targets are at least 44 px. Page gutters expand from 16 px on phones to 48 px on desktop. Controls use an 8 px radius, posters 12 px, dialogs 16 px. Layout tracks containing images use `minmax(0, 1fr)`. Dialogs fit the viewport and scroll internally. Root overflow uses clip, never hidden.

## Motion and states

No decorative reveals, floating cards or image zoom. Controls use short transform/opacity feedback; dialogs use an opacity crossfade. Focus rings appear immediately. Reduced motion removes spatial movement. Loading spinners convey actual pending work. Every interactive family distinguishes default, hover, focus, active, disabled, loading, error and success states where applicable.

## Actions and copy

Primary: solid charcoal (light) or near-white (dark), clear action verb. Secondary: neutral bordered surface. Destructive: red with an existing explicit confirmation flow. Preserve existing optimistic updates, Undo, source certainty, release-date semantics, private-account behavior and calendar identities. Avoid decorative slogans where a functional label is clearer.

## Screen allowances

Movie details prioritize the title, saved state, release evidence and synopsis. Calendar/account use grouped settings rows. Search keeps its keyboard controls. Real posters are product content, not enrichment. Privacy and emails share the typography and brand. No screen invents a new palette or changes the meaning of a release status.

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
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(1.75rem, 3vw, 2.25rem);
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
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(1.75rem, 3vw, 2.25rem);
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
