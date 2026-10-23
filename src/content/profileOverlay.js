import { resolveProfileAmendments } from './profileAmendments.js';

export function overlayProfile(item, base, profile, arrayFields = new Set()) {
  if (!profile) return item;
  const result = { ...item, fieldSources: {}, fieldEvidence: {} };
  for (const [field, value] of Object.entries(profile.fields || {})) {
    const sameAsBase = Array.isArray(item[field]) || Array.isArray(base?.[field])
      ? JSON.stringify(item[field]) === JSON.stringify(base?.[field])
      : item[field] === base?.[field];
    // Explicitly empty strings or arrays are real local edits too.
    if (item[field] !== undefined && !sameAsBase) continue;
    result[field] = arrayFields.has(field) ? value.text.split(/\r?\n/).filter(Boolean) : value.text;
    const resolve = descriptor => (descriptor.refs || []).map(id => {
      const source = profile.sources.find(source => source.id === id);
      return { ...source, locator: descriptor.locations?.[id] || source?.locator };
    });
    result.fieldSources[field] = resolve(value);
    result.fieldEvidence[field] = (value.evidence || []).map(point => ({ pointIndex: point.pointIndex,
      scope: point.scope, sources: resolve(point) }));
  }
  const amendments = resolveProfileAmendments(base, profile);
  for (const [field, group] of Object.entries(amendments)) {
    if (item[field] !== undefined && item[field] !== base[field]) continue;
    result[field] = group.text;
    result.fieldAmendments ||= {};
    result.fieldAmendments[field] = group;
  }
  return result;
}

export function attributedSections(display, fields) {
  return fields.flatMap(([field, label]) => {
    if (display.fieldSources?.[field]?.length) return [{ label, text: Array.isArray(display[field]) ? display[field].join('\n') : display[field],
      sources: display.fieldSources[field], evidence: display.fieldEvidence?.[field] || [] }];
    const group = display.fieldAmendments?.[field];
    return group ? [{ label, text: group.parts.map(part => part.text).filter(Boolean).join('\n'),
      sources: group.sources, evidence: group.mappedEvidence, partial: true }] : [];
  });
}
