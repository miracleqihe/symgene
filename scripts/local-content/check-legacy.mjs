import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSnapshot, strictJson, sha256, fail } from '../../vendor/local-content/legacy-snapshot.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function checkLegacy(root=ROOT) {
  const lock=strictJson(readFileSync(resolve(root,'legacy-content.lock')));
  const actual=createSnapshot(root).manifest;
  if(lock.format!==actual.format||lock.digest!==actual.digest||lock.version!==actual.version
    ||JSON.stringify(lock.files)!==JSON.stringify(actual.files))fail('LEGACY_VENDOR_DRIFT');
  if(lock.verifierSha256!==sha256(readFileSync(resolve(root,'vendor/local-content/legacy-snapshot.mjs'))))fail('LEGACY_VERIFIER_DRIFT');
  const adoption=JSON.parse(readFileSync(resolve(root,'content-pack.lock'),'utf8'));
  if(adoption.adoption!=='legacy'||adoption.scope!=='local_simulation_only')fail('LEGACY_ADOPTION_CHANGED');
  return {status:'LOCAL_INTEGRITY_VERIFIED',version:lock.version,counts:actual.counts,
    medicalApproval:'not_asserted',rightsApproval:'not_asserted',formalT02Adoption:adoption.adoption};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(checkLegacy(),null,2));}catch(e){console.error(JSON.stringify({status:'REJECTED',code:e.code||'LEGACY_CHECK_FAILED'}));process.exitCode=1;}
}
