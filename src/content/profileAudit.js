import { medicalPoints } from './medicalText.js';
import { resolveProfileAmendments } from './profileAmendments.js';

const fields = ['indication', 'action', 'kinetics', 'interactions', 'sideEffects', 'contraindications', 'specialPopulations', 'monitoring'];
const scopes = new Set(['drug', 'class', 'explanation', 'communication']);

// Structural coverage is a necessary check, not a medical completeness verdict.
export function auditDrugProfiles(drugs, profiles) {
  const entries = drugs.map(drug => {
    const profile = profiles[drug.id];
    const sources = new Map((profile?.sources || []).map(source => [source.id, source]));
    const problems = [];
    let characters = 0;
    let pointCount = 0;
    let amendments = {};
    try { amendments = resolveProfileAmendments(drug, profile); }
    catch (error) { problems.push({ problem: 'invalid_amendment', message: error.message }); }
    for (const field of fields) {
      const group = amendments[field];
      const value = profile?.fields?.[field] || (group && { text: group.text,
        refs: [...new Set(group.sources.map(source => source.id))],
        locations: Object.fromEntries(group.sources.map(source => [source.id, source.locator])),
        evidence: group.mappedEvidence });
      if (!value?.text?.trim()) { problems.push({ field, problem: 'missing_supplement_field' }); continue; }
      characters += value.text.length;
      const points = medicalPoints(value.text);
      pointCount += points.length;
      if (/\{\{FILL:|TODO|待核问题/.test(value.text)) problems.push({ field, problem: 'unfilled_content' });
      if (!value.refs?.length) problems.push({ field, problem: 'missing_field_sources' });
      for (const ref of value.refs || []) {
        const source = sources.get(ref);
        if (!source || !(value.locations?.[ref] || source.locator)) problems.push({ field, problem: 'unresolvable_field_source', ref });
      }
      const evidence = value.evidence || [];
      for (let index = 0; index < points.length; index++) {
        const matches = evidence.filter(item => item.pointIndex === index);
        if (matches.length !== 1) { problems.push({ field, pointIndex: index, problem: 'missing_or_duplicate_point_evidence' }); continue; }
        const item = matches[0];
        if (!scopes.has(item.scope)) problems.push({ field, pointIndex: index, problem: 'invalid_evidence_scope' });
        if (!item.refs?.length) problems.push({ field, pointIndex: index, problem: 'missing_point_sources' });
        for (const ref of item.refs || []) {
          if (!sources.has(ref) || !(item.locations?.[ref] || sources.get(ref)?.locator)) problems.push({ field, pointIndex: index, problem: 'unresolvable_point_source', ref });
        }
      }
      for (const item of evidence) if (!Number.isInteger(item.pointIndex) || item.pointIndex < 0 || item.pointIndex >= points.length) {
        problems.push({ field, problem: 'evidence_outside_body' });
      }
    }
    return { id: drug.id, name: drug.name, hasSupplement: !!profile, characters, pointCount,
      structurallyComplete: problems.length === 0, problems };
  });
  const known = new Set(drugs.map(drug => drug.id));
  return { total: drugs.length, supplements: entries.filter(entry => entry.hasSupplement).length,
    structurallyComplete: entries.filter(entry => entry.structurallyComplete).length,
    allStructurallyComplete: entries.every(entry => entry.structurallyComplete),
    unknownProfileIds: Object.keys(profiles).filter(id => !known.has(id)), entries,
    note: 'This checks eight fields and source pointers. It does not certify clinical correctness, editorial review or comprehensive coverage.' };
}
