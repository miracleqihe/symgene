import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLegacy } from './check-legacy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Legacy integrity and T02 adoption flags are not publication authority.
// No boolean, environment flag or local review template can open this gate.
// Lifting it requires a separately reviewed, authenticated publication path
// that binds the actual legacy page + Markdown + Prompt output, or its removal.
export function publicationDecision(root = ROOT) {
  const integrity = checkLegacy(root);
  const lock = JSON.parse(readFileSync(resolve(root, 'legacy-content.lock'), 'utf8'));
  return {
    status: 'BLOCKED', code: 'LEGACY_PUBLICATION_APPROVAL_NOT_BOUND',
    snapshotDigest: lock.digest, snapshotVersion: integrity.version,
    scope: ['runtime pages and bundled medical text', 'teaching Markdown and entry Prompts',
      'global/module Agent guides', 'portable Skill', 'llms.txt and manifests'],
    entries: integrity.counts,
    requiredReviews: ['medical', 'public-language', 'rights'],
    qualifiedApprovalRecords: 'not_bound_to_current_output',
    remedy: 'Provide and review authenticated approval of these exact outputs before enabling a production release path.',
    localPreviewAllowed: true, formalT02Adoption: 'unchanged',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.error(JSON.stringify(publicationDecision(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ status: 'BLOCKED', code: error.code || 'PUBLICATION_CHECK_FAILED' })); }
  process.exitCode = 1;
}
