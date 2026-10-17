export function sourceReadingLink(source) {
  const label = source.kind === 'label' || /-(?:us|cn)-label$/.test(source.id);
  const region = (source.publicRegion || source.region || '').split(/[；;]/, 1)[0].trim();
  const language = source.language
    ? source.language.startsWith('zh') ? '中文' : source.language.startsWith('en') ? '英文' : source.language
    : /美国|英国|加拿大|澳大利亚|爱尔兰/.test(source.region) ? '英文' : '';
  const note = label
    ? `${source.updated ? `说明书修订日期：${source.updated}。` : ''}阅读时请核对具体产品和剂型。`
    : source.updated
      ? `资料版本：${source.updated}`
      : source.lastReviewed ? `资料审阅：${source.lastReviewed}` : '';
  return { title: source.title, url: source.url, region: [region, language].filter(Boolean).join(' · '), note };
}

export function attributedSourceLinks(profile, display) {
  const sourceIds = new Set([...Object.values(display.fieldSources || {}).flat(),
    ...Object.values(display.fieldAmendments || {}).flatMap(group => group.sources)].map(source => source.id));
  return (profile?.sources || []).filter(source => source.url && sourceIds.has(source.id))
    .sort((a, b) => Number(/中国大陆/.test(b.region)) - Number(/中国大陆/.test(a.region)))
    .map(sourceReadingLink);
}
