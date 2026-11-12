# A-List: UX, motion opportunities and optimization review

October 29, 2026. Current working tree after the membership-motion release. Read-only application review: no application fixes or deployment. Findings describe current behavior; regression attribution is unknown. This extends the [October 28 optimization audit](optimization-audit-2026-10-28.md) without reopening its completed work.

Implementation update: the six new findings and selective motion work are addressed in the [October 29 fixes](ux-motion-fixes-2026-10-29.md). That record also corrects the mobile-sort observation: a coarse-pointer 16px rule already existed. Performance reporting is wired; fresh large-collection measurements still show a need for further rendering work. The original audit evidence below remains a historical baseline.

## Decision

Fix blocked recovery and misleading empty states first. Preserve navigation context next. Add four small state transitions using the existing motion system, then measure real-device performance before expanding rendering work. The app already has section, filter, layout, dialog, toast and membership motion; these do not need another animation layer.

Six new findings: two P1, three P2 and one P3. Three prior recommendations remain open. No P0 was found in the exercised scenarios. P1 means fix before the next release; P2 means next improvement pass; P3 means polish.

## Implementation integrity and scoped health

**Pass: coherent product-specific implementation.** Existing shared tokens, restrained poster controls, confirmation-based membership feedback and motion-input handling form a consistent system. Impeccable's static detector returned `[]` across app/components/hooks. This does not detect the behavioral failures below.

| Dimension | Provisional score | Evidence and limits |
| --- | --- | --- |
| Accessibility | 2/4 | Busy account dialog prevents escape; calendar failure status sits outside the modal. Existing keyboard/reduced-motion support remains useful. No complete screen-reader or contrast audit. |
| Performance | 3/4 | Existing bootstrap, request guards, memoization and bounded motion are retained. Search reuse and field measurements remain opportunities. No new frame-time benchmark. |
| Theming | 3/4 | Shared light/dark tokens and before-paint appearance handling; no new full-state visual matrix. |
| Responsive design | 3/4 | Existing responsive work; mobile sort text and physical-device interaction checks remain outstanding. |
| Implementation integrity | 3/4 | Coherent system with isolated recovery and state-model gaps. |
| Total | 14/20 — Good | Scoped review score, not WCAG certification or a production performance rating. |

The accessibility score reflects additional scenarios examined here, not proof of a new regression. The existing narrow inherited Arial exception remains unchanged. Nothing was newly suppressed; no typography change is recommended.

## New findings, in priority order

### 1. [P1] Stalled account requests can strand the user in a busy dialog

**Location:** `components/account-settings.tsx:44`, `:69`, `:108`, `:116`; `components/dialog.tsx:64`. Related sign-in path: `app/login/sign-in.tsx:26`.

**Category:** accessibility / recovery / implementation integrity.

Export, calendar-link reset and account deletion use raw `fetch` without the explicit deadline handling now used by the library APIs. During export, Close is disabled and the dialog ignores Escape. A controlled stalled request confirmed both behaviors. Export retains its idle label, so a slow connection also gives little progress feedback. Sign-in has the same missing client deadline and assumes every response can be parsed as JSON.

**Recommendation:** provide bounded request handling for these paths, including reading the export response body. Make export cancellable and allow dismissal while a read is pending; show “Exporting…” and an announced busy state. Handle non-JSON failures with useful copy. For reset/deletion, a client timeout can mean the server completed the action: reconcile the outcome and explain uncertainty before enabling another attempt. Do not automatically repeat destructive requests. Preserve existing typed confirmation.

**Acceptance:** stall export and sign-in beyond their deadlines; return HTML errors; cancel export; verify no late download/state update after cancellation. Exercise an uncertain reset/deletion result without issuing a duplicate operation. Suggested command: `$impeccable harden`.

### 2. [P1] Calendar failures are reported outside the active modal

**Location:** `hooks/use-movie-calendar.ts:52`, `:72`, `:92`; `components/calendar-settings.tsx:167`; global toast in `app/afterlight.tsx:719`.

**Category:** accessibility / recovery.

