# Verified source baseline — 12 November 2026

The existing workspace accumulated application changes that the November 2–5
release notes record as deployed, without corresponding source commits. This
checkpoint preserves that work together so a clean checkout can reproduce the
current implementation. It does not establish byte-for-byte parity with the
current live deployment.

## Scope

- Cinematic library, film details and authentication presentation, local fonts
  with their licenses, artwork and application icons.
- Watched history, expandable weekly releases, US release-day boundaries,
  optimistic actions, Undo recovery and collection continuity.
- Release ingestion, source health, request deadlines, bounded lookups, cache
  efficiency and associated API/database contracts.
- Existing regression tests, five migrations, design documentation and release
  evidence from the same workspace.
- Ignore checkout-local `.taste-skill/` state while retaining its files locally.

The work is intentionally kept in one baseline commit because these accumulated
features overlap in shared components, hooks, API contracts and tests. Earlier
feature and deployment records retain their original dates and verification
limits.

## Preservation and review

- Branch: `chore/verified-baseline-2026-11-12`, based on `539dfb1`.
- At the start, local `main` contained seven commits beyond the locally recorded
  `origin/main`. This branch retains those commits without rewriting history.
  Remote refs were not refreshed during this pass.
- A private temporary archive of the modified/new source files was saved before
  committing. Credentials, ignored environment files, dependencies, build output
  and test artifacts are excluded from the commit.
- A basic credential-pattern scan of the selected text files found no matches.
  This is a limited pattern check, not a complete security audit.

## Migration provenance

All five migrations remain unchanged. The local tests apply the full ordered
migration chain to disposable PGlite databases and exercise account isolation,
anonymous denial, service-only functions, release selection and watched state.

| Version          | Local SQL MD5                      | Existing production evidence                                                                             |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `20261102102245` | `be4b30e390957019cf23c6b96ada6393` | [Readiness review](public-readiness-review-2026-11-02.md) records the version as present.                |
| `20261102211042` | `158c793b581ba0e4120c992044c4e026` | [Readiness implementation](public-readiness-implementation-2026-11-02.md) records the same SQL checksum. |
| `20261103181512` | `d116b0813c466f12ad77357f918bb0b3` | [Release-day fix](release-day-fix-2026-11-03.md) records the same SQL checksum.                          |
| `20261104123804` | `f9db5f0499ea29f8bc481597ac1e9841` | [Watched library](watched-library-2026-11-04.md) records the same SQL checksum.                          |
| `20261104235202` | `d9974d7568632c9d0a3b776ff16c65b0` | [Weekly expansion](weekly-expansion-2026-11-04.md) records the same SQL checksum.                        |

No migration was applied, replayed or marked as applied during this checkpoint.
The provenance comparison uses the existing checked-in/workspace records; it is
not a fresh query of the production migration ledger.

## Verification

- Node.js `v24.22.0`.
- `npm run check` passed formatting, ESLint, TypeScript, all 261 unit/database
  tests and the encrypted-backup restore fixture.
- `npm run test:e2e` passed all 140 Chromium browser tests in 3.5 minutes,
  including its isolated production webpack build. The first sandboxed attempt
  built successfully but could not bind localhost ports; the permitted rerun
  completed successfully.
- The tracked application diff passed `git diff --check`. Checking all newly
  staged files additionally reports an existing trailing space at line 21 in each
  font license and an extra final blank line in the watched-library migration.
  Those original files are preserved, including the recorded migration checksum;
  the staged whitespace check passes with those three files excluded. The new
  baseline record was formatted with Prettier.
- The preserved application files remained byte-identical throughout verification.

Browser tests use an isolated production webpack build and disposable upstream
fixtures, with checkout environment files excluded. They do not establish live
email delivery, third-party availability or external Apple Calendar refresh
behavior.

No push, merge, deployment, production data mutation or external message is part
of this checkpoint. Before a future release, compare the committed source with
the intended deployment and recheck the remote migration ledger.
