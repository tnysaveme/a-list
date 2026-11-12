**A-List readiness review — 2 November 2026**

The architecture is appropriate for an owner and roughly ten friends. The most valuable next work is release-data correctness, predictable source processing, and a few launch safeguards. The evidence does not justify changing hosting, replacing Supabase, adding another queue service, or rewriting the frontend.

This is an audit and implementation backlog. No application code, production records, accounts, schedules, or settings were changed. The working tree already contained substantial uncommitted changes; this review covers that working tree. Production observations are separately identified and do not prove that every local change is deployed.

The review covered the Next.js routes and authentication, client state and collection flows, calendar/export/deletion paths, source parsers and matching, ingestion and caches, SQL migrations and permissions, tests, deployment scripts, and operational documentation. Generated dependencies/build output and historical preview scaffolding were not treated as the production application. Live checks used aggregate database queries, advisors, public endpoints, and one read-only WTS reconciliation. No sign-in emails were sent.

**How the project works**

Next.js serves a private movie library using Supabase Auth and owner-scoped Postgres rows. Redis supplies shared caches, throttling and leases. Search combines DVDs Release Dates with Cinemeta; WTS supplies additional release windows after identity verification. A signed QStash request runs saved-film refresh, missing-window lookups, catalogue ingestion, WTS index discovery and report processing. Libraries share movie records while retaining private membership and calendar credentials. Calendar subscribers read stored evidence through an unguessable, revocable URL. The browser polls a compact revision rather than continually downloading the catalogue.

The strongest existing safeguards should remain: exact verified IMDb matching, conservative ambiguity handling, source attribution, last-good data on outages, explicit withdrawal handling, version-guarded publication, stable calendar IDs, fail-closed throttling, user-owned RLS, and isolated test fixtures.

**Observed baseline**

