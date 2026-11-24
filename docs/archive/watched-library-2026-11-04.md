# Watched library — November 4, 2026

Your Library now has To Watch and Watched sections with separate counts. Open a saved film and choose **Mark as Watched** to move it into history, or **Mark as Unwatched** to move it back. Watched films stay saved and show their watched date. The Watched section defaults to most recently watched, supports sorting and pagination, and restores through browser history and reloads.

As requested, watched films leave the release calendar. Marking them unwatched restores their sourced events with the existing event UIDs. Watched films are also excluded from This Week, upcoming previews and calendar counts. Calendar clients receive changes on their next subscription refresh; downloaded snapshots do not update.

Watched state is an account-owned `watched_at` column on `a_list_library`. It never enters shared movie metadata. Existing row-level security remains enabled, library reads remain SECURITY INVOKER, and anonymous library access remains denied. A trigger keeps watched rows untracked even when an older client repeats Save or Track; clearing a watched date restores tracking. Repeated watch requests preserve the original date. Exports and encrypted database backups retain watched state. Removing a watched film and using Undo restores its original date.

The mutation reconciles server state after a failed/lost response before claiming success. Confirmed personal changes override older search/detail/catalogue responses. An in-flight library read is cancelled before a watched write, and background reads wait until it finishes. Error feedback remains visible inside film details; a failed request leaves the prior state available for retry.

## Verification

- Formatting, lint, strict TypeScript, all 253 unit/database tests, and the encrypted backup restore fixture passed.
- The complete 85-test browser suite passed. Five final Watched scenarios also passed after the last refinements, including the additional background-refresh race test.
- Browser coverage exercises mark/unmark, actual calendar inclusion, reload persistence, pagination, failed and lost responses, stale details, remove/Undo, and controls at 320, 375, 414, 768 and 1440 px in light and dark. Captures were reviewed. These are emulated browser sizes, not physical-device touch tests.
- Database tests exercise account isolation, anonymous denial, tracked/calendar revisions, summaries, exports, legacy repeat saves and Undo date preservation against all migrations in disposable Postgres.

## Migration

The CLI generated `20261104121513_watched_library.sql`. Its remote database dry run stalled and was stopped. The tested SQL was applied through the connected Supabase service to the existing A-List project `xuxshqjckbrvxiwzclfi`, which recorded version `20261104123804`. The recorded SQL MD5 exactly matches the tested source (`f9db5f0499ea29f8bc481597ac1e9841`); the local filename was aligned to that recorded version without changing its SQL. No historical migration was replayed or marked equivalent to different SQL.

Post-application checks confirmed the column and trigger exist, library RLS remains enabled, and anonymous RPC execution remains denied. Security advisories are unchanged: three informational missing-policy notices on service-only tables and the existing leaked-password-protection warning for the passwordless app. Existing memberships were not marked watched during rollout.

## Production release

Deployment `dpl_7iscJ9TKnYEUFpQdpUKBfL5kRzF8` became READY at 12:44:29 UTC in London (`lhr1`), after approximately 158 seconds. [A-List](https://a-list-nine.vercel.app) was explicitly verified as assigned to that deployment. The 379-file upload excluded credentials and generated artifacts; its file-manifest SHA-256 is `5dc07a9b0b770bea5c556d458158f3870e94beadcb2b6418e40463c29e5b78b4`.

Live checks confirmed the new library-section styles are served, login and privacy return 200, signed-out home redirects to login, and private catalogue/library/health endpoints return 401. A private Watched-page RPC check under a disposable caller identity returned an empty result without exposing another account's data. No real user's watched history was changed for verification. The bounded error/fatal runtime-log scan since readiness returned no entries.

Source readiness remains 503/degraded from the existing upstream source-health condition. This feature does not change source ingestion. Existing open tabs need a reload to load the new client bundle.
