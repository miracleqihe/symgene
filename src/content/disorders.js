import profiles from './disorderProfiles.json' with { type: 'json' };
import original from './knowledge.json' with { type: 'json' };
import { attributedSections, overlayProfile } from './profileOverlay.js';
import { attributedSourceLinks } from './sourceLinks.js';

export const disorderFields = [
  ['summary', '介绍'], ['details', '如何理解'], ['symptoms', '常见体验'],
  ['patientPhrases', '可能这样描述'], ['courseClues', '病程线索'],
  ['functionalImpact', '生活影响'], ['assessment', '评估关注'],
  ['differentials', '需要鉴别'], ['treatmentOverview', '治疗与支持'],
  ['emergencySignals', '求助信号'],
];
const originals = new Map(original.disorders.map(item => [item.id, item]));
const arrayFields = new Set(disorderFields.slice(2).map(([field]) => field));

export function disorderFor(item) {
  return overlayProfile(item, originals.get(item.id), profiles[item.id], arrayFields);
}

export function attributedDisorderBody(item) {
  return attributedSections(disorderFor(item), disorderFields);
}

export function disorderLinks(item) {
  return attributedSourceLinks(profiles[item.id], disorderFor(item));
}