| Check                                                               | Result                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting, ESLint, TypeScript, unit/database tests, backup fixture | `npm run check` passed; 238 tests passed.                                                                                                       |
| Production dependencies                                             | `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities at review time. This is an advisory snapshot, not a security guarantee. |
| Isolated production browser build                                   | Built successfully with network access. The first sandboxed attempt could not resolve Google Fonts.                                             |
| Full browser suite                                                  | 64/65 passed. The Discover missed-invalidation scenario timed out; three focused reruns then passed.                                            |
| Public production status                                            | `/api/status` returned HTTP 200 and `healthy`; `/login` and `/privacy` returned 200.                                                            |
| Database                                                            | All eight `a_list_*` tables have RLS enabled. The newest migration, `20261102102245_library_week_summary`, is present in production.            |
| WTS inventory, approximately 20:03 UTC                              | 807 profiles: 598 matched, 114 insufficient evidence, 88 withheld, 5 source unavailable, 2 ambiguous. No profile checks were overdue.           |
| Missing-window lookup queue, subsequent sample                      | 1,280 eligible movies; 64 due; none over 24 hours overdue; no saved movies due. This is a separate queue from profile checks.                   |
| Coverage repair audit                                               | Most recent sampled audit reported zero unexplained approved-evidence gaps. This does not measure films that never matched.                     |
| Catalogue footprint                                                 | 1,614 stored movie rows; Discover snapshot contained 628 movies and 818,341 bytes of JSON text before compression.                              |
| Repeated WTS failure sample                                         | Cliffhanger reconciled read-only in 3.65 seconds with outcome `withheld` and no publishable date. No repair/checkpoint was written.             |

The 114 insufficient-evidence and two ambiguous profiles are coverage limits, not evidence that matching should become less strict. Likewise, `withheld` is not interchangeable with a network outage or a wrong match.

**Prioritized work list**

P1 means address before considering the pilot release fully checked. P2 means the next reliability/efficiency pass. P3 means useful cleanup after the pilot. Effort is relative: S is a localized change; M spans modules or a migration; L needs coordinated queue/cache changes and broader regressions.

| ID  | Priority        | Task                                                                    | Effort |
| --- | --------------- | ----------------------------------------------------------------------- | ------ |
| 1   | P1              | Include all relied-on evidence in WTS identity invalidation             | M      |
| 2   | P1              | Give search one deadline shorter than the browser timeout               | M      |
| 3   | P1              | Add basic response security headers and framing protection              | S      |
| 4   | P1 verification | Resolve the intermittent browser failure and test the actual proxy      | M      |
| 5   | P2              | Reserve processing time for WTS discovery and checkpointing             | M      |
| 6   | P2              | Preserve urgent/saved/aging priority when merging WTS work              | M      |
| 7   | P2              | Persist verified identities independently of release dates              | M      |
| 8   | P2              | Make missing-window lookup cadence fit the catalogue size               | M      |
| 9   | P2              | Persist actionable WTS failure details and queue-age metrics            | M      |
| 10  | P2              | Distinguish absent, TBA, and malformed profile fields                   | M      |
| 11  | P2              | Preserve Discover coverage when an archive source fails                 | M      |
| 12  | P2 verification | Verify enrollment, actual email/calendar use, and recovery expectations | S–M    |
| 13  | P3              | Reuse a versioned, compact catalogue snapshot across users              | M      |
| 14  | P3              | Make builds independent of font downloads and handle broken posters     | S      |

**1. WTS can reuse an identity after the evidence that established it changes.**

Confirmed with an isolated reproduction. Sparse nonfiction matching can rely on runtime and theatrical date, but `profileFingerprint()` hashes only source ID, URL, title, year, directors, cast and overview. A profile whose runtime changed from 90 to 180 minutes and whose theatrical date changed failed a fresh `automaticEvidence()` check, while `unchangedProfile()` still accepted its old mapping. This is a validation gap; no incorrect production identity was established by this audit.

Include the facts used by the matching rule in a versioned fingerprint, or store and revalidate the particular evidence that justified each match. Account for nonfiction classification as well. Migrate existing fingerprints deliberately so deployment does not invalidate every approved mapping or discard dates during temporary outages. Preserve historically reviewed mappings according to their explicit proof.

Acceptance: changing runtime/theatrical/nonfiction evidence forces appropriate revalidation; harmless release-date edits do not force identity rediscovery; transient failures preserve established data. Add the reproduced case to the regression suite.

Evidence: [fingerprint](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-profile.ts:87), [fact-based matching](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-automation.ts:68), [mapping reuse](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:286).

**2. Search can outlive the browser that requested it.**

Confirmed by deadline composition. Browser reads time out after 10 seconds. Search waits for both providers; the primary provider can consume 12 seconds, followed by up to 3.5 seconds of identity verification, plus cache/database work. A slow primary can therefore prevent usable metadata/local results reaching the caller. Aborting the browser request does not cancel this shared server work.

Give shared search work a single overall budget, leaving time for database membership and response delivery. Return safely separate results from successful providers when another times out. Keep shared-work cancellation independent of any one browser's cancellation, so one departing user cannot break another user's identical search.

Acceptance: a healthy metadata source and a stalled primary still produce results inside the client deadline; slow verification does not merge unverified identities; concurrent users still share work.

Evidence: [client timeout](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/client-request.ts:37), [provider orchestration](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/movie-search.ts:6), [primary timeout](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/sources.ts:642), [verification timeout](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/source-verification.ts:109).

**3. Public responses lack baseline browser protections.**

Confirmed on production `/login` and `/privacy`: no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy headers were returned. HSTS is present. The missing framing policy is especially relevant to an authenticated app with account actions.

Add `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, an explicit referrer policy, and appropriate feature restrictions. Roll out a broader CSP with testing rather than a policy that breaks the inline appearance script, Next hydration, poster hosts or Speed Insights. Preserve the stricter handling of token-bearing auth/calendar URLs. [Next.js header configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers) documents the supported mechanism.

Acceptance: verify headers on signed-in pages, login, confirmation and errors; confirm embedding is blocked and appearance/auth/images still work.

Evidence: [Next configuration](/Users/tnyebs/Documents/Projects/the-movies/afterlight/next.config.ts:1), [inline appearance script](/Users/tnyebs/Documents/Projects/the-movies/afterlight/app/layout.tsx:67).

**4. Close two gaps in release verification.**

The full suite failed `a changed revision bypasses a warmed Discover cache after a missed invalidation`; all three focused repetitions passed. The failed screenshot state contained bundled fallback movies rather than fixture films. The test waits for a generic `aria-busy=false` and 25 cards immediately after clicking Discover; those conditions can describe the outgoing view before its transition completes. That is a plausible synchronization race, not a proven root cause.

