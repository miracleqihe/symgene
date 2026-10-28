import { medicalPoints } from './medicalText.js';
import { disorderFields } from './disorders.js';
import { caseFields } from './cases.js';

const sha256 = /^[a-f0-9]{64}$/i;
const configurations = {
  disorders: { fields: disorderFields, scopes: new Set(['disorder', 'class', 'explanation', 'communication']),
    requiredSource: source => source.format === 'epub', sourceProblem: 'missing_used_epub_source' },
  cases: { fields: caseFields, scopes: new Set(['disorder', 'class', 'fiction', 'explanation', 'communication']),
    requiredSource: source => source.kind === 'casebook', sourceProblem: 'missing_used_casebook_source' },
};
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const refsFor = value => Array.isArray(value?.refs) ? value.refs : [];

// A source pointer proves traceability, not the truth or completeness of prose.
// Medical and language review remain separate, recorded editorial work.
export function auditReadingProfiles(items, profiles, type) {
  const config = configurations[type];
  if (!config) throw new Error(`Unsupported reading profile type: ${type}`);
  const fields = new Set(config.fields.map(([field]) => field));
  const entries = items.map(item => {
    const profile = profiles[item.id];
    const problems = [];
    const sourceList = Array.isArray(profile?.sources) ? profile.sources : [];
    const sources = new Map(sourceList.map(source => [source.id, source]));
    if (sourceList.length !== sources.size) problems.push({ problem: 'duplicate_source_id' });
    for (const field of Object.keys(profile?.fields || {})) {
      if (!fields.has(field)) problems.push({ field, problem: 'unknown_profile_field' });
    }
    const usedSources = new Set();
    let characters = 0;
    let pointCount = 0;
    for (const [field] of config.fields) {
      const value = profile?.fields?.[field];
      if (!nonempty(value?.text)) { problems.push({ field, problem: 'missing_supplement_field' }); continue; }
      characters += value.text.length;
      const points = medicalPoints(value.text);
      pointCount += points.length;
      if (/\{\{FILL:|TODO|待核问题|本篇未展开此项/.test(value.text)) problems.push({ field, problem: 'unfilled_content' });
      const checkRefs = (descriptor, pointIndex) => {
        const refs = refsFor(descriptor);
        if (!refs.length) problems.push({ field, pointIndex, problem: 'missing_sources' });
        for (const ref of refs) {
          const source = sources.get(ref);
          const locator = descriptor.locations?.[ref] || source?.locator;
          if (!source || !nonempty(source.title) || !nonempty(locator)) problems.push({ field, pointIndex, ref, problem: 'unresolvable_source' });
          else if (pointIndex !== undefined) usedSources.add(ref);
        }
      };
      checkRefs(value);
      const evidence = Array.isArray(value.evidence) ? value.evidence : [];
      if (!Array.isArray(value.evidence)) problems.push({ field, problem: 'invalid_point_evidence' });
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const matches = evidence.filter(point => point?.pointIndex === pointIndex);
        if (matches.length !== 1) { problems.push({ field, pointIndex, problem: 'missing_or_duplicate_point_evidence' }); continue; }
        const point = matches[0];
        if (!config.scopes.has(point.scope)) problems.push({ field, pointIndex, problem: 'invalid_evidence_scope' });
        checkRefs(point, pointIndex);
      }
      for (const point of evidence) {
        if (!Number.isInteger(point?.pointIndex) || point.pointIndex < 0 || point.pointIndex >= points.length) {
          problems.push({ field, problem: 'evidence_outside_body' });
        }
      }
    }
    const used = [...usedSources].map(id => sources.get(id));
    const hasRequiredBook = used.some(source => config.requiredSource(source)
      && sha256.test(source.sourceRevision || '') && nonempty(source.title));
    if (!hasRequiredBook) problems.push({ problem: config.sourceProblem });
    const hasChineseReference = used.some(source => /^中国大陆/.test(source.region || '')
      && !['fiction', 'textbook', 'casebook'].includes(source.kind)
      && (source.url?.startsWith('https://') || sha256.test(source.sourceRevision || '')));
    if (!hasChineseReference) problems.push({ problem: 'missing_used_chinese_reference' });
    if (type === 'cases') {
      const summary = profile?.fields?.summary;
      const summaryEvidence = Array.isArray(summary?.evidence) ? summary.evidence : [];
      const fictionRefs = summaryEvidence.flatMap(point => refsFor(point)).filter(ref => sources.get(ref)?.kind === 'fiction');
      if (!/虚构/.test(summary?.text || '') || !fictionRefs.length) problems.push({ problem: 'missing_fictional_case_identity' });
    }
    return { id: item.id, name: item.name || item.title, hasSupplement: !!profile, characters, pointCount,
      usedSourceIds: [...usedSources], hasRequiredBook, hasChineseReference,
      structurallyComplete: problems.length === 0, problems };
  });
  const known = new Set(items.map(item => item.id));
  return { total: items.length, supplements: entries.filter(entry => entry.hasSupplement).length,
    structurallyComplete: entries.filter(entry => entry.structurallyComplete).length,
    allStructurallyComplete: entries.every(entry => entry.structurallyComplete),
    unknownProfileIds: Object.keys(profiles).filter(id => !known.has(id)), entries,
    note: 'Checks fields, point-level source pointers, use of the designated local book and Chinese references. Does not certify clinical correctness, editorial review or comprehensive coverage.' };
}
