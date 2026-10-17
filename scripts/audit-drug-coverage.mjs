import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { auditDrugProfiles } from '../src/content/profileAudit.js';
import { auditRegionalCoverage } from '../src/content/regionalAudit.js';

const knowledge = JSON.parse(await readFile(new URL('../src/content/knowledge.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(await readFile(new URL('../src/content/drugProfiles.json', import.meta.url), 'utf8'));
const report = auditDrugProfiles(knowledge.drugs, profiles);
report.regionalCoverage = auditRegionalCoverage(knowledge.drugs, profiles);
const target = new URL('../work/content-review/drug-completion/coverage.json', import.meta.url);
await mkdir(new URL('./', target), { recursive: true });
await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ total: report.total, supplements: report.supplements,
  structurallyComplete: report.structurallyComplete, allStructurallyComplete: report.allStructurallyComplete,
  regionalMetadataComplete: report.regionalCoverage.metadataComplete, chineseProductVerified: report.regionalCoverage.chineseProductVerified,
  unknownProfileIds: report.unknownProfileIds }));
if (report.unknownProfileIds.length || (process.argv.includes('--require-complete') && (!report.allStructurallyComplete || !report.regionalCoverage.allMetadataComplete))) process.exitCode = 1;
