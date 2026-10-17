import { mkdir, writeFile } from 'node:fs/promises';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import drugProfiles from '../src/content/drugProfiles.json' with { type: 'json' };
import disorderProfiles from '../src/content/disorderProfiles.json' with { type: 'json' };
import caseProfiles from '../src/content/caseProfiles.json' with { type: 'json' };
import { auditDrugProfiles } from '../src/content/profileAudit.js';
import { auditRegionalCoverage } from '../src/content/regionalAudit.js';
import { auditReadingProfiles } from '../src/content/readingProfileAudit.js';

const report = {
  drugs: auditDrugProfiles(knowledge.drugs, drugProfiles),
  drugRegionalCoverage: auditRegionalCoverage(knowledge.drugs, drugProfiles),
  disorders: auditReadingProfiles(knowledge.disorders, disorderProfiles, 'disorders'),
  cases: auditReadingProfiles(knowledge.cases, caseProfiles, 'cases'),
};
const types = ['drugs', 'disorders', 'cases'];
report.allStructurallyComplete = types.every(type => report[type].allStructurallyComplete
  && report[type].unknownProfileIds.length === 0) && report.drugRegionalCoverage.allMetadataComplete;
report.note = 'Internal structural coverage only. Actual medical/source review and final language review must be checked in their saved editorial records before acceptance.';
const target = new URL('../work/content-review/knowledge-coverage.json', import.meta.url);
await mkdir(new URL('./', target), { recursive: true });
await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(Object.fromEntries(types.map(type => [type, {
  total: report[type].total, supplements: report[type].supplements,
  structurallyComplete: report[type].structurallyComplete,
  unknownProfileIds: report[type].unknownProfileIds,
}]))));
if (types.some(type => report[type].unknownProfileIds.length)
  || (process.argv.includes('--require-complete') && !report.allStructurallyComplete)) process.exitCode = 1;
