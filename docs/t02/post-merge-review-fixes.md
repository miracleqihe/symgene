# T02 signed-consumer polling fix

The merged consumer called `refresh` every second, and every refresh requested
`adopt` or `rollback`. The test gateway signer issued a fresh time-bound
signature, so the audit replay key changed and each poll could append a new
decision. This was confirmed by a failing request-sequence regression before
the fix, independently of the data-runtime audit-file regression.

`createSignedSession.refresh()` now requests `action=read`. Its explicit
`adopt(version)` operation requests an independent signed adoption or rollback.
The React startup, timer, online/visibility recovery and recheck button only
read. Signing is requested by the explicit test-version signing button or a
user version selection. With no previous adoption, startup stays hidden until
an explicit decision succeeds; polling never renews expired approval.

The companion data fix retains signature, current trust, immutable artifact,
latest independent checkpoint, expiry and withdrawal verification on every
read, without changing audit bytes. Update that local test gateway before this
consumer. Old runtimes reject the read action safely. Both fix branches are
named `codex/t02-post-merge-fixes` and target their respective `dev`.

The same-origin loopback proxy accepts the additional read action and retains
fixed authority, strict query keys, origin protection, no-store and default
failure behavior. The T02 workflow explicitly includes the new fix branch so
its PR cannot silently skip the repository/history check. Pages remains main
only (or separately authorized manual deployment); no deployment is triggered
by this change.

Node 22 validation: `npm ci`, `npm run verify` (316 unit / 29 UI tests),
`npm run check:content`, `node scripts/t02/check-repository.mjs`, and
`git diff --check`. The new unit regression checks 40 reads followed by
explicit adoption and rollback. The real Chromium rehearsal passes 30
assertions and eight failure/recovery drills, including zero automatic startup
signatures, unchanged audit bytes across polling, exactly three explicit
decisions, withdrawal across rollback, restart, offline/cache denial and
storage v4 protection. Existing user keys/backups/overrides/tombstones remain
protected. The browser harness waits for the asserted React state because a
continuously polling page need not become network-idle.

No contract/vendor files, search/medical/map rules, storage schema, production
entry, content lock or synthetic package bytes change. The production build
continues to exclude this development consumer and its namespace. Original
untracked sim-1/sim-2 assets and the original worktrees are preserved.

This is an engineering fix for G4 preparation, not target or production
acceptance. The data fixes also address G2 input scope and directory identity;
real source permission, formal signoff, actual human review and authorized
target-environment validation remain blocked independently. No merge or
production deployment is authorized by these fix PRs.
