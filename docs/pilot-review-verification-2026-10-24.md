# Pilot identity review and import verification — 2026-10-24

All ten pending films were reviewed and approved under the owner's explicit instruction. Each decision rechecked the native source page ID and canonical URL, article subject, production year, director, shared cast, synopsis, and current report. Reasons identify the review as an owner-authorized agent action. Ten distinct immutable audit records were verified.

| Film | Source page | IMDb identity | Canonical catalogue ID |
| --- | --- | --- | --- |
| Ice Cream Man | 23764 | tt36893729 | 12723 |
| Tony | 24531 | tt33095251 | 12802 |
| The Uprising | 28223 | tt36983905 | 12753 |
| Resident Evil | 28225 | tt35538033 | 12644 |
| Verity | 28251 | tt32261958 | 12309 |
| Misty Green | 32981 | tt34385184 | tt34385184 |
| Avedon | 33996 | tt41593493 | tt41593493 |
| Daniel and the Fiery Furnace | 38292 | tt37542993 | 12908 |
| April X | 38313 | tt30850718 | tt30850718 |
| If I Go Will They Miss Me | 38409 | tt39151344 | tt39151344 |

Six existing native IDs were preserved after checking explicit IMDb identifiers on their native detail pages. Four films absent from the main source's exact searches were published to Discover using IMDb IDs: Misty Green, Avedon, April X, and If I Go Will They Miss Me. The known-film control search correctly resolved The Isolate Thief to native ID 12877; unknown markup is treated as failure rather than proof of absence.

April X initially lacked an exact-year suggestion. Its explicit IMDb identity was corroborated by director/cast/synopsis and [Box Office Mojo's IMDb-linked credits](https://www.boxofficemojo.com/title/tt30850718/credits/). Current IMDb-indexed metadata and [BBFC production-year evidence](https://www.bbfc.co.uk/release/april-x-q29sbgvjdglvbjpwwc0xmtiwnjaw) agree on 2026; older search summaries use 2025. No title/year-only identity rule was introduced.

## Issues found and fixed

1. **Exact searches redirect to detail pages.** Search previously applied a listing parser to those pages and could miss existing native records. The new parser recognizes the canonical native subject, verifies its heading (including whitespace around the year), extracts explicit IMDb identity, and excludes sidebar recommendations. Explicit no-results responses are distinguished from unrecognized provider responses. Search and metadata-film release refresh use this parser; the search cache namespace was advanced to avoid reusing old results.
2. **Service-original wording.** Avedon's article names Netflix first and then says the film launches on its platform. That now produces a subscription window rather than generic digital. [Netflix's own announcement](https://www.netflix.com/tudum/articles/avedon-release-date-news) independently confirms the November 11 premiere. Incidental mentions of a service do not establish the platform.
3. **Identity approval with an existing primary window.** Verity already has a listed October 27 digital date from the main source. Approval now records the separately verified report proof in the immutable audit while retaining that listed primary date. The supplemental report remains tentative in the proof; approval does not upgrade its confidence or duplicate the window.

The database change is `20261024233601_review_evidence_without_window_change`. The optional proof argument keeps older calls compatible. Invoker security and service-only execute grants were verified in production. Anonymous and ordinary authenticated callers still cannot execute the review RPC. The advisor retains the expected [private-table/no-client-policy informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no auth settings changed.

## Live import round trip

The real signed-in browser completed Discover → Avedon details → save → calendar download → remove → calendar download.

| State | Saved films | Calendar events |
| --- | ---: | ---: |
| Original | 4 | 3 |
| Avedon saved | 5 | 4 |
| Test save removed | 4 | 3 |

The downloaded calendar contained `movie-tt41593493-subscription@afterlight`, November 11, 2026, and a 13:00 UTC display reminder. Every original event UID was preserved. After removal, the downloaded calendar contained exactly the original three UIDs and no test-film event. The original database membership, saved timestamps, and tracking values were compared with the baseline and matched exactly. No calendar preference was changed.

## Validation and deployment

- 72 tests passed, including all migrations in isolated Postgres, private RPC grants, invalid proof rejection, atomic publication/audit, primary-date retention, search redirects, sidebar exclusion, and service-original classification.
- Lint, production build, and TypeScript checks passed.
- Final deployment: `dpl_Eyqo3D38kh31Mxj14mGGjcKDdK58`.
- Build URL: https://a-list-ph5q3kkye-terence-yebuahs-projects.vercel.app
- Public app: https://a-list-nine.vercel.app; owner review: https://a-list-nine.vercel.app/review.
- Protected staged login returned 200 before promotion. The public domain was verified against the final READY deployment. Final public access-boundary checks passed without sending emails; the script's authenticated mutation branch was skipped because the actual signed-in browser performed that flow instead. A bounded error/fatal log scan returned zero records during the verification window.

Source changes remain in the local working tree; no Git remote is configured. The pilot remains capped at 20 films, with manual identity review required for new discoveries.
