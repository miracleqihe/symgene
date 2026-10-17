import { medicalPoints } from './medicalText.js';

export const amendableFields = ['indication', 'action', 'kinetics', 'interactions', 'sideEffects', 'contraindications', 'specialPopulations', 'monitoring'];
const scopes = new Set(['drug', 'class', 'explanation', 'communication']);
const occurrences = (text, fragment) => text.split(fragment).length - 1;

// Exact, reviewed corrections preserve the canonical manuscript. No fuzzy matching.
export function resolveProfileAmendments(base, profile) {
  const result = {};
  if (profile?.amendments === undefined && profile?.retainedEvidence === undefined) return result;
  if ((profile.amendments !== undefined && !Array.isArray(profile.amendments))
    || (profile.retainedEvidence !== undefined && !Array.isArray(profile.retainedEvidence))) throw Error('Invalid amendment list');
  const sources = new Map((profile.sources || []).map(source => [source.id, source]));
  const resolve = descriptor => {
    if (!Array.isArray(descriptor.refs) || !descriptor.refs.length) throw Error('Amendment evidence has no sources');
    return descriptor.refs.map(id => {
      const source = sources.get(id);
      const locator = descriptor.locations?.[id] || source?.locator;
      if (!source || !locator) throw Error('Unresolvable amendment source');
      return { ...source, locator };
    });
  };
  const groupFor = field => {
    if (!amendableFields.includes(field) || typeof base?.[field] !== 'string') throw Error('Invalid amendment field');
    if (profile.fields?.[field]) throw Error('A field cannot be replaced and amended together');
    return result[field] ||= { text: base[field], parts: [], sources: [], mappedEvidence: [], originalRanges: [] };
  };
  for (const amendment of profile.amendments || []) {
    const group = groupFor(amendment.field);
    const original = amendment.originalText;
    const replacement = amendment.replacement;
    if (typeof original !== 'string' || !original || !amendment.reason?.trim()
      || typeof replacement?.text !== 'string') throw Error('Incomplete amendment');
    if (occurrences(base[amendment.field], original) !== 1 || occurrences(group.text, original) !== 1) throw Error('Amendment target missing, ambiguous or overlapping');
    const start = base[amendment.field].indexOf(original);
    const end = start + original.length;
    if (group.originalRanges.some(range => start < range.end && end > range.start)) throw Error('Overlapping original amendment targets');
    group.originalRanges.push({ start, end });
    const fieldSources = resolve(replacement);
    const points = medicalPoints(replacement.text);
    const evidence = replacement.evidence ?? [];
    if (!Array.isArray(evidence)) throw Error('Invalid amendment point evidence');
    if (evidence.length !== points.length) throw Error('Amendment point evidence incomplete');
    for (let index = 0; index < points.length; index++) {
      const matches = evidence.filter(point => point.pointIndex === index);
      if (matches.length !== 1 || !scopes.has(matches[0].scope)) throw Error('Invalid amendment point evidence');
      group.sources.push(...resolve(matches[0]));
    }
    group.text = group.text.replace(original, () => replacement.text);
    group.sources.push(...fieldSources);
    group.parts.push({ text: replacement.text, evidence: evidence.map(point => ({ ...point, sources: resolve(point) })) });
  }
  for (const retained of profile.retainedEvidence || []) {
    const group = groupFor(retained.field);
    const points = medicalPoints(retained.originalText);
    if (!retained.originalText || occurrences(base[retained.field], retained.originalText) !== 1
      || occurrences(group.text, retained.originalText) !== 1 || points.length !== 1
      || !scopes.has(retained.scope)) throw Error('Invalid retained evidence target');
    const start = base[retained.field].indexOf(retained.originalText);
    const end = start + retained.originalText.length;
    if (group.originalRanges.some(range => start < range.end && end > range.start)) throw Error('Retained evidence overlaps a corrected original target');
    const resolved = resolve(retained);
    group.sources.push(...resolved);
    group.parts.push({ text: retained.originalText, evidence: [{ ...retained, pointIndex: 0, sources: resolved }] });
  }
  for (const group of Object.values(result)) {
    const finalPoints = medicalPoints(group.text);
    for (const part of group.parts) for (const point of part.evidence) {
      const text = medicalPoints(part.text)[point.pointIndex];
      const indexes = finalPoints.flatMap((candidate, index) => candidate === text ? [index] : []);
      // A phrase inside an unreviewed point does not source the whole point.
      if (indexes.length === 1) group.mappedEvidence.push({ ...point, pointIndex: indexes[0] });
    }
  }
  return result;
}
