# WTS source excerpts

Captured from public When To Stream pages on 13 November 2026. `manifest.json` records the original URLs, subjects and capture timestamp. HTML retains the original canonical link, heading, credits and release fields; scripts, styles and the unrelated recommendations widget are omitted. RSS retains one original item with its CDATA and namespaces. These are parser regression fixtures, not current release data.

`npm run wts:drift` reads the live public pages and feed without credentials or database writes. It checks subject identity and recognizable release fields, allowing legitimate date changes. The daily workflow records failures in logs; it does not send messages. Investigate failures before replacing snapshots or changing parsers.
