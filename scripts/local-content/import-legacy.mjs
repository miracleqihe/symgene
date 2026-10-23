import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySnapshot, strictJson, safeFile, sha256, fail } from '../../vendor/local-content/legacy-snapshot.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function importLegacy(source,root=ROOT,{expectedDigest,rollback=false,expectedCurrent,write=writeFileSync}={}) {
  if(!/^[a-f0-9]{64}$/.test(expectedDigest||''))fail('IMPORT_PIN_REQUIRED');
  const snapshot=verifySnapshot(source,{expectedDigest});
  const lockPath=resolve(root,'legacy-content.lock');const previous=existsSync(lockPath)?strictJson(readFileSync(safeFile(root,'legacy-content.lock'))):null;
  if(expectedCurrent&&previous?.digest!==expectedCurrent)fail('IMPORT_CURRENT_CHANGED');
  if(rollback&&!expectedCurrent)fail('ROLLBACK_CURRENT_PIN_REQUIRED');
  // Refuse to overwrite an unexported edit, even when the incoming snapshot is valid.
  if(previous)for(const entry of previous.files){if(sha256(readFileSync(safeFile(root,entry.path)))!==entry.sha256)fail('IMPORT_LOCAL_EDIT');}
  const before=new Map();
  for(const p of [...snapshot.files.keys(),'legacy-content.lock']) {
    const file=resolve(root,p);let current=root;
    for(const part of p.split('/').slice(0,-1)){current=resolve(current,part);if(existsSync(current)&&(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory()))fail('IMPORT_TARGET_PATH');}
    if(existsSync(file)&&(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()))fail('IMPORT_TARGET_PATH');
    before.set(p,existsSync(file)?readFileSync(file):null);
  }
  const next={...snapshot.manifest,manifestSha256:snapshot.manifestSha256,
    verifierSha256:sha256(readFileSync(resolve(root,'vendor/local-content/legacy-snapshot.mjs')))};
  try {
    for(const [p,b] of snapshot.files){const f=resolve(root,p);mkdirSync(dirname(f),{recursive:true});write(f,b);}
    write(lockPath,Buffer.from(JSON.stringify(next,null,2)+'\n'));
  }catch(e){
    let failed=false;for(const [p,b] of before){try{const f=resolve(root,p);if(b===null){if(existsSync(f))unlinkSync(f);}else writeFileSync(f,b);}catch{failed=true;}}
    if(failed)fail('IMPORT_RECOVERY_REQUIRED');throw e;
  }
  return {status:rollback?'LOCAL_ROLLBACK':'LOCAL_SNAPSHOT_IMPORTED',version:next.version,digest:next.digest,
    publication:next.publication,formalT02Adoption:'unchanged'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,digest]=process.argv.slice(2);if(!source||!digest||process.argv.length!==4)throw new Error('usage: node scripts/local-content/import-legacy.mjs <snapshot-directory> <expected-sha256>');
  console.log(JSON.stringify(importLegacy(resolve(source),ROOT,{expectedDigest:digest}),null,2));
}
