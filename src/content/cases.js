import profiles from './caseProfiles.json' with { type: 'json' };
import original from './knowledge.json' with { type: 'json' };
import { attributedSections, overlayProfile } from './profileOverlay.js';
import { attributedSourceLinks } from './sourceLinks.js';

const originals = new Map(original.cases.map(item => [item.id, item]));
const arrayFields = new Set(['presentation', 'assessmentFocus', 'differentialClues']);
export const caseFields = [['summary','案例摘要'], ['presentation','表现'], ['timeline','时间线'],
  ['functionImpact','生活影响'], ['assessmentFocus','评估时还需要了解'], ['differentialClues','还有哪些可能'],
  ['riskSignals','需要及时留意的变化'], ['safetyNote','求助与支持'],
  ['conversation','陪伴者可以怎样开口'], ['reflection','一起想想']];

export function caseFor(item) {
  return overlayProfile(item, originals.get(item.id), profiles[item.id], arrayFields);
}

export function attributedCaseBody(item) {
  return attributedSections(caseFor(item), caseFields);
}

export function caseLinks(item) {
  return attributedSourceLinks(profiles[item.id], caseFor(item));
}
