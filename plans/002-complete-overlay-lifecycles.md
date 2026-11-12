# 002 — Give overlays complete, reversible lifecycles

- **Status**: DONE — shared native lifecycle, Radix reversals, retained content and focus verified in Chromium
- **Commit**: c1de7fc, existing working tree included
- **Severity**: MEDIUM
- **Category**: Interruptibility / continuity
- **Estimated scope**: dialog/header/account components and their callers/styles; focused browser regressions

## Problem

`app/afterlight.css:917-922` only animates dialog entry. `components/dialog.tsx:23-37` and parent conditionals in `app/afterlight.tsx:673-708` remove the element on close. `components/account-settings.tsx:28-38,109-120` implements a separate native dialog lifecycle. Changing only CSS cannot create an exit after unmount.

```css
.dialog[open] { animation: dialog-in var(--dur-medium) var(--ease-out); }
.dialog::backdrop { background: var(--color-overlay); }
```

```tsx
{movie && (
  <Dialog onClose={() => setMovie(null)} /* ... */>
```

Search uses an entry keyframe at `components/app-header.css:139-140`; menu entry is unconditional at `:209`. Neither has an exit phase.

## Target

Dialogs retain the approved opacity-only appearance: panel **and backdrop** fade in over 180ms and out over 120ms using existing `cubic-bezier(0.16, 1, 0.3, 1)`. Reversal continues from current opacity. The native modal remains in the top layer and background stays inert until exit completes. No scale, translation, spring, blur, or decorative reveal is added to dialogs.

Menu: 120ms opacity both ways. Pointer-opened search: retain its existing -4px entry offset and 180ms entry, 120ms exit. Keyboard-focused search opens immediately; typing/navigation never triggers a new entrance. Reduced motion removes search translation, keeps at most 120ms opacity, and introduces no wait for keyboard focus.

## Repo conventions to follow

Use native `showModal` semantics for dialogs and Radix Popover/DropdownMenu semantics for header overlays. Keep shared timing/easing tokens in `tokens.css`. Do not replace Radix or introduce a motion library. Preserve account dialog busy cancellation guard, confirmation focus, and account-to-calendar handoff.

## Steps

1. Give dialog presence explicit desired-open, entering/open/closing state and a retained content snapshot. Update callers so clearing application selection requests close instead of immediately dropping the mounted dialog/content. Provide one close request callback to child close buttons, backdrop and Escape. Adapt movie, calendar, about and account paths, including close-after-remove.
2. Intercept native cancel only to run the managed exit; call `close()` after the fade completes, then notify the owner to release retained content. Preserve account's rule that busy operations cannot be canceled. Use opacity transitions rather than replaying entry keyframes; use a supported starting-state approach with a fallback.
3. Guard transition completion by element and property, handle interrupted/reopened exit and reduced-motion completion, and clean up any completion fallback. Cleanup must not close a newly reopened modal. Do not depend solely on a timeout or an event that might not fire.
4. Animate backdrop opacity in step with the panel. Restore body overflow and focus once at actual close, not when exit begins. Ensure scroll-lock handling remains correct across account-to-calendar handoff. Preserve accessible name and focus trap throughout exit.
5. For Radix, maintain presence explicitly when using transitions; keep its dismiss/focus/outside-click behavior intact. Do not assume CSS transitions alone postpone Radix unmount. Retarget current computed opacity/transform on reversal. Identify keyboard search activation without rerendering the collection; immediate keyboard-open overrides entry only, not typing feedback.
6. Preserve short opacity continuity under reduced motion; remove spatial properties. Leave keyboard focus immediate. Update the motion paragraph in `design.md` only to document these refinements, preserving all other design decisions.

## Boundaries

Do not alter account export/delete/reset behavior, request logic, authorization, layout or content. Do not let exit animation postpone a security/navigation action. No artificial search debounce change. Read installed Next documentation before editing. If lifecycle structure has drifted, refresh the plan before implementation.

## Verification

- **Mechanical**: typecheck/lint and isolated browser regressions. Cover close button, Escape, backdrop, account busy guard, remove-closes-details, account-to-calendar, and focus restoration. Assert no lingering dialog/backdrop after transition; no duplicate close callbacks.
- **Feel check**: at normal speed and 10% playback, panel/backdrop move together. Close during entry, reopen during exit, and toggle 10 times: no opacity flash or restart. Search keyboard focus and selection are immediate. Test Safari/iOS and reduced motion, not only Chromium.
- **Done when**: every overlay opens/closes coherently, rapidly reverses correctly, preserves modal semantics and restores focus to a usable trigger.
