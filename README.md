# A-List

A personal movie library for sourced US digital and subscription release dates, with an updating Apple Calendar feed. Built with Next.js 16, React 19, Supabase Auth/Postgres, and Vercel.

## Local development

Use Node.js 24. Install with `npm ci`, copy `.env.example` to `.env.local`, and fill in the Supabase project URL, publishable key, and the owner's email address. Never commit `.env.local` or a Supabase secret/service-role key. No privileged key is needed by this app.

Apply the versioned SQL in `supabase/migrations` to your Supabase project. Configure Supabase Auth's Site URL to your production URL and allow `/auth/callback` on that URL plus `http://127.0.0.1:3000/auth/callback` for local development. Then run `npm run dev` and open the printed address. Email links must be opened in the browser that requested them.

The server checks the authenticated identity and `ALIST_ALLOWED_EMAIL` on every personal request. Postgres RLS separately restricts all account, library, and cache rows to their owner. Anonymous callers have no direct read or write access to these tables.

## Deploy

This repository is linked to Vercel's `a-list` project in `terence-yebuahs-projects`. Pushes to `main` deploy to production. `vercel.json` selects Next.js, `npm ci`, the verified webpack build, and London functions near the Supabase database.

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `ALIST_ALLOWED_EMAIL` in Vercel's production, preview, and development environments. Keep preview deployment protection enabled. The production calendar endpoint must be reachable without Vercel Authentication so Apple can refresh the secret URL; the app protects the library itself with Supabase sign-in.

## Features

- Live movie search and a persistent personal library.
- Grid/list views; sorting by home release, title, theatrical release, or date saved.
- Movie details with source links and listed, rumored, or unknown home release dates.
- Individual and batch calendar tracking, including films with no date yet.
- Individual and batch removal, with a ten-second Undo.
- Updating Apple Calendar subscription, optional tentative rumors, and downloadable `.ics` snapshots.

## Release data

Dates and metadata come from [DVDs Release Dates](https://www.dvdsreleasedates.com/digital-releases/) and [When To Stream](https://whentostream.com/). Each release retains its source URL and last-check date. `lib/catalogue.json` is the sourced initial snapshot collected on 2026-10-23; it is an explicitly marked fallback and never populates your library automatically.

A listed date means a third-party source lists it. Reported dates remain tentative and are excluded from the calendar by default. Generic digital listings do not imply PVOD pricing. DVD and theatrical dates are never substituted for digital releases, and missing dates remain unknown.

Sources are checked on demand with a six-hour cache. Calendar requests independently refresh tracked movie details, so the app need not remain open. Source failures retain the last saved data. Apple's refresh interval controls when changed events appear. Coverage and availability depend on the source sites and their HTML/RSS formats. Posters and Google Fonts are fetched from their respective providers.

## Calendar privacy

The secret `/api/feed/<token>.ics` URL grants read access to the tracked subset only. Keep it private. An anonymous read-only RPC validates the token; its privileged helper is in an unexposed schema. It cannot modify the library or return untracked films. Removal or stopping tracking removes the events on the next calendar refresh.

Event UIDs retain the legacy `afterlight` namespace so a branding change does not duplicate existing events. Displayed calendar names and downloads use A-List. Existing subscriptions on the old host must be replaced with the new feed URL.

## Checks

```sh
npm run typecheck
npm test
npm run build
ALIST_BASE_URL=http://127.0.0.1:3000 node tests/integration.mjs
```

The integration smoke check verifies public sign-in, authenticated API boundaries, owner-only sign-in enforcement, and invalid calendar tokens without sending email or altering the library. Optionally set `ALIST_SESSION_COOKIE` from your own signed-in browser to verify catalogue, source details, save, calendar track, anonymous feed, remove, and cross-origin rejection. It restores its test film afterward. Never commit that cookie.

The final email sign-in and Apple Calendar subscription acceptance require the owner to complete them on their devices.