Wait for the intended Discover request and fixture contents before advancing the fake clock. Capture request/response failures if it recurs. Separately, `run-e2e.mjs` copies application directories and selected root files into its test build but omits `proxy.ts`, so these browser tests do not exercise production session-refresh middleware. Include it and extend the auth fixtures to cover refreshed cookies, expiry, outages, and the feed/job bypasses.

Acceptance: a clean full-suite run with the proxy included, plus repeated navigation/refresh tests synchronized to completed view changes rather than outgoing DOM state. Do not solve this by increasing arbitrary waits.

Evidence: [scenario](/Users/tnyebs/Documents/Projects/the-movies/afterlight/tests/e2e/library.spec.ts:286), [build allowlist](/Users/tnyebs/Documents/Projects/the-movies/afterlight/scripts/run-e2e.mjs:7), [proxy](/Users/tnyebs/Documents/Projects/the-movies/afterlight/proxy.ts:1).

**5. Early worker stages can consume WTS discovery's time.**

Confirmed scheduling risk, not an observed current stall. The worker has a 45-second signal. Saved-film draining checks its 18-second budget before starting work, but an in-flight movie can take another 16 seconds. Missing-window lookups can then take 13 seconds; full catalogue work runs before discovery. Discovery is skipped when elapsed time has reached 33 seconds. Some identity/import database reads do not inherit the worker signal.

Reserve time for modified-profile indexing, urgent checks and final writes; pass absolute deadlines through all blocking reads. Stop launching a batch when its remaining budget is insufficient. Prefer this adjustment within the current job before introducing separate infrastructure. If phases eventually split, give them independent durable checkpoints and leases.

Acceptance: under deliberately slow providers and a large saved queue, discovery still checkpoints regularly, work remains due when interrupted, and final writes finish before the lease/function limit. Record per-stage duration and skipped-stage counts.

Evidence: [worker sequencing](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/ingestion.ts:35), [soft batch budget](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/work-batches.ts:17), [identity reads](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-store.ts:19).

**6. Database queue priority is lost when profile work meets RSS work.**

Confirmed with an isolated reproduction. The database orders urgent repairs, aging work and saved profiles, but `inventoryEntries()` drops that scheduling information. Ingestion appends inventory after RSS, then `dueReleaseEntries()` sorts only by whether/when entries were checked and takes five. Five unchecked RSS entries can exclude every inventory entry, including an urgent repair. Multiple report paths may also fetch the same native profile during a pass.

Carry priority, saved status and original due time through the combined queue. Reserve fair capacity for urgent/aging profiles, coalesce same-profile work where possible, and retain all distinct release evidence when deduplicating. Preserve bounded concurrency and the existing identity gate.

Acceptance: an urgent repair is selected even with at least five new RSS entries; continuous announcements cannot indefinitely starve aging inventory; same-profile work does not lose a subscription or purchase window.

Evidence: [SQL priority](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/migrations/20261029081236_wts_consistency_and_fair_queue.sql:22), [conversion](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/wts-inventory.ts:178), [combination](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/ingestion.ts:272), [final selection](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-automation.ts:230).

**7. Successfully verified identities are discarded when no date can be published.**

Confirmed in code and consistent with production: all 88 withheld inventory profiles had neither a release-candidate row nor an inventory movie ID. Expansion establishes identity before reading dates, but its no-report branch returns before persisting the match. The publication RPC also requires at least one verified release. Later edits can repeat metadata searches and credit matching. Unlinked profiles cannot benefit from saved-film priority through that mapping.

Separate identity verification from release publication. Persist the verified subject, evidence fingerprint, method and check time even when all dates are TBA. Link an existing canonical movie safely; optionally expose a verified new TBA film in Discover without inventing a date. Separate `verified_no_date`, withdrawal and unresolved identity outcomes.

Acceptance: a newly verified TBA profile is matched once, reused after an ordinary date edit, invalidated after meaningful identity changes, and produces no calendar event until a valid date exists.

Evidence: [early return](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:468), [later match publication](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:556), [RPC requirement](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/migrations/20261027172301_catalogue_wts_coverage.sql:32).

**8. Daily missing-window searches already exceed the nominal sweep capacity.**

Production had 1,280 eligible films. Eight checks per ten-minute pass gives an upper bound of 1,152 row checks per day, before the 13-second stage budget, retries, skipped phases and duplicate identities. Successful negative lookups become due again after 24 hours. This does not mean saved films are currently late: none were due in the sample, and no eligible check was over a day overdue.

