# A-List UX and motion fixes

October 29, 2026. Implements the six new findings and four selective motion opportunities in the [UX/motion review](ux-motion-review-2026-10-29.md). Preserves the existing release system and membership/Undo behavior. Release uses the reviewed working tree; no commit or push is made.

## Behavior

- **Account/sign-in recovery:** shared JSON/blob request handling bounds reads at 10 seconds and mutations at 30 seconds, including response-body consumption. Export can be cancelled by closing the dialog and cannot download after cancellation. Its pending button remains focusable with `aria-disabled` and a synchronous request guard. Sign-in handles HTML outages and reports that a timed-out email may still arrive. Success and returning to email entry receive focus.
- **Uncertain account writes:** unreadable successful responses, transport failures and deadlines do not silently enable duplicate reset/delete requests. A separate Check outcome action performs a bounded read. A changed calendar token reconciles reset success; an expired/deleted session returns to sign-in without claiming that deletion was proved. The original typed confirmation remains. Mutation requests are never automatically repeated.
- **Modal handoff:** opening a native dialog removes the outgoing Radix menu layer immediately so its retained exit layer cannot capture Escape ahead of the dialog. Ordinary menu close/reversal behavior retains its existing transitions and focus management.
- **Calendar-local recovery:** tracked-film, preference and clipboard failures appear inside Calendar settings. Failed tracked pages have an inline Retry preserving previous films and the failed offset. Failed preferences retain the previously confirmed selection. Clipboard success is announced locally after completion.
- **Empty collections:** a filtered empty collection clears its filter independently of personal saved count. A genuinely empty Library offers first-film onboarding; an unfiltered empty Discover offers title search.
- **Navigation context:** section/filter/sort use validated URL state and intentional Back/Forward entries. Each section remembers its last query during the mounted session; grid/list survives reload through optional local storage. History restoration is immediate. Startup and stale-response intent guards remain. This does not persist every previously appended page or every section's scroll position across a full reload.
- **Search reuse:** up to 12 normalized query results are retained in memory for 60 seconds, within the mounted header. Equivalent active queries share the same effect rather than issuing another debounced request. Expired/failed searches can be retried explicitly. Confirmed membership changes override older cached membership; newer remote search results remain authoritative. No query cache is persisted across sign-out/navigation to another document.
- **Pending removal:** the bulk action now communicates Removing… and busy state while retaining confirmed-only departure, partial-success handling and Undo.

## Motion

No animation library was added. Existing easing/duration tokens and CSS/WAAPI provide:

1. Sign-in success: 180ms opacity/4px entrance within stable panel geometry.
2. Account confirmation: 180ms opacity/4px entrance and 120ms exit; content remains inert during exit and focus returns immediately on cancel.
3. Expanded synopsis: a short opacity bridge; the existing chevron transition now also respects keyboard immediacy. Reading text is not translated or scaled.
4. Clipboard confirmation: fixed-width icon/label feedback, a 120ms icon fade and confirmed check drawing using the existing 180ms vocabulary.

Keyboard state changes remain immediate. Reduced-motion uses opacity-only alternatives; WAAPI effects cancel on keyboard input, preference change and unmount. Network work and focus never wait for animation completion. No search-result stagger, moving dates, fly-to-library posters or full-page theme transition was introduced.

## Performance measurement

