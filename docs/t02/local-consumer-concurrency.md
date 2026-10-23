# T02 consumer startup concurrency

These launchers are opt-in loopback development tools. The packages and publisher
identities in the browser exercise are fictional. Production and formal content
adoption remain BLOCKED.

Two Vite configurations previously shared the root `node_modules/.vite` cache.
Their different plugin names produce different optimizer configuration hashes.
Starting one optimizer can invalidate the other server's dependency files. The
observed failure was HTTP 504 `Outdated Optimize Dep` for React modules, followed
by a React mount timeout before configuration or signed snapshot requests.

Each server now creates its own temporary optimizer cache, even when two servers
run the same consumer. `app.close()` first stops new HTTP requests and file
discovery, waits for dependency scanning and all observed optimizer processing
batches, closes Vite, then removes only that server's owned cache. The signed
browser runner also closes resources it has successfully
acquired if a later initialization step fails. A producer factory that throws
before returning must clean up its own partially initialized resources. The
existing mount timeout and signature,
withdrawal, rollback, recovery and storage assertions are unchanged.

Use Node 22 and the checked-in lockfiles. Install dependencies separately in the
website and the approved data-pipeline checkout. The latter must contain
`src/release-test-fixture.mjs`; the test does not use real publication credentials
or real medical input. Example paths below must be replaced with local paths.

```bash
npm ci
node --test tests/content-concurrency.test.mjs
node scripts/t02/consumer-concurrency.mjs \
  --producer-root /example/symgene-data-pipeline \
  --evidence-dir /example/t02-evidence
```

The default matrix runs 20 bounded cases and 40 browser probes. It compares
sequential and simultaneous startup, reused and independent Node processes,
ephemeral and fixed ports, isolated cold/warm caches, default per-instance caches,
and two instances of each consumer type. Each result records startup, HTTP ready,
DOM load, React mount, snapshot, browser/network errors, load and memory samples,
child exit codes, and cleanup of owned loopback sockets. Application requests to
other origins are blocked and counted; any such request fails the probe.

The first PR #38 Linux CI failed the cache-absence assertion: Vite cancellation
returned before an asynchronous bundle writer completed. Filesystem deletion
retries and a short settle observation did not fix that lifecycle race. A
regression now gates a real Rolldown `writeBundle` and proves that successful
shutdown joins its processing promise before deleting the cache. It also retains
the original cache-absence and refused-socket checks.

Waiting for optimizer drain and Vite close has a 15-second failure deadline.
Reaching it starts remaining Vite shutdown without an unbounded wait, rejects
with `T02_CONSUMER_SHUTDOWN_TIMEOUT`, marks `cleanupIncomplete`, and retains the
cache path in the error. A writer that has not been joined must not have its cache
deleted and be declared clean. A controlled deadline regression holds the writer
past that limit, verifies the HTTP endpoint is closed and the cache is retained,
then releases and joins its own test writer before removing that exact cache.
Arbitrary stuck plugin work cannot be forcibly terminated inside a shared Node
process; a deadline failure is not a guarantee of complete cleanup. Successful
owned-cache removal retries transient filesystem failures and fails if exhausted.
Failed cleanup produces FAIL evidence with cleanup details; runners persist PASS
reports only after cleanup succeeds. Local results do not replace a successful
rerun of the real Linux PR CI.

`cacheDir` is an explicit experimental escape hatch owned by the caller. It is
used to retain distinct caches for cold/warm comparisons. Sharing one explicit
directory between live optimizers remains unsafe and is not covered by the
default isolation guarantee. The normal launch commands do not expose this
override. A fresh default instance is reported as `fresh-instance`, not as a
warm-cache hit.

The T03 split guard admits only the six reviewed consumer scripts. It retains all
protected files and signature/content locks. The older whole-history T02 scanner
has a different historical scope and is not evidence that the new split check
or production approval passed.

Local Chromium results are local verification. They do not prove GitHub rulesets
are active, establish medical/rights approval, or authorize publication.

## CI runner dependency downloads

The reliability PR inherits the older CI definition, so its corrected Linux
verify completed but Chromium/system-font preparation stalled. It carries the
same minimal Ubuntu HTTPS mirror and strict final-value Apt readback already
validated in security PR #37. No test or Chinese glyph assertion is skipped.
Verify now explicitly selects Ubuntu 24.04 and has a 20-minute total budget;
the older workflow had no explicit job limit. Dependency and font steps remain
bounded. The broader trusted-policy, stable-check and token changes stay in
PR #37. This common preparation block is identical in both PRs and must appear
only once when they are integrated.
