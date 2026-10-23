import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedT03Path } from '../scripts/security/check-t03-scope.mjs';

test('T03 explicitly includes #39 policy compatibility without opening content or contracts', () => {
  for (const path of ['scripts/local-content/check-publication.mjs', 'tests/content-publication.test.mjs',
    'docs/t02/local-acceptance-alignment.md', 'docs/t02/local-data-handoff.md',
    'docs/t02/local-final-engineering.md', 'docs/t02/local-review-remediation.md',
    'docs/t02/local-standard-release.md', 'vite.config.js', 'src/main.jsx',
    'src/production-runtime.mjs', 'src/production-runtime.json', 'tests/browser/legacy-runtime.test.mjs',
    'tests/content-dev-consumer.test.mjs', 'tests/content-signed-consumer.test.mjs',
    'docs/security/trusted-audit-platform.md']) {
    assert.equal(allowedT03Path(path), true, path);
  }
  for (const path of ['scripts/local-content/check-legacy.mjs', 'vendor/local-content/legacy-snapshot.mjs',
    'src/content/knowledge.json', 'src/content/content-source.mjs', 'content-pack.lock', 'legacy-content.lock',
    'vendor/t02/src/contract.mjs', 'docs/t02/arbitrary-policy.md', 'scripts/local-content/arbitrary.mjs',
    'vite.config.js/../content-pack.lock', 'scripts/local-content/../security/policy.mjs']) {
    assert.equal(allowedT03Path(path), false, path);
  }
});
