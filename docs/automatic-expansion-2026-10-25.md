# Automatic When To Stream expansion — 2026-10-25

The personal workflow stays Discover → Save → automatic calendar tracking. When To Stream can add films that lack a main-source listing, without a review queue. New discoveries do not save themselves to anyone's library.

## Matching and retained behavior

- Reuse valid reviewed mappings; retain the original method and private human audit rows.
- Accept explicit source `Movie` IMDb identity only when the article subject and independent metadata agree.
- Otherwise require one exact normalized title/year candidate with a matching director and at least two distinct shared cast members. Record this as `corroborated`, never human-reviewed.
- Native WordPress page ID, canonical URL, heading and credits bind the mapping to a fingerprint. Positive changes trigger revalidation; temporary outages retain last known dates. Invalidated mappings override seed records.
- Missing metadata, sparse credits, multiple qualifying candidates and identity conflicts remain unresolved. No title/year-only publication.
- Keep native/canonical movie IDs, calendar UIDs, primary listed date priority, rumor settings and unknown-date saves. Exact IMDb lookups prevent a second import of an existing film. Imports survive RSS rotation.

## Bounded work

The existing QStash schedule is active every ten minutes. Ingestion handles saved/requested film refreshes first. A shared two-page RSS snapshot refreshes every six hours. Expansion uses remaining job time, with a maximum of five reports, two concurrent film checks and a ten-second deadline. Unresolved evidence retries after 24 hours or when the RSS evidence changes. Interrupted work remains due. Cached mappings/profile checks avoid repeated metadata searches.

The 80-entry recent-feed buffer holds recent processing checkpoints; it is not a lifetime film cap. The old twenty-film review pilot limit is no longer on the ingestion path. `/review` redirects home; its manual API and client interface have been retired. Existing historical SQL audit/review functions remain private for compatibility; automation does not call them or fabricate reviewer records.

No new service, paid data feed, AI call, queue or scheduler was added. Existing Supabase, Redis and the scheduled refresh job are reused.

## Rollout and verification

- Local: 77 tests pass; ESLint, optimized production build and TypeScript pass. Tests include ambiguous/partial evidence, two-distinct-cast checks, source outages and withdrawal, changed native profiles, sparse reviewed identities, primary dates, stable UIDs, read-only shadow execution, cache reuse, interruption, concurrency/size limits, atomic publication, optimistic version conflicts, duplicate identities, and more than twenty lifetime matches.
- Applied migration `20261025121452_automatic_release_expansion.sql`. Existing tables gain matching provenance/profile freshness and a bounded RSS checkpoint. New RPCs are security-invoker with an empty search path; only `service_role` can execute them. Anonymous and authenticated roles cannot publish matches.
- Production shadow: all ten approved identities matched the exact existing IMDb and canonical movie IDs. Ten reports took five batches of two; each batch completed within 1.3 seconds. Metadata requests: zero. Shadow mode made no writes.
- The migration and shadow check retained all three current library rows byte-for-byte (digest `352bac852a62aa0d3c8ee610fa8584b4`) and all ten historical audit records. Calendar baseline: three saved films, three events, three UTC alarms.
- Supabase security advisors show only the existing two informational notices for intentionally private RLS tables without client policies, plus the pre-existing leaked-password-protection setting. No newly exposed table/function access. References: [private RLS tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

- The live ingestion path matched all twelve current reports in bounded passes of five, five and two. The final immediate repeat processed zero reports, matched zero and completed expansion in 129 ms (whole ingestion: 1.838 seconds). No new unreviewed film was present in this snapshot; future cold discovery is covered by isolated pipeline/database tests.
- A separate read-only inference check on stored historical evidence matched eight identities to their exact reviewed IMDb IDs; four records with missing/sparse stored evidence stayed unresolved. Existing reviewed identities remained active for all twelve.
- Browser round trip: Discover → Avedon details → Save → Calendar. Counts changed three → four → three for both saved films and events. Downloaded ICS verified Avedon's November 11 date and 13:00 UTC alarm, then the original event UIDs, titles, dates and alarms after removal. The final library digest equals the original baseline, including saved timestamps. All ten human audit records remain unchanged.
- Public API boundary integration passed. Signed-in `/api/review` returns Not found; `/review` redirects home, and the review footer is absent. Both post-release error scans returned zero records. The final public boundary smoke check passed, and the signed-in final build rendered Discover and the WTS-only Avedon details with the original library restored.

## Deployment

Production is [A-List](https://a-list-nine.vercel.app), project `prj_eV35BkjAL547jBP5t73vsI2fsmSC`, team `terence-yebuahs-projects`. Final deployment: `dpl_J3YrXQNA5K1vTu5Yg8jN4EcapNR3`, staged and checked before promotion; production flag `ALIST_WTS_AUTO_IMPORT=true`. Next.js 16.4.3, Node 24, London functions. The final cloud build completed successfully in about 100 seconds. This deploy includes the current workspace's existing UI work. No commit was created.

The final parser guard also withholds `structured` provenance if an article removes its explicit Movie IMDb identity, even when a cached mapping exists. The corresponding regression check passes.

## Operational control

`ALIST_WTS_AUTO_IMPORT=true` enables new automatic matches. Set it to `false` in the production environment and redeploy to pause new imports. Environment changes apply to new deployment snapshots. Established mappings and saved-film date refreshes continue while new imports are paused. A deployment rollback also remains available; the additive database migration retains old code compatibility.

Monitor existing `automatic_release_expansion`, `release_feed_unavailable`, `release_expansion_deferred` and ingestion logs. Outcomes distinguish unresolved evidence, conflicts, paused imports, source errors, exhausted time, and successful matches. Source coverage remains best effort; weak evidence is allowed to stay unresolved indefinitely.
