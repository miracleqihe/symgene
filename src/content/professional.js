import profiles from './drugProfiles.json' with { type: 'json' };
import original from './knowledge.json' with { type: 'json' };
import { attributedSections, overlayProfile } from './profileOverlay.js';
import { attributedSourceLinks } from './sourceLinks.js';
export { sourceReadingLink } from './sourceLinks.js';

const originalDrugs = new Map(original.drugs.map(item => [item.id,item]));

export const professionalFields = [
  ['indication','用途'], ['action','作用'], ['kinetics','药代动力学'],
  ['interactions','药物联用'], ['sideEffects','副作用'],
  ['contraindications','禁忌与警示'], ['specialPopulations','特殊人群'],
  ['monitoring','复诊与监测'],
];

// Return only actually attributed material. The reading pack separately includes
// all displayed text; local edits never inherit the supplement's sources.
export function attributedTeachingBody(item) {
  return attributedSections(professionalFor(item), professionalFields);
}

export function professionalFor(item) {
  return overlayProfile(item, originalDrugs.get(item.id), profiles[item.id]);
}

// A partial amendment sources only its matched semantic point, never the field.
export function pointPublicReferences(display, field, pointIndex) {
  const evidence = display.fieldEvidence?.[field] || display.fieldAmendments?.[field]?.mappedEvidence || [];
  const references = evidence.filter(point => point.pointIndex === pointIndex)
    .flatMap(point => point.sources || []).filter(source => source.url?.startsWith('https://'));
  return [...new Map(references.map(source => [`${source.id}|${source.locator}|${source.url}`, source])).values()];
}

export function professionalLinks(item) {
  return attributedSourceLinks(profiles[item.id], professionalFor(item));
}
