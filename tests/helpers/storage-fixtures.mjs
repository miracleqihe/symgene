export class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.failSet = false;
    this.failRemove = false;
  }

  get length() {
    return this.values.size;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key) {
    if (this.failRemove) throw new Error('remove denied');
    this.values.delete(String(key));
  }

  setItem(key, value) {
    if (this.failSet) throw new Error('write denied');
    this.values.set(String(key), String(value));
  }
}

export function makeSeed() {
  return {
    drugs: [
      { id: 'drug-core', name: '核心药物', className: '测试分类', source: '公开测试来源' },
      { id: 'drug-extra', name: '备用药物', className: '测试分类', source: '公开测试来源' }
    ],
    disorders: [
      {
        id: 'disorder-core',
        name: '核心疾病',
        category: '测试分类',
        summary: '核心疾病公开摘要。',
        source: '公开测试来源',
        relatedDrugIds: ['drug-core']
      },
      {
        id: 'disorder-extra',
        name: '备用疾病',
        category: '测试分类',
        summary: '备用疾病公开摘要。',
        source: '公开测试来源',
        relatedDrugIds: []
      }
    ],
    cases: [
      {
        id: 'case-core',
        disorderId: 'disorder-core',
        title: '核心案例',
        summary: '核心案例公开摘要。',
        source: '公开测试来源'
      },
      {
        id: 'case-extra',
        disorderId: 'disorder-core',
        title: '备用案例',
        summary: '备用案例公开摘要。',
        source: '公开测试来源'
      }
    ],
    resources: [
      { id: 'resource-core', title: '核心资源', url: 'https://example.com/core' },
      { id: 'resource-extra', title: '备用资源', url: 'https://example.com/extra' }
    ]
  };
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function makeLegacy(data = makeSeed()) {
  return {
    meta: { version: 10 },
    ...clone(data)
  };
}

export function customEntry(type) {
  if (type === 'drugs') {
    return { id: 'drug-custom', name: '自定义药物', className: '自定义分类', source: '用户本地内容' };
  }
  if (type === 'disorders') {
    return {
      id: 'disorder-custom',
      name: '自定义疾病',
      category: '自定义分类',
      summary: '自定义摘要。',
      source: '用户本地内容',
      relatedDrugIds: []
    };
  }
  if (type === 'cases') {
    return {
      id: 'case-custom',
      disorderId: 'disorder-core',
      title: '自定义案例',
      summary: '自定义案例摘要。',
      source: '用户本地内容'
    };
  }
  return {
    id: 'resource-custom',
    title: '自定义资源',
    url: 'https://example.com/custom'
  };
}
