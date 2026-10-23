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
run the same consumer. `app.close()` closes Vite and removes only that server's
owned cache. The signed browser runner also closes resources it has successfully
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

Vite cancellation does not prove every asynchronous bundle write has stopped.
Owned-cache removal uses bounded filesystem retries and fails if exhausted.
Regression tests also observe cache absence and refused owned sockets after a
short settle window. This is a bounded observation, not a guarantee about every
possible future Vite writer or platform. A failed cleanup produces FAIL evidence;
the runners persist PASS reports only after cleanup succeeds.

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