Keep saved/recent/upcoming films responsive, but back off repeated unchanged negative results for old unsaved films. Prefer already indexed WTS profiles to title searches, schedule by verified identity where aliases share work, and immediately reset backoff on source revision changes. Measure throughput before increasing request concurrency.

Acceptance: oldest eligible due age stays bounded over several days; saved films remain prioritized; unchanged negative checks use fewer upstream requests; a source edit bypasses the long negative interval.

Evidence: [lookup worker](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-lookup.ts:267), [lookup TTL](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-lookup.ts:143), [eligibility and ordering](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/migrations/20261027174428_wts_identity_without_display_year.sql:2).

**9. WTS failures need enough detail to act on.**

The five repeatedly failing profiles were Cliffhanger, Jimmy, Jumanji: Open World, The Thomas Crown Affair, and Unidentified. They had 11–12 stored failures and empty audit objects. Expansion collapses most exceptions to `source_unavailable` or `budget_exhausted`; it does not retain the provider, stage, HTTP status, or whether a publication lost a version race. Cliffhanger succeeded in the read-only retry, demonstrating why these should not be classified as permanently unmatchable.

Persist sanitized structured failure categories, stage, duration, last success and retry reason. Distinguish unavailable metadata, a valid metadata response with no matching movie, source parsing changes, local budget exhaustion, database failures, and version conflicts. Extend owner health with due counts/oldest age for both WTS queues and the saved-film queue. Keep the public endpoint status-only and preserve the existing logs-only notification policy.

Acceptance: each recurring failure can be diagnosed without refetching every provider; local contention is not reported as a WTS outage; healthy discovery does not obscure a growing verification backlog.

Evidence: [exception classification](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:605), [checkpoint](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/wts-inventory.ts:199), [owner health](/Users/tnyebs/Documents/Projects/the-movies/afterlight/app/api/health/route.ts:1).

**10. Missing fields and malformed date fields need different treatment.**

`profileReleaseEvidence()` puts both absent labels and present-but-unparseable values into `unknownKinds`. An absent PVOD label can be normal, so simply alerting on every unknown field would be noisy. More significantly, the no-report path can treat a mixture of TBA and unparseable fields as complete `withheld` work; the inventory then applies a weekly interval. The later `partial` calculation only handles the branch that has verified reports and an existing affected release.

Represent absent/not-applicable, explicitly TBA/withdrawn, parsed date, and present-but-unrecognized separately. Preserve last-good dates for unreadable fields and use a transient retry when an expected field cannot be parsed. Do not treat omitted labels as a wholesale parser failure.

Acceptance: a profile with one explicitly withdrawn window and another malformed date withdraws only the first and retries the second promptly; ordinary missing PVOD labels remain quiet. Cover both new and previously matched profiles.

Evidence: [field parsing](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/sources.ts:425), [no-report branch](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:468), [partial detection](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-expansion.ts:542), [weekly completion backoff](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/wts-inventory.ts:211).

**11. Partial archive outages can silently shrink Discover.**

Confirmed code path; no current production loss was measured. `loadCatalogue()` tolerates failed historical-month requests and returns films from successful pages. Ingestion then replaces the catalogue snapshot with those candidates plus WTS imports. Previously stored primary-only films from a failed month can disappear from Discover even though their database/library rows survive. The pass records catalogue success; the partial-source warning is only a log.

Retain last-good membership per source month, or carry source completeness into publication and preserve the affected partition. Keep a deliberate retirement rule so this does not retain everything forever. Older archive partitions can also refresh less often than current/next-month listings.

Acceptance: one failed archive does not remove its films from Discover or mark the partition freshly verified; recovery updates it normally; intentional catalogue retirement still works.

Evidence: [partial fetch handling](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/release-catalogue.ts:29), [publication candidates](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/ingestion.ts:197), [snapshot replacement](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/migrations/20261025182742_catalogue_publication_versions.sql:21).

**12. Verify the intended ten-friend access and recovery model.**

This is a launch check, not a finding of cross-account data exposure. The application checks an environment email allowlist, while database policies enforce ownership rather than membership in that list. Supabase's public settings reported signup enabled, email confirmation required and anonymous signup disabled. This review did not establish whether an additional hosted Auth hook restricts enrollment. App-level throttles/allowlists do not govern direct Supabase Auth calls.

