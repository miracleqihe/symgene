import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLegacy } from './check-legacy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Owner policy: the legacy site follows the standard engineering release flow.
// This checks integrity and adoption isolation, without granting medical approval.
export function publicationDecision(root = ROOT) {
  const integrity = checkLegacy(root);
  const lock = JSON.parse(readFileSync(resolve(root, 'legacy-content.lock'), 'utf8'));
  return {
    status: 'INTEGRITY_VERIFIED', code: 'LEGACY_RELEASE_INTEGRITY_VERIFIED',
    snapshotDigest: lock.digest, snapshotVersion: integrity.version,
    scope: ['runtime pages and bundled medical text', 'teaching Markdown and entry Prompts',
      'global/module Agent guides', 'portable Skill', 'llms.txt and manifests'],
    entries: integrity.counts,
    releasePolicy: 'standard_repository_workflow',
    clinicalApproval: 'not_asserted',
    localPreviewAllowed: true, formalT02Adoption: 'unchanged',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(publicationDecision(), null, 2)); }
  catch (error) {
    console.error(JSON.stringify({ status: 'REJECTED', code: error.code || 'PUBLICATION_CHECK_FAILED' }));
    process.exitCode = 1;
  }
}
