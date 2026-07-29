export function createBlankEntry(type, data, now = new Date()) {
  if (type === 'drugs') {
    return {
      id: 'drug-' + now.getTime(),
      name: '',
      aliases: '',
      className: '待补充分类',
      indication: '',
      action: '',
      kinetics: '',
      interactions: '',
      contraindications: '',
      source: '待补充来源',
      updated: now.toISOString().slice(0, 10)
    };
  }
  if (type === 'disorders') {
    return {
      id: 'disorder-' + now.getTime(),
      name: '',
      aliases: [],
      category: '待分类',
      summary: '',
      details: '',
      symptoms: [],
      patientPhrases: [],
      courseClues: [],
      functionalImpact: [],
      assessment: [],
      differentials: [],
      treatmentOverview: [],
      emergencySignals: [],
      relatedDrugIds: [],
      source: '待补充来源'
    };
  }
  if (type === 'cases') {
    return {
      id: 'case-' + now.getTime(),
      disorderId: data.disorders[0]?.id || '',
      title: '',
      stage: '待整理',
      tags: [],
      summary: '',
      presentation: [],
      timeline: '',
      functionImpact: '',
      riskSignals: '',
      assessmentFocus: [],
      differentialClues: [],
      safetyNote: '',
      source: '待补充来源'
    };
  }
  return {
    id: 'resource-' + now.getTime(),
    kind: '网站',
    title: '',
    description: '',
    url: '',
    source: ''
  };
}
