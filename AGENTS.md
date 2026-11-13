<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Release workflow

After completing a change, run the required checks, push it to GitHub, merge it cleanly into `main`, and verify the production deployment. This is the user's default authorization; do not stop at local changes or ask for routine release confirmation. If failed checks, unresolved conflicts, or another concrete concern make release a bad idea, explain the issue and resolve it before proceeding.
