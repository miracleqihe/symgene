import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLegacy } from './check-legacy.mjs';
import { verifyDependencyLock } from '../t02/check-repository.mjs';
import { checkContentPack } from '../t02/check-content-pack.mjs';
import { scanText } from '../../vendor/t02/src/scanner.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const BASE='42c4b5968e5423a8de22d4308b05660ae15e95fe';
const git=(...args)=>execFileSync('git',['-C',ROOT,...args],{encoding:'utf8',maxBuffer:24*1024*1024,stdio:['ignore','pipe','pipe']});
const nul=s=>s.split('\0').filter(Boolean);
const allowed=p=>['.gitignore','AGENTS.md','index.html','package.json','legacy-content.lock','src/main.jsx','src/data.js','src/styles.css',
  'src/styles/components.css','src/styles/editorial.css','tests/storage.test.mjs','tests/content-pack.test.mjs','tests/content-pack-overnight.test.mjs',
  'src/components/FactSlider.jsx','src/components/FrontierReviewsPage.jsx','src/components/visualization/DataAtlasPage.jsx',
  'src/components/AgentGuideEntry.jsx','src/components/KnowledgeReading.jsx','src/components/MedicalPoints.jsx',
  'src/styles/knowledge-reading.css','docs/architecture.md','docs/local-data.md','docs/content-pipeline.md',
  'scripts/check-build.mjs','scripts/audit-drug-coverage.mjs','scripts/audit-knowledge-coverage.mjs','scripts/build-teaching-materials.mjs',
  'src/comprehensiveKnowledge.js','src/drugSideEffects.js','src/expandedKnowledge.js','src/handbookDrugs.js','src/supplementalKnowledge.js'].includes(p)
  ||/^src\/content\/[A-Za-z]+\.(?:js|json)$/.test(p)
  ||/^scripts\/atlas\/[A-Za-z0-9.-]+$/.test(p)
  ||/^scripts\/local-content\/[a-z-]+\.mjs$/.test(p)
  ||/^tests\/[a-z-]+\.test\.mjs$/.test(p)
  ||/^tests\/ui\/(?:agent-guide|knowledge-reading|medical-points)\.test\.jsx$/.test(p)
  ||p==='tests/helpers/reparse-fixture.mjs'||p==='tests/fixtures/seed-v2.json'||p==='tests/fixtures/legacy-drug-side-effects.js'
  ||p==='vendor/local-content/legacy-snapshot.mjs'
  ||/^docs\/t02\/local-[a-z-]+\.md$/.test(p);
export async function checkSplit() {
  if(process.versions.node.split('.')[0]!=='22')throw new Error('NODE22_REQUIRED');
  git('merge-base','--is-ancestor',BASE,'HEAD');
  const paths=[...new Set([...nul(git('diff','--name-only','--no-renames','-z',BASE)),...nul(git('ls-files','--others','--exclude-standard','-z'))])].sort();
  const findings=[];let files=0;
  for(const p of paths) {
    if(!allowed(p))throw new Error('LOCAL_SPLIT_PATH_OUTSIDE_SCOPE:'+p);
    const full=resolve(ROOT,p);if(!existsSync(full))continue;
    if(p.startsWith('scripts/atlas/'))throw new Error('PRODUCER_REMAINED_IN_WEBSITE');
    if(lstatSync(full).isSymbolicLink()||!lstatSync(full).isFile())throw new Error('LOCAL_SPLIT_UNSAFE_FILE');
    const b=readFileSync(full);const text=new TextDecoder('utf-8',{fatal:true}).decode(b);if(b.includes(0))throw new Error('LOCAL_SPLIT_BINARY');
    findings.push(...scanText(text,p));files++;
  }
  if(findings.length)return {status:'REJECTED',findings};
  // Never relax the upstream authenticated contract or production selection in this migration.
  const protectedFiles=['content-pack.lock','src/content/adapter.js','src/search.js','src/validation/dataValidation.js',
    ...git('ls-tree','-r','--name-only',BASE,'src/storage','src/dev','vendor/t02').trim().split('\n').filter(Boolean)];
  for(const p of protectedFiles)if(!readFileSync(resolve(ROOT,p)).equals(execFileSync('git',['-C',ROOT,'show',`${BASE}:${p}`],{maxBuffer:24*1024*1024})))throw new Error('UPSTREAM_PROTECTED_BYTES_CHANGED:'+p);
  const dependencies=verifyDependencyLock(JSON.parse(readFileSync(resolve(ROOT,'package.json'))),JSON.parse(readFileSync(resolve(ROOT,'package-lock.json'))));
  return {status:'LOCAL_ENGINEERING_PASS',base:BASE,changedPaths:paths.length,scannedFiles:files,findings:[],
    content:checkLegacy(),t02:await checkContentPack(),protectedFilesUnchanged:protectedFiles.length,
    dependencyDeclarations:dependencies,pushReady:false,pushStatus:'PUSH_BLOCKED_USER_INSTRUCTION_AND_RIGHTS_REVIEW',
    dataHistory:'UNBORN_LOCAL_STAGING_NO_ORIGIN',scope:'local migration; no medical, rights or production acceptance'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const r=await checkSplit();console.log(JSON.stringify(r,null,2));if(r.status==='REJECTED')process.exitCode=1;}
  catch(e){console.error(JSON.stringify({status:'REJECTED',code:e.message}));process.exitCode=1;}
}
