# Sym Gen repository guidance

These instructions apply to the entire repository. They are durable engineering
guardrails for Codex and other coding agents, not a replacement for human review.

## Read before changing anything

1. Read `CONTRIBUTING.md` for the current branch, review, and release workflow.
2. Read `docs/DEVELOPMENT_HANDOFF.md` before UI, animation, navigation, or layout work.
3. Read `docs/architecture.md` and `docs/local-data.md` before changing search,
   storage, import/export, migration, validation, or production gates.
4. Record `git status --short`, the current branch, `HEAD`, `origin/dev`, and
   `origin/main`. Stop if the worktree contains changes you cannot attribute.

## Branch and release workflow

- Start every ordinary change from the latest `origin/dev` on a short-lived
  topic branch such as `feat/*`, `fix/*`, `docs/*`, `refactor/*`, `test/*`,
  `chore/*`, or a narrowly scoped `codex/*` branch.
- Do not commit directly to `dev` or `main`, and never force-push shared history.
- Ordinary pull requests target `dev`; keep one purpose per branch and PR.
- `main` is the production branch and GitHub Pages source. Only a same-repository
  `dev -> main` promotion PR may carry an ordinary release to `main`.
- A promotion PR must not contain release-only fixes. Return defects to a topic
  branch, merge them into `dev`, and rerun the gates before promotion.
- After a release, follow the repository's reviewed process to synchronize the
  resulting `main` release commit back to `dev`; never reset or overwrite `dev`.
- Do not merge, mark a Draft ready, deploy, tag, or publish unless the user has
  explicitly authorized that exact action.

## Product and medical boundaries

- Sym Gen is a public mental-health knowledge base, not a diagnostic or
  prescribing system. Keep the public build read-only.
- Do not change medical conclusions, indications, contraindications, risk
  levels, crisis copy, disease/drug/case content, `TARGET_RULES`,
  `CONCEPT_EXPANSIONS`, search weights, or result ordering as part of unrelated
  engineering work.
- Medical or risk changes require an explicit scope, sources, dedicated tests,
  and separate content review. Do not invent or bulk-rewrite medical content.
- Never commit source books, PDFs, OCR text, extraction intermediates, patient
  data, credentials, real personal paths, or other private reference material.

## Confirmed UI and accessibility boundaries

- Preserve the current calm, low-saturation visual language and the confirmed
  paper-plane interaction unless the user explicitly reopens that design decision.
- Do not restore the removed welcome page, envelope experiment, decorative
  crosses, curved light beams, fixed-height drug panels, overlapping page
  transitions, or other rejected directions documented in the handoff.
- Preserve keyboard access, focus restoration, reduced-motion behavior,
  responsive scrolling, semantic tabs/dialogs, and production read-only gates.
- Treat screenshots and browser checks as evidence only for the exact viewport
  and browser tested. Do not claim manual browser acceptance when it was blocked
  or not performed.

## Local data and privacy

- UI code must use the existing hook and `src/storage/` interfaces rather than
  bypassing migrations, validation, backups, tombstones, or import limits.
- A failed migration, import, restore, reset, or backup must not be presented as
  success and must not silently replace current user data.
- `localStorage` is neither encrypted nor cross-device storage. Never describe
  it as secure storage or encourage real patient information.
- Fixtures must use clearly fictional values and `example` paths or domains.

## Verification

Use Node.js 22 and the checked-in lockfile. Before a commit or PR, run:

```bash
npm ci
npm run verify
git diff --check
```

When a check fails, fix the scoped cause. Do not delete tests, lower assertions,
skip invalid records, or weaken production/privacy gates to make CI green.
Visual changes also require the real-browser and viewport checks documented in
`docs/DEVELOPMENT_HANDOFF.md` and `CONTRIBUTING.md`.

Before staging, review the complete diff and add only intended paths. Do not
commit generated `dist/`, logs, screenshots, local backups, or temporary files.
