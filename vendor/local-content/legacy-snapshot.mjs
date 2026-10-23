// Local legacy migration transport only. This is not the authenticated T02 public contract.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SNAPSHOT_FORMAT = 'symgene-local-legacy-snapshot/1';
export const SNAPSHOT_FILES = Object.freeze([
  ...['agentGuide.js','caseProfiles.json','cases.js','communication.js','disorderProfiles.json',
    'disorders.js','drugProfiles.json','knowledge.json','medicalText.js','professional.js',
    'profileAmendments.js','profileAudit.js','profileOverlay.js','reading.js',
    'readingProfileAudit.js','regionalAudit.js','regions.js','sourceLinks.js'].map(n => `src/content/${n}`),
  'scripts/build-teaching-materials.mjs'
].sort());
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = code => { throw Object.assign(new Error(code), { code }); };
const LIMIT=12*1024*1024;
export function safeFile(root, relative) {
  if (typeof relative!=='string' || !relative || /[\\:\x00-\x1f]/.test(relative)
    || relative.normalize('NFC')!==relative || relative.split('/').some(p=>!p||p==='.'||p==='..')) fail('SNAPSHOT_PATH');
  let p=resolve(root);let s=lstatSync(p);
  if (!s.isDirectory()||s.isSymbolicLink())fail('SNAPSHOT_SYMLINK');
  for(const [i,part] of relative.split('/').entries()) {
    p=resolve(p,part);s=lstatSync(p);
    if(s.isSymbolicLink() || (i<relative.split('/').length-1&&!s.isDirectory()))fail('SNAPSHOT_SYMLINK');
  }
  if(!s.isFile()||s.size>LIMIT)fail('SNAPSHOT_FILE');return p;
}
export function textBytes(bytes) {
  if(bytes.length>LIMIT||bytes.includes(0))fail('SNAPSHOT_ENCODING');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('SNAPSHOT_ENCODING');}
  if(/(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/|file:\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{25,}|\bsk-[A-Za-z0-9_-]{24,})/.test(text))fail('SNAPSHOT_PRIVATE');
  return text;
}
// Reject duplicate keys, including escaped equivalents; JSON.parse alone loses them.
export function strictJson(bytes) {
  const text=textBytes(bytes);let parsed;try{parsed=JSON.parse(text);}catch{fail('SNAPSHOT_JSON');}
  let p=0;const ws=()=>{while(p<text.length&&/[\t\n\r ]/.test(text[p]))p++;};
  const str=()=>{let start=p++;while(p<text.length){const c=text[p++];if(c==='\\')p++;else if(c==='"')return JSON.parse(text.slice(start,p));}fail('SNAPSHOT_JSON');};
  function value(depth){
    if(depth>64)fail('SNAPSHOT_DEPTH');ws();const c=text[p++];
    if(c==='{'){const keys=new Set();ws();if(text[p]==='}'){p++;return;}
      while(p<text.length){ws();const key=str();if(keys.has(key)||['__proto__','prototype','constructor'].includes(key))fail('SNAPSHOT_JSON_KEY');keys.add(key);ws();p++;value(depth+1);ws();if(text[p++]==='}')return;}
    }else if(c==='['){ws();if(text[p]===']'){p++;return;}while(p<text.length){value(depth+1);ws();if(text[p++]===']')return;}}
    else if(c==='"'){p--;str();}else while(p<text.length&&!/[\t\n\r ,\]}]/.test(text[p]))p++;
  }value(0);ws();if(p!==text.length)fail('SNAPSHOT_JSON');return parsed;
}
export function inspectPayload(files) {
  const json=n=>strictJson(files.get(`src/content/${n}.json`));const seed=json('knowledge');
  const counts={};
  for(const type of ['drugs','disorders','cases','resources']) {
    const rows=seed[type];if(!Array.isArray(rows)||rows.length<({drugs:114,disorders:122,cases:122,resources:4}[type]))fail('SNAPSHOT_COUNT_DROP');
    const ids=rows.map(r=>r.id);if(ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)fail('SNAPSHOT_ID');counts[type]=rows.length;
  }
  const drugs=new Set(seed.drugs.map(x=>x.id)),disorders=new Set(seed.disorders.map(x=>x.id));
  if(seed.cases.some(x=>!disorders.has(x.disorderId))||seed.disorders.some(x=>(x.relatedDrugIds||[]).some(id=>!drugs.has(id))))fail('SNAPSHOT_REFERENCE');
  for(const [type,n] of [['drugs','drugProfiles'],['disorders','disorderProfiles'],['cases','caseProfiles']]) {
    const profiles=json(n),ids=new Set(seed[type].map(x=>x.id));
    if(!profiles||Array.isArray(profiles)||Object.keys(profiles).some(id=>!ids.has(id)))fail('SNAPSHOT_PROFILE_ID');
    counts[n]=Object.keys(profiles).length;
  }
  return {counts,seedSha256:sha256(JSON.stringify(seed)),orderedIdsSha256:sha256(JSON.stringify(Object.fromEntries(Object.entries(seed).map(([t,rs])=>[t,rs.map(x=>x.id)]))))};
}
export function createSnapshot(root) {
  const files=new Map(SNAPSHOT_FILES.map(p=>[p,readFileSync(safeFile(root,p))]));
  for(const b of files.values()){textBytes(b);if(b.includes(13))fail('SNAPSHOT_REQUIRES_LF');}
  const entries=[...files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha256(bytes)}));
  const digest=sha256(JSON.stringify(entries));
  return {files,manifest:{format:SNAPSHOT_FORMAT,version:`local-${digest.slice(0,20)}`,digest,
    publication:'local_migration_unreviewed',medicalApproval:'not_asserted',rightsApproval:'not_asserted',
    ...inspectPayload(files),files:entries}};
}
export function verifySnapshot(root,{expectedDigest}={}) {
  const manifestBytes=readFileSync(safeFile(root,'manifest.json'));const manifest=strictJson(manifestBytes);
  if(manifest.format!==SNAPSHOT_FORMAT||manifest.publication!=='local_migration_unreviewed'
    ||manifest.medicalApproval!=='not_asserted'||manifest.rightsApproval!=='not_asserted')fail('SNAPSHOT_SCOPE');
  if(!Array.isArray(manifest.files)||JSON.stringify(manifest.files.map(x=>x.path))!==JSON.stringify(SNAPSHOT_FILES))fail('SNAPSHOT_FILE_SET');
  const files=new Map();for(const e of manifest.files){const b=readFileSync(safeFile(root,e.path));textBytes(b);if(b.includes(13))fail('SNAPSHOT_REQUIRES_LF');
    if(e.bytes!==b.length||e.sha256!==sha256(b))fail('SNAPSHOT_HASH');files.set(e.path,b);}
  if(manifest.digest!==sha256(JSON.stringify(manifest.files))||manifest.version!==`local-${manifest.digest.slice(0,20)}`
    ||(expectedDigest&&manifest.digest!==expectedDigest))fail('SNAPSHOT_DIGEST');
  const payload=inspectPayload(files);
  for(const k of Object.keys(payload))if(JSON.stringify(payload[k])!==JSON.stringify(manifest[k]))fail('SNAPSHOT_SUMMARY');
  return {manifest,manifestSha256:sha256(manifestBytes),files};
}