The linked Vercel project already has a Speed Insights configuration but reported `hasData: false` before this release. The official `@vercel/speed-insights` 2.0.0 SDK is now wired at a 50% sample rate with debugging disabled. Before-send filtering permits only `/`, `/login` and `/privacy`, strips all query/hash values and rejects auth callbacks, private feeds and API paths. The app attaches no account, film or search fields. Privacy copy explains the measurements. See the [official configuration reference](https://vercel.com/docs/speed-insights/package).

This covers performance metrics, not a new browser-error tracking service. No paid feature switch, environment change, new backend collector, notification or drain was configured. Real-user distributions need traffic; a script loading successfully is not a population-level INP result.

Film reading content is memoized separately from selection controls, avoiding repeated release/date formatting on selection changes without changing DOM, browser find or keyboard behavior. Fresh before/after headless Chromium profiles at 4× CPU slowdown are recorded in [before](measurements/ux-scaling-before-2026-10-29.json) and [after](measurements/ux-scaling-after-2026-10-29.json).

At 500 mounted synthetic cards, both profiles contain 13,185 nodes. Three selection-mode click-to-two-frame samples were approximately 234/368/162ms before and 211/361/197ms after. That does **not** establish a clear overall speedup; sizable long tasks remain. Memoization removes redundant work but does not solve the cost of changing hundreds of controls. A bounded rendering strategy needs a separate measured pass preserving selection, find, focus, scroll anchoring and Undo. These synthetic samples are not production INP or a phone GPU measurement.

**Audit correction:** the existing stylesheet already includes a 16px sort-control rule for coarse pointers. The audit's 14px narrow-viewport observation did not exercise that media condition. No duplicate rule or new suppression was retained. Actual iPhone/Android picker and zoom behavior still need physical-device verification.

## Verification

- Formatting, ESLint, TypeScript, 199 unit/data tests and backup/restore self-test pass.
- All 54 browser checks passed in the complete production-build fixture run: 42 existing regressions, 11 new UX/motion/measurement regressions and one temporary scaling diagnostic. The diagnostic is archived outside the active suite at `outputs/review/ux-scaling.spec.ts`; the permanent suite has 53 scenarios.
- Final focus refinements are checked separately for uncertain reset and returning from sign-in success to email entry.
- Existing pagination/refresh consistency, startup intent, deadlines, source/feed behavior, keyboard/reduced-motion, partial removal and in-flight Undo checks remain passing.
- Reviewed narrow dark account confirmation and narrow light sign-in success captures. No horizontal overflow in the exercised success state. Artifacts: `outputs/review/ux-account-confirm-375-dark.png` and `outputs/review/ux-login-success-375-light.png`.
- Static Impeccable detection is clean. No new suppression was added; approved typography and the existing narrow inherited Arial fallback exception remain.

Authenticated mutation checks use disposable providers. No production library save/remove, reset, deletion or email send is needed for release verification. Physical touch/Safari and a full screen-reader audit remain outside these headless fixtures.

## Release scope

Project/team: `prj_eV35BkjAL547jBP5t73vsI2fsmSC` / `team_QRbcE5QYR9UroFoG1dF2RVnz`; runtime Node 24 / Next.js 16.4.3. Production base verified as `dpl_HFxHxNFDCxxa4cNkXmzv1iV6c4vx` at `https://a-list-dcihsc7qt-terence-yebuahs-projects.vercel.app`.

Compared local source hashes against the current production source tree. Existing changed files are the reviewed frontend/request components, package files and request tests. No API handler, authentication server route, database, release-provider or scheduler source differs from that production base. New runtime modules are the client request helper, URL-state helper, performance-event sanitizer, entrance hook and performance component.

The connector cannot access this team scope, so release inspection uses the existing authenticated CLI and explicit project/team selectors. Stage with production configuration and no domain assignment; verify; promote that same build. Final deployment/endpoint observations are appended after verification.


## Final production checks

- Live: [A-List](https://a-list-nine.vercel.app), Production / READY, `dpl_3926ecaJ4JH477g9G36Wq7K25pJi`. Unique build: https://a-list-n2ervlzqg-terence-yebuahs-projects.vercel.app. Reviewed working-tree base: `c1de7fc`; Next.js 16.4.3 / Node 24; remote build 1m 52s.
- Verified the live domain still pointed to the inspected membership-motion base immediately before promotion, then to this build afterward. The staged build was promoted without rebuilding.
- Staged protected access used `vercel curl`: login/privacy/CSS and performance script HTTP 200; public `/api/status` HTTP 200 healthy; private `/api/health` HTTP 401. No protection setting was changed.
- Live login/privacy HTTP 200; `/api/status` HTTP 200 healthy; private health HTTP 401. A narrow Chromium browser loaded the live sign-in page without uncaught page errors or horizontal overflow.
- The live performance script loads HTTP 200 at the platform-generated path, with sample rate 0.5. Before-send URL filtering is covered by unit and browser checks. No claim is made that a useful field baseline already exists.
- Final account/sign-in focus refinements: two browser scenarios pass. Latest complete local check, 199 tests and restore fixture pass; detector `[]`.
- Deployment-scoped runtime error/fatal scan through 07:37:41 UTC returned zero records. This is a brief release observation, not ongoing browser-error monitoring.

Evidence: [release checks](measurements/ux-release-2026-10-29.json). Remaining work: large-collection rendering beyond this modest memoization, physical Safari/Android interaction checks, and browser-error tracking if needed in addition to performance metrics.
