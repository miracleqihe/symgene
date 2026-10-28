# Website content consumer: local simulation

The production application still reads its original static seed and atlas.
`src/data.js`, the search rules, the React hook, storage schema v4, and the
production UI are unchanged. T02.3 has not passed its dependency/real-input
acceptance gates, so this candidate path is not connected to production.

## Reproduce

Use Node 22 and the checked-in lockfile:

```sh
npm ci
npm run check:content
npm run simulate:content
npm run verify
git diff --check
```

`npm run build` runs `check:content` before Vite. The lock retains
`adoption: legacy`; it names one exact immutable synthetic candidate plus two
exact simulation archives. No `latest`, network retrieval, or production
adoption is supported. An invalid candidate blocks the build without changing
the legacy source or publishing a partial package. An absent candidate is
rejected; the configured simulation rollout requires a real locked candidate.

The schema and Node verifier under `vendor/t02/` are generated copies of the
pipeline authority with per-file source digests in `provenance.json`. They are
build tools; the browser adapter imports no Node modules. Those digests prove
byte correspondence, not publisher identity. Publisher authentication, a
production emergency-retraction channel, real website review, and remote
permissions remain unconfigured. Synthetic review decisions authorize no real
content publication.

The separately reviewed lock must declare both `policy.minimumCounts` for every
manifest collection and `policy.minimumLegacyCounts` for all four knowledge
collections plus institutions. Missing/invalid policy fails closed. Manifest
floors are passed to the real package verifier; projected legacy floors are
checked before any candidate is returned. A manifest cannot lower its own floor.
Subsequent simulated adoption also compares both count sets against the active
verified package. Reductions are conservatively rejected in this rollout;
legitimate reductions need a separately reviewed policy/protocol change.

## Compatibility and adoption

`adaptVerifiedBundle` projects an already verified bundle into isolated legacy
payload copies, retaining exact IDs, fields and `legacy.order`. Canonical IDs
are a sidecar mapping keyed by collection, never a replacement for storage IDs.
Ambiguous IDs/order and mismatched payload IDs are rejected. Provider IDs and
display aliases do not become application IDs. Institutions can retain numeric
IDs; the four knowledge collections retain the existing string-ID contract.
The existing data validator is an additional consumer gate, not a second
authoritative package schema.

The local state machine verifies a complete candidate, registers a verified
immutable archive descriptor, requires an explicit simulated website review,
runs the website validator, and only then switches the whole in-memory active
package. Every phase has failure injection. Failed verification, interrupted
input, failed website validation, missing review, or a conflicting version
retains the prior verified package. The archive descriptors in this simulation
are local evidence, not a remote artifact publication. No real review or
signature is manufactured.

The end-to-end simulation uses real locked package bytes and the vendored
verifier, then adapter → existing storage merge → visible projection → existing
search and detail lookup. Its browser storage is an in-memory synthetic fixture.
Golden tests separately compare legacy hashes, fields, ID/array order,
references, sorting inputs and atlas file bytes. Legacy content remains
`legacy_unverified`; it is not copied into a new public content package.

## Retraction and recovery

The consumer unions current package retractions, retained retractions from
previously adopted packages, and the independently accepted emergency ledger.
Identity mappings, redirects and dependency graphs from every adopted package
remain in the serializable safety state independently of the active lock. Thus
withdrawing a new canonical ID also hides its old legacy identity after an old
package is restored. JSON serialization/recovery is tested; durable restart
storage is not configured. Historical dependency unions are conservative: they
can hide a later revision until a separately reviewed recovery policy exists.
Canonical/collection-qualified legacy IDs, redirect closure, and source/claim
and parent/legacy relationship dependencies participate. Withdrawal of rights,
a required review, or the review set hides the corresponding subjects and their
dependents. Emergency sequences cannot decrease; equal sequences
cannot carry different events. Higher sequences retain all prior targets.

Filtering happens **after** storage v4 replays local overrides and reference
retention, before search/details. This matters because existing storage test
25zg deliberately retains a removed disease when a local case still refers to
it. Removing an ID from the seed alone cannot enforce withdrawal. The visible
projection hides withdrawn entities and dependent diseases/cases as whole
records, preserving their original medical fields and relationships. It leaves
user edits, tombstones and backup bytes intact. Restoring a
backup or rolling back a package cannot restore visibility of withdrawn IDs.

The current simulation conservatively treats every knowledge entry and
institution as high-risk. Missing, untrusted, expired, future-issued or
over-one-hour-old emergency state hides them all. A trusted flag is injected
only by the controlled local simulation; it is not an identity verification
mechanism. There is no production fetch, cache or service worker integration.
The sequence ledger is part of the in-memory simulation state; durable trusted
sequence storage across independent restarts is not configured.
Therefore real-time withdrawal, an observable production propagation maximum,
offline enforcement and emergency hosting removal are **not verified**. The
thirty-minute synthetic expiry used by the CLI is a test parameter, not a
production latency guarantee. A production integration requires a reviewed,
authenticated monotonic channel and explicit cache/offline/hosting runbooks.

Neither package rollback nor content version changes alter storage schema v4
or seed version 13. If a future migration actually changes legacy IDs, it must
also migrate field overrides, tombstones, seed IDs and cross-references after a
recoverable backup; this implementation avoids that migration.
