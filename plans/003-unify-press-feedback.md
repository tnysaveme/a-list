# 003 — Make press feedback consistent and keep artwork still

- **Status**: DONE — explicit action feedback, stationary navigation/posters and reduced motion verified
- **Commit**: c1de7fc, existing working tree included
- **Severity**: MEDIUM
- **Category**: Physicality / cohesion
- **Estimated scope**: shared CSS and explicit control-family selectors; no application logic

## Problem

`app/afterlight.css:97-100` moves every enabled button:

```css
button:active:not(:disabled),
a.button:active:not(.disabled) { transform: translateY(1px); }
```

Only `.button` (`:209-211`), header controls (`components/app-header.css:41`) and film controls (`components/movie-details.css:28`) transition transforms. Filters, layout toggles and poster buttons snap. The poster contains the image (`components/movie-card-poster.tsx:42-75`), so the entire artwork nudges despite its stationary-artwork contract.

## Target

Remove the universal active transform. Poster button/artwork remain stationary on press. Explicit action controls use `scale(0.97)` with **100ms press / 160ms release**, existing ease-out `cubic-bezier(0.16, 1, 0.3, 1)`. Add named `--dur-press: 100ms` and `--dur-release: 160ms` tokens; keep existing 120/180ms tokens for other feedback. Frequent filter/tab/layout selection may use immediate color/background feedback rather than scaling. Do not shrink focus rings or move film metadata.

## Repo conventions to follow

Use the explicit families `.button`, `.icon-button`, `.app-header-control`, `.film-control`, `.save-button`. Preserve any pre-existing positioning transforms; never replace a `translateX(-50%)` centering transform with scale. Poster cues already use opacity and gate hover with `(hover: hover) and (pointer: fine)` in `components/movie-card-poster.css:92`.

## Steps

1. Remove the universal button/link active translation; remove conflicting active translations in header and film control families. Inventory other button families so necessary press feedback is not accidentally lost.
2. Apply explicit transform transitions to action controls only. Resting state `scale(1)`, active `scale(0.97)`, transform-origin center. Base transition duration 160ms; active override 100ms. Retarget from the current state when pointer state changes. Keep opacity/background transitions explicit; never use `transition: all`.
3. Keep `.poster-button` stationary. Preserve its existing view cue, focus outline, selection and saved affordances. Keep filters, tabs and layout toggles stable with immediate selected-state paint.
4. Add reduced-motion overrides that remove scaling and preserve immediate color/opacity feedback. Ensure actual CSS order/specificity overrides the new selectors; do not rely on an earlier lower-specificity global rule.
5. Update only the motion-token explanation in `design.md` if needed. Preserve brand, density, geometry and all existing interaction logic.

## Boundaries

No component restructuring, new dependencies, card hover lift, poster zoom, decorative list stagger, haptics or spring framework. Read the installed Next guide before UI code edits. Refresh stale excerpts before implementing.

## Verification

- **Mechanical**: typecheck/lint; scan active production styles for remaining universal transform press rules and `transition: all`. Do not add unit tests that merely duplicate CSS values.
- **Feel check**: test pointer down, drag off, release, rapid repeat, keyboard activation, touch and reduced motion. At 10% playback, release retargets smoothly. Poster pixels stay in place; focus rings remain immediate; filters never drift. Check disabled/loading states and fixed-position controls.
- **Done when**: every action family has deliberate consistent feedback and poster artwork is visibly stationary. No layout/paint animation is introduced.
