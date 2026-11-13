# Movie lookup efficiency and recovery — 13 November 2026

Film details read stored data and account membership immediately. They register source work with Next's `after()` only when a refresh is due; provider requests do not start on the response path. The background refresh has a 38-second deadline inside its existing lease. Reopening unchanged details within a minute reuses a bounded browser cache and independently rechecks membership. Changed release content invalidates the cache. Pending checks use fewer polls with increasing delays, pause while hidden/offline and cancel when closed.

## Movie-only lookup recovery

The primary source's `TV Mini-Series` spelling previously missed both subject matching and series classification. The parser now handles `TV Series`, `TV Mini Series`, `TV Mini-Series` and `TV Miniseries`, retaining canonical native subject checks. A verified series is excluded before release markup is parsed, stored as ineligible and never searched/imported as a movie. Series have no verified release windows in either TypeScript or the database, cannot enter the calendar and remain excluded from discovery/search. The captured Night Manager excerpt exercises the actual production format; no TV feature or title-specific identity exception was added.

Lookups use namespace v14 and store per-film outcomes, safe diagnostics, retry times and consecutive failures. Unrelated film successes cannot clear another film's failure. Cached results preserve prior evidence. IMDb aliases share guarded scheduling; source revisions, completed windows and withdrawn windows invalidate obsolete work. Version and row-lock guards prevent stale workers from postponing newer checks.

Transport failures start at ten minutes and back off to six hours. Persistent format failures start at one hour and back off to a day for saved films or seven days for unsaved films. Identity uncertainty remains unresolved on the existing evidence-based cadence. Local deadline exhaustion and version contention defer briefly instead of becoming provider failures. Cache-write errors cannot discard committed results, and durable retry state remains effective after cache loss or deployment.

The scheduled worker reports `sourceFailures` separately from operational `failed` counts. A failed film stays on its own retry schedule; it does not return a whole-job 503 and immediately repeat unrelated work. Database/publication failures remain retryable at job level. Owner health retains per-film lookup failures, unresolved counts and partial profile diagnostics. Public readiness derives unavailable lookups/reports from these records; optional partial profile fields remain visible in owner diagnostics and the film's source notice without treating a usable site as entirely unavailable.

## Source history and drift

Meaningful listed/date/confidence/platform/source changes and withdrawals create history entries. Ordinary check timestamps and identity metadata updates do not. History keeps at most fifty entries per movie and a 180-day viewing window; indexed pruning happens only on movie writes. The authenticated API returns at most twelve records when requested. The collapsed Date changes control starts no request until opened, preserves the rest of the film when history is unavailable and offers retry. Source links include independently verified conflicting reports. TV subjects have no history surface. Historical public-source rows are included in encrypted application backups; older backups remain compatible.

The daily read-only drift check now compares expected field kinds individually, so a disappearing SVOD field is detected even when VOD still parses. Logs distinguish transport errors, identity changes, missing fields and malformed fields without storing raw errors or credentials. Legitimate date changes remain permitted. No email or new notification channel was added.

## Measuring speed and freshness

`api_request` records visitor request duration separately from background detail polls. `release_lookup_timing` distinguishes actual source checks from cached/scheduled results. New source revisions record `release_pipeline_timing` when their first verified publication completes, including queue wait, source-modification age and partial-check status. Old rows without known queue timestamps do not invent historical latency samples.

Use `npm run wts:timings -- path/to/runtime-logs.jsonl` to calculate p50/p95 and maxima offline from bounded log samples. This command adds no website requests or runtime database scans. Background concurrency, item limits and the ten-minute scheduler remain bounded as before.

The additive migration must precede code rollout. It adds per-film state and bounded public-source history with RLS, service-only writes and authenticated read-only history. Verify the backup, permissions, guarded alias writes and real movie-only recovery before release. Live checks use disposable accounts, send no email and preserve existing accounts, libraries and calendar IDs.
