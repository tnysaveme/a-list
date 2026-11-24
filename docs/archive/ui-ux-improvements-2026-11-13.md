# UI and UX improvements

The November 13 audit identified thirteen improvements to browsing, film actions,
calendar previews, sign-in recovery and accessibility. The implementation keeps
the shared visual system, existing motion, private library behaviour and calendar
event semantics.

| Audit finding                                     | Result                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privacy links relied on colour                    | Inline prose links are underlined in both themes.                                                                                                                                    |
| Films started too far down on phones              | The mobile introduction is compact and This Week starts collapsed with a release count. Desktop keeps its agenda.                                                                    |
| Saved status acted as removal                     | Details name the action Remove from Library; the saved status remains in the library note, with existing optimistic feedback and Undo.                                               |
| Regional coverage was buried                      | Collection controls and Home Releases disclose US release dates.                                                                                                                     |
| Calendar previews dropped certainty               | Tentative selected dates retain an Unconfirmed label.                                                                                                                                |
| Calendar namesakes were ambiguous                 | Rows include production years and open the corresponding film, preserving modal focus return.                                                                                        |
| Titles and metadata were dead targets             | An accessible metadata action opens details or selects the film, with separate space for saved-state and selection controls.                                                         |
| Long enlarged titles were squeezed beside artwork | Long phone titles use the full row, and a text-relative container query makes more room when text is enlarged. Actions can wrap and Done stays reachable.                            |
| Card timing status was hidden                     | Available, Coming Soon and Unconfirmed are visible on cards.                                                                                                                         |
| Sign-in receipts lacked recovery                  | Success identifies the email address and offers Resend Link with a 60-second minimum successful-send cooldown and server Retry-After handling. Editing the address remains separate. |
| Reminder behaviour was hidden                     | Calendar setup explains the 1pm GMT, 30-minute reminder and conditional alert before subscription.                                                                                   |
| Singular counts used plural copy                  | One-film and one-event summaries use singular labels.                                                                                                                                |
| Labelled button groups lacked roles               | Shared labelled controls expose a group role while retaining pressed-button keyboard behaviour.                                                                                      |

Resend uses the existing same-origin sign-in endpoint and its server rate limits.
The countdown is outside live regions. HTTP-date and numeric Retry-After values
are retained by the shared request error without introducing automatic retries.

Verification uses `npm run check`, `npm run build` and the isolated Playwright
suite. New browser cases cover the mobile agenda, metadata click target and Undo,
calendar identity/uncertainty and focus handoff, enlarged long titles, inline
links and singular counts, and resend cooldown/error recovery. Existing selection,
optimistic membership, motion, reduced-motion, and account recovery regressions
remain part of the release suite.

Visual checks use both themes, widths from 320px to desktop, 200% text, long and
non-Latin titles, absent metadata, failed artwork and empty/one/paginated libraries.
These browser checks do not replace real-phone testing of software keyboards,
browser chrome, safe areas and touch feel.