Tracked-film loading, preference updates and clipboard failures use the global toast. That toast is a sibling of the native modal, rather than part of its content. Browser diagnostics confirmed that a failed tracked-film request creates its error outside the dialog and offers no inline retry. A modal dialog makes outside content inert; an ordinary toast cannot rely on z-index to participate in its top layer. See [MDN's dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

**Recommendation:** put operation-specific errors and live status inside Calendar settings. Give tracked-film loading a Retry action, preserve already loaded films on a failed next page, and retain the previously confirmed setting after a failed preference change. Put clipboard failure and success feedback beside its button.

**Acceptance:** fail the initial list, next page, preference save and clipboard separately; each error is visible/announced within the active dialog and recoverable without reopening it. Suggested command: `$impeccable harden`.

### 3. [P2] Discover's empty-state recovery uses the personal library count

**Location:** `app/afterlight.tsx:606–625`.

**Category:** UX copy / implementation integrity.

With an empty personal library and no results under Discover → TBA, the page says “Find your first film.” That action focuses search while the active TBA filter remains. The heading recognizes Discover, but the description/action branch uses `page.total`, the saved-library count. The browser fixture reproduced this combination.

**Recommendation:** distinguish a genuinely empty saved library from a filtered collection with no matches. Filtered Discover should offer “Show all films” or “Clear filter,” independent of saved count. Reserve first-film onboarding for the true empty-library state. The collection error panel should remain separate from both.

**Acceptance:** cover Library/Discover × zero/nonzero saved total × filtered/unfiltered results, plus a request failure. Suggested command: `$impeccable clarify`.

### 4. [P2] Navigation and display context disappear too easily

**Location:** `app/afterlight.tsx:53–58`, `:220–255`.

**Category:** navigation / UX.

Section, filter, sort and layout are component state. Section switching explicitly resets the filter; reloading resets display choices; browser Back cannot revisit these section/filter states. This is a workflow opportunity rather than a demonstrated violation of an existing requirement.

**Recommendation:** define section/filter/sort in URL state with an intentional history policy, preserve each section's last useful query, and remember grid/list locally. Decide which choices deserve Back entries; avoid creating one entry per search keystroke. Keep private calendar links and sensitive search text out of URLs. Preserve the existing startup-intent and stale-response guards.

**Acceptance:** return from Discover to a filtered Library; reload a list view; use Back/Forward across section changes; confirm stale responses cannot overwrite the restored context. Suggested command: `$impeccable harden`.

### 5. [P2] Search repeats work and has a weak failure recovery path

**Location:** `hooks/use-film-search.ts:17–42`; `components/movie-search.tsx:62–67`.

**Category:** performance / recovery.

The hook debounces and aborts correctly, but retains only the latest remote result. Searching A → B → A sends another request after the 350ms debounce, even when A was just fetched. Server caching can reduce backend work but does not remove this client round trip. On failure, copy always promises catalogue matches, even when the fallback list is empty, and there is no explicit Retry action.

**Recommendation:** add a small session-scoped normalized-query cache with a short TTL and bounded entry count; coalesce identical in-flight reads. Keep membership badges fresh after saves/removals, clear private cached data with the session, and avoid serving an obsolete result under a newer query. Add Retry and accurate fallback copy. This is a code-verified request opportunity; its latency benefit has not been measured.

**Acceptance:** A → B → A reuses a fresh result; expired/failed entries retry correctly; rapid typing and closing abort safely; a saved badge updates without stale cached membership. Suggested commands: `$impeccable optimize`, `$impeccable clarify`.

### 6. [P3] Bulk removal lacks explicit pending feedback

**Location:** `app/afterlight.tsx:704–706`.

**Category:** feedback / accessibility.

The batch Remove button disables during a mutation but keeps “Remove.” Individual membership controls already communicate pending state more clearly.

**Recommendation:** show “Removing…” with the existing loading treatment and `aria-busy`; keep the bar's geometry stable and preserve partial-success/Undo handling. Do not claim success or animate departure before confirmed completion. Suggested command: `$impeccable polish`.

## Motion opportunities

Use the existing `--ease-out: cubic-bezier(.16,1,.3,1)`, `--dur-short: 120ms` and `--dur-medium: 180ms`. These four candidates pass frequency, purpose, speed and functional-use gates. They describe proposed behavior, not measured perceptual improvements.

All recipes apply to pointer-initiated changes. Keyboard-driven changes and focus moves remain immediate. Reduced-motion uses a 120ms opacity-only alternative; no displaced reading content. Do not delay network work, focus or interaction until an animation finishes. Interrupt from the current state and clean up on close/unmount.

| # | Location | Today | Purpose | Frequency | Suggested motion and function gate |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/login/sign-in.tsx:65` | Form becomes the inbox-success message instantly | State indication; preventing a jarring change | Rare | Keep panel geometry stable; success enters opacity 0→1 and translateY(4px)→0 over 180ms, `var(--ease-out)`. Outgoing form fades over 120ms without retaining interactive duplicates. Feedback follows confirmed success; no delay to announcement/focus. |
| 2 | `components/account-settings.tsx:167` | Reset/delete confirmation appears and disappears abruptly | Spatial consistency; state indication | Occasional | Confirmation enters opacity 0→1 and translateY(4px)→0 over 180ms, `var(--ease-out)`; exit opacity 1→0 over 120ms, same curve. Commit geometry once; avoid animating the whole dialog's height. Keep input focus immediate and restore trigger focus on cancel. |
| 3 | `components/movie-details.tsx:228–245` | Synopsis and chevron switch instantly | State indication | Occasional | Chevron rotates 0→180deg over 120ms, `var(--ease-out)`; newly revealed text fades 0→1 over 120ms, same curve. Keep dialog/scroll anchored; no line-by-line stagger, continuous height animation or moving reading text. Keyboard remains immediate; reduced-motion fades text without chevron rotation. |
| 4 | `components/calendar-settings.tsx:141–160` | Copy icon/label swaps after clipboard success | Feedback | Occasional | Stable-width label/icon opacity crossfade over 120ms, `var(--ease-out)`; confirmed check draws stroke-dashoffset 180ms using the existing membership-check vocabulary. Reduced-motion uses only the 120ms fade. Keep success tied to resolved clipboard work; no layout shift or toast dependency. |

### Candidates deliberately rejected

- Search-result stagger on each keystroke and animated arrow-key navigation — fails frequency/keyboard gates; selection and results must remain responsive.
- Fly-to-library posters or extra hover zoom — fails functional-use gate; existing confirmed membership feedback already communicates the action without distracting from films.
- Rolling release dates/counts or entrances on background polling — fails function/purpose gates; this is information to read, not a celebration.
- Whole-page theme crossfades — fails functional-use gate; risks a distracting luminance transition during a simple setting change.
- Hold-to-confirm choreography for account deletion — fails usefulness gate; existing typed confirmation already provides deliberate consent. Extra delay adds friction.

Other seams already covered: press feedback, modal/menu entrances and exits, toast/batch-bar presence, grid/list changes, section/filter changes, and library removal/reflow/Undo. No new drag/swipe surface was identified that needs invented gesture physics. No whole-grid stagger is justified for repeatedly visited collections.

**Motion verdict:** the app needs a few clearer state changes. The sign-in success transition has the highest leverage for new motion, while recovery fixes have the highest overall value. These recipes are ready for implementation; `improve-animations plan sign-in success transition` can expand the first into a standalone handoff.

## Existing recommendations still open

These are carry-forwards, not newly discovered regressions:

1. **[P2] Real-user measurements:** app-side Core Web Vitals/browser-error reporting is absent from the reviewed source. Inspect existing platform telemetry before adding a small sampled collector. Record numeric INP/LCP/CLS, operation timings and sanitized error categories; exclude film/search/account/calendar content. Start with mobile/desktop baselines. No claim of poor production INP follows from source review. [Field-versus-lab INP guidance](https://web.dev/articles/optimize-inp). Suggested command: `$impeccable optimize`.
2. **[P2] Mobile sort control:** `app/afterlight.css:440–449` uses 14px form text. Consider 16px under a coarse-pointer query and check actual iPhone focus/picker zoom, Android behavior, landscape and safe areas. Physical-device zoom has not been reproduced here. Suggested command: `$impeccable adapt`.
3. **[P2] Large loaded collections:** pagination can accumulate many mounted cards. The prior audit's 500-card node/long-task numbers are a historical pre-membership baseline, not current measurements. Reprofile current 100/500-card scenarios before selecting containment, windowing or a bounded load model. Preserve browser find, selection, focus, removal/Undo and scroll anchoring. Do not introduce virtualization for a small library without evidence. Suggested command: `$impeccable optimize`.

## What to preserve

Server saved-library bootstrap; initialization-intent protection; selected/displayed query consistency and retry; read/write deadlines in the library API layer; recent section-query reuse; hidden/offline polling suspension; atomic loaded-page refresh; memoized collections; responsive poster sizes/aspect ratios and lazy later images; confirmed save feedback; bounded removal/reflow; keyboard focus recovery and reduced-motion alternatives.

The common remaining pattern is uneven recovery coverage: main collection flows have been hardened, while account/calendar/search still have exceptions. Fix those seams through shared request/status patterns rather than adding independent behavior to every button. No bundle replacement, additional motion dependency, backend schema change or typography redesign is supported by this review.

## Recommended sequence

1. `$impeccable harden`: account/sign-in deadlines and uncertain-result handling; calendar-local status/retry.
2. `$impeccable clarify`: correct filtered empty states and search failure copy.
3. `$impeccable harden`: define navigation/history persistence and restore context safely.
4. `$impeccable optimize`: bounded search reuse; inspect telemetry; reprofile realistic collection sizes.
5. `$impeccable adapt`: mobile sort text and physical-device checks.
6. `$impeccable animate`: implement the four selective recipes using existing tokens and input/reduced-motion policies.
7. `$impeccable polish`: consistent pending labels and final interaction review. Re-run `$impeccable audit` after fixes.

The items can be implemented individually or in that order. Validate recovery before judging additional motion: an attractive transition cannot explain a request that never returns.

## Verification and limits

Three diagnostic scenarios passed against a fresh local production build with disposable auth/data providers: stalled account export, failed calendar tracked-film loading, and empty Discover filtering with an empty saved library. These tests assert the current problematic behavior; passing means reproduction, not a fix. No production data was mutated. The full regression suite was not rerun for this read-only review.

Evidence: [diagnostic observations](measurements/ux-review-2026-10-29.json). The temporary harness was archived at `outputs/review/ux-review.spec.ts`, outside the active suite. A calendar screenshot is at `outputs/review/ux-calendar-error.png`; it was taken during dialog entry and supports placement context, not a final-state visual judgment.

This was source review plus targeted Chromium diagnostics. It does not certify physical Safari/touch behavior, screen-reader announcements, live backend latency, population Core Web Vitals or animation frame pacing. Existing production animations were not declared fluid solely from their durations. Application code and production remain unchanged by this audit.
