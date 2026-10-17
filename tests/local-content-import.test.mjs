import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSnapshot, sha256 } from '../vendor/local-content/legacy-snapshot.mjs';
import { importLegacy } from '../scripts/local-content/import-legacy.mjs';
import { checkLegacy } from '../scripts/local-content/check-legacy.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
function run(fn){const p=mkdtempSync(join(tmpdir(),'symgene-import-'));try{return fn(p);}finally{rmSync(p,{recursive:true,force:true});}}
function pack(source,target){const s=createSnapshot(source);for(const [p,b]of s.files){mkdirSync(join(target,p,'..'),{recursive:true});writeFileSync(join(target,p),b);}writeFileSync(join(target,'manifest.json'),JSON.stringify(s.manifest));return s;}
function consumer(root){mkdirSync(join(root,'vendor/local-content'),{recursive:true});cpSync(join(ROOT,'vendor/local-content/legacy-snapshot.mjs'),join(root,'vendor/local-content/legacy-snapshot.mjs'));cpSync(join(ROOT,'content-pack.lock'),join(root,'content-pack.lock'));}
function hashes(root){const s=createSnapshot(root);return {digest:s.manifest.digest,lock:sha256(readFileSync(join(root,'legacy-content.lock'))),adoption:sha256(readFileSync(join(root,'content-pack.lock')))};}
test('import requires an out-of-band digest and preserves formal T02 adoption',()=>run(p=>{
  const src=join(p,'pack'),dst=join(p,'site');mkdirSync(src);consumer(dst);const s=pack(ROOT,src);
  assert.throws(()=>importLegacy(src,dst),{code:'IMPORT_PIN_REQUIRED'});
  const before=readFileSync(join(dst,'content-pack.lock'));importLegacy(src,dst,{expectedDigest:s.manifest.digest});
  assert.equal(checkLegacy(dst).counts.drugProfiles,114);assert.deepEqual(readFileSync(join(dst,'content-pack.lock')),before);
}));
test('corrupt input is rejected before any existing content is replaced',()=>run(p=>{
  const src=join(p,'pack'),dst=join(p,'site');mkdirSync(src);consumer(dst);const s=pack(ROOT,src);importLegacy(src,dst,{expectedDigest:s.manifest.digest});
  const before=hashes(dst);writeFileSync(join(src,'src/content/knowledge.json'),'{}');
  assert.throws(()=>importLegacy(src,dst,{expectedDigest:s.manifest.digest}),{code:'SNAPSHOT_HASH'});assert.deepEqual(hashes(dst),before);
}));
test('an explicit local edit is never silently overwritten by a later import',()=>run(p=>{
  const src=join(p,'pack'),dst=join(p,'site');mkdirSync(src);consumer(dst);const s=pack(ROOT,src);importLegacy(src,dst,{expectedDigest:s.manifest.digest});
  const path=join(dst,'src/content/communication.js'),edit=readFileSync(path,'utf8')+'\n// fictional local edit\n';writeFileSync(path,edit);
  assert.throws(()=>importLegacy(src,dst,{expectedDigest:s.manifest.digest}),{code:'IMPORT_LOCAL_EDIT'});assert.equal(readFileSync(path,'utf8'),edit);
}));
test('write failure restores every prior byte and lock; it is never reported as success',()=>run(p=>{
  const src=join(p,'pack'),dst=join(p,'site');mkdirSync(src);consumer(dst);const s=pack(ROOT,src);importLegacy(src,dst,{expectedDigest:s.manifest.digest});
  const before=hashes(dst);let calls=0;
  assert.throws(()=>importLegacy(src,dst,{expectedDigest:s.manifest.digest,write:(f,b)=>{writeFileSync(f,b);if(++calls===4)throw new Error('FICTIONAL_IO_FAILURE');}}),/FICTIONAL_IO_FAILURE/);
  assert.deepEqual(hashes(dst),before);
}));
test('multi-version import and pinned rollback retain the exact original manual seed',()=>run(p=>{
  const first=join(p,'v1'),second=join(p,'v2'),dst=join(p,'site');mkdirSync(first);mkdirSync(second);consumer(dst);
  const a=pack(ROOT,first);pack(ROOT,second);
  const f=join(second,'src/content/communication.js');writeFileSync(f,readFileSync(f,'utf8')+'\n// fictional version fixture\n');
  const b=createSnapshot(second);writeFileSync(join(second,'manifest.json'),JSON.stringify(b.manifest));
  importLegacy(first,dst,{expectedDigest:a.manifest.digest});const before=hashes(dst);
  importLegacy(second,dst,{expectedDigest:b.manifest.digest,expectedCurrent:a.manifest.digest});assert.notEqual(hashes(dst).digest,before.digest);
  assert.throws(()=>importLegacy(first,dst,{expectedDigest:a.manifest.digest,rollback:true}),{code:'ROLLBACK_CURRENT_PIN_REQUIRED'});
  importLegacy(first,dst,{expectedDigest:a.manifest.digest,rollback:true,expectedCurrent:b.manifest.digest});assert.deepEqual(hashes(dst),before);
}));
