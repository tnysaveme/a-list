# WTS coverage and observability — 14 November 2026

The movie-only pipeline now covers two previously held cases without title-only matching or fuzzy actor-name guesses. Köln 75 is discovered from a translated search summary, then established using exact-ID details with its native title and credits. Strange Harvest's one-year festival/distribution discrepancy requires a matching director, complete normalized synopsis, runtime, theatrical date and an exact cast credit. Multiple qualifying candidates remain ambiguous. Rule-9 verified mappings remain valid under rule 10. TV evidence is rejected before corroboration.

`npm run wts:identity-audit -- --limit 10` inspects held public profiles without writing or publishing. `--id SOURCE_ID` narrows it to one profile. The default limit is ten, maximum one hundred, with two concurrent profiles and twenty seconds per profile. It reports candidate facts and evidence gaps, not an administrative approval queue. A gap alone is not a rejection rule: different strict corroboration paths can qualify. Unknown saved status for an unmapped subject remains unknown.

## Parser and drift checks

A subscription field may contain separately labelled platform premieres. Only complete semicolon-separated `date (recognized platform)` segments qualify. The earliest date retains its corresponding platform. Conflicting dates on the same service (including aliases), invalid dates, unlabelled or unknown services, mixed ambiguous fields and multiple rental dates remain withheld. Project Hail Mary's MGM+/Prime Video field is covered by the captured fixture. EPIC's truncated rental year is upstream malformed data and is still rejected; its independently valid subscription date survives.

`npm run wts:drift` checks three fixed subjects, two daily rotating subjects and RSS. Two workers bound concurrency, and a failed check gets one immediate retry. Confirmed failures make the workflow fail instead of being swallowed by a successful shell exit. The workflow retains safe JSONL evidence for thirty days and writes a readable summary. This adds no custom email, Slack or other notification delivery; GitHub's normal workflow behavior still applies. Known malformed source data belongs in rejection fixtures, rather than a permanently failing healthy-source canary.

## Recovery guarantees

Integrated tests exercise actual lookup code and Postgres guards across repeated source failures, increasing backoff, cache loss and cache-write failure. They verify last-good calendar dates, independent film failures, guarded publication, withdrawals and series exclusion. Busy lease losers never checkpoint. Cached observations can defer a film under the existing guard but cannot advance its version or invalidate the active source writer. Late cached observations cannot postpone a newer real result.

## Retained measurements

Normal API observations run through Next's `after()` callback and replace the previous metric operation with one atomic Redis operation. There is no per-request database write or new source request. The existing throttled-response metric still precedes that response. Lookup/publication observations run only in existing background work; read-only audits do not record them.

The scheduled worker checkpoints daily aggregate counters and fixed histograms into service-only Postgres tables, retaining forty-five days. A new daily generation after whole-key Redis loss preserves already retained observations. Snapshot versions prevent duplicate or older checkpoints from replacing newer data. Hourly quality snapshots independently record queue age, profile outcome counts, coverage checkpoints and unresolved/partial/unavailable totals; a broken metric buffer does not suppress their database capture. Retention is indexed and pruned on background writes. These operational aggregates are intentionally excluded from encrypted application-row backups and restart if lost; film, library and calendar recovery do not depend on them.

`npm run wts:health -- --days 28` reads retained data without source requests or writes. Reports paginate, cap their range at forty-five days and fail explicitly if a bounded generation limit is exceeded. They separate visitor details, background detail polls, source lookups and publication freshness. No account IDs, film IDs, feed URLs, search terms or IP addresses are stored in these aggregates. No historical performance samples are invented at rollout.

Measurement limits:

- Percentiles are fixed histogram bucket upper bounds (`p50UpperMs`/`p95UpperMs`), not exact latency percentiles. Overflow is reported separately.
- Counters are approximate: an acknowledged-late Redis retry may count an operation twice. A buffer outage can lose samples not yet checkpointed; this is not an exact accounting ledger.
- Publication freshness samples describe successful publication attempts. If a later work checkpoint fails, a retry can sample the same source revision again.
- Server-error rate covers instrumented API routes, not external uptime. Hourly quality snapshots cannot reconstruct every short incident.
- First measurements establish the baseline; sustained reliability requires observing subsequent production traffic and source changes.

The additive migration must precede the code rollout. Required release checks include the full code/restore suite, production build, browser regressions, real affected-profile publication and a signed worker pass. Live probes use disposable accounts, send no email and preserve existing accounts, libraries and calendar identifiers.