If the pilot is invitation-only, enforce that policy at enrollment and, if access revocation must apply to direct Data API use, in database authorization too. Do not infer revocation from merely removing an address from a Vercel variable. Supabase supports a [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook); existing-account authorization remains a separate concern. If open verified-email signup is intentional, document that decision and verify provider-side abuse limits.

Before inviting everyone, use an authorized test account to verify an actual delivered email on another device, save/remove/Undo, calendar subscription and refresh, link reset, export and deletion. Fixture tests cannot establish SMTP delivery or Apple Calendar behavior. No emails were sent during this audit.

Record the latest recoverable backup and what loss is acceptable. Existing backup tooling passes its synthetic restore test, but excludes real Auth identity/settings recovery and is not proof of a current scheduled full-project backup. Keep any existing decision to use tooling only explicit; a paid backup plan is not assumed necessary. Update the operations document's stale instruction to apply the October 30 sort migration: it is already present in production, as is the November 2 week-summary migration. Reconcile this working tree with the actual release before deployment.

Evidence: [app access](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/auth.ts:5), [owner RLS](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/migrations/20261023180527_a_list_initial.sql:32), [auth configuration](/Users/tnyebs/Documents/Projects/the-movies/afterlight/supabase/config.toml:1), [operations](/Users/tnyebs/Documents/Projects/the-movies/afterlight/docs/operations.md:80).

**13. Reduce full-catalogue reads after correctness work.**

The client already receives compact pages, which is appropriate. However, `fresh=true` bypasses Redis and reads the full source snapshot, followed by canonical movie hydration in sequential batches of 200. The current 628-film snapshot therefore requires four movie batches plus its snapshot read before selecting a page. In-process single-flight does not share that rebuild across server instances. Multiple friends responding to the same revision can repeat this work.

Use a catalogue content version to share one canonical compact snapshot across instances, following the existing versioned identity-cache pattern. Exclude synopses from card snapshots and keep personal membership attached afterward. Measure cold/warm API latency and bytes first; at this size, a database pagination rewrite is optional.

Acceptance: concurrent first-page refreshes reuse the same current revision, a concurrent update cannot poison the cache, and missing invalidations still cannot make the browser acknowledge stale content.

Evidence: [catalogue hydration](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/data.ts:54), [batch reads](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/movie-rows.ts:7), [existing versioned-cache pattern](/Users/tnyebs/Documents/Projects/the-movies/afterlight/lib/versioned-cache.ts:3).

**14. Remove two avoidable presentation/build dependencies.**

The test build initially failed because `next/font/google` could not resolve Google Fonts; it succeeded when network access was available. Vendor the required font files and use the local font loader if reproducible offline/restricted builds matter. This is a build-time dependency, not evidence that visitors fetch Google Fonts directly.

`FilmPoster` handles an empty URL but does not replace a nonempty URL that returns an error. Add a stable fallback on image failure without retry loops or layout shifts. Keep responsive sizes and the current eager-loading limits.

Acceptance: the application builds without Google access, and a broken poster leaves an accessible card with stable dimensions.

Evidence: [font loading](/Users/tnyebs/Documents/Projects/the-movies/afterlight/app/layout.tsx:3), [poster rendering](/Users/tnyebs/Documents/Projects/the-movies/afterlight/components/film-poster.tsx:10).

**Items that do not need to block ten friends**

The Supabase advisor's three RLS-without-policy notices concern service-only WTS tables with client grants revoked; adding broad policies would weaken their intended protection. Its three unindexed foreign keys are secondary candidates for measured query optimization, not an urgent scaling problem at this size. See the advisor explanations for [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). Leaked-password protection was disabled, but the application's supported login flow is email-link based; evaluate that setting if password signup/login is retained as a supported route.

Keep unresolved films unresolved until evidence improves. Do not weaken matching thresholds to make the inventory percentage look better. Retain the existing Sites/Vite/Cloudflare preview files until their owner workflow is checked; they are not the supported production runtime. No additional monitoring subscription, realtime transport, large-scale load test, or microservice split is required by the evidence gathered here.

Recommended order: complete 1–4 and the launch checks in 12; then implement 5–8 together as the WTS efficiency pass; finish 9–11 as diagnostics and source-resilience work; measure before taking on 13–14. Rerun the isolated checks after each relevant change, then verify the deployed revision with a small authorized friend-account smoke test.
