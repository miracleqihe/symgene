import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_SPECS = {
  xhs: {
    contents: {
      id: 'note_id', contentId: 'note_id', timestamp: ['last_modify_ts', 'last_update_time', 'time'],
      text: ['title', 'desc'],
      engagement: { liked: 'liked_count', collected: 'collected_count', comments: 'comment_count', shares: 'share_count' }
    },
    comments: {
      id: 'comment_id', contentId: 'note_id', parentId: 'parent_comment_id',
      timestamp: ['last_modify_ts', 'create_time'], text: ['content'], engagement: { liked: 'like_count' }
    }
  },
  douyin: {
    contents: {
      id: 'aweme_id', contentId: 'aweme_id', timestamp: ['last_modify_ts', 'create_time'],
      text: ['title', 'desc'],
      engagement: { liked: 'liked_count', collected: 'collected_count', comments: 'comment_count', shares: 'share_count' }
    },
    comments: {
      id: 'comment_id', contentId: 'aweme_id', parentId: 'parent_comment_id',
      timestamp: ['last_modify_ts', 'create_time'], text: ['content'], engagement: { liked: 'like_count' }
    }
  },
  zhihu: {
    contents: {
      id: 'content_id', contentId: 'content_id', timestamp: ['last_modify_ts', 'updated_time', 'created_time'],
      text: ['title', 'desc', 'content_text'], engagement: { liked: 'voteup_count', comments: 'comment_count' }
    },
    comments: {
      id: 'comment_id', contentId: 'content_id', parentId: 'parent_comment_id',
      timestamp: ['last_modify_ts', 'publish_time'], text: ['content'],
      engagement: { liked: 'like_count', disliked: 'dislike_count' }
    }
  }
};

const CLI_FLAGS = {
  '--xhs-contents': ['xhs', 'contents'],
  '--xhs-comments': ['xhs', 'comments'],
  '--douyin-contents': ['douyin', 'contents'],
  '--douyin-comments': ['douyin', 'comments'],
  '--zhihu-contents': ['zhihu', 'contents'],
  '--zhihu-comments': ['zhihu', 'comments']
};

const INSTITUTION_ALIASES = {
  '北大六院': '北京大学第六医院', '北医六院': '北京大学第六医院',
  '安定医院': '北京安定医院', '回龙观医院': '北京回龙观医院',
  '上海精卫中心': '上海市精神卫生中心', '上海精卫': '上海市精神卫生中心',
  '宛平南路600号': '上海市精神卫生中心', '广州脑科医院': '广州医科大学附属脑科医院',
  '惠爱医院': '广州医科大学附属脑科医院', '杭州七院': '杭州市第七人民医院',
  '深圳康宁': '深圳市康宁医院', '天津安定': '天津市安定医院',
  '成都四院': '成都市第四人民医院', '武汉精卫': '武汉市精神卫生中心',
  '仙岳医院': '厦门市仙岳医院', '合肥四院': '合肥市第四人民医院'
};

const GENERIC_INSTITUTION_NAME = /^(精神科|心理科|心理咨询|心理门诊|精神病院|精神卫生中心|心理健康中心|心理咨询中心|心理治疗所|心理咨询所)$/;
const GENERIC_INSTITUTION_NAMES = new Set([
  '精神病医院', '精神康复中心', '心理咨询室', '心理服务', '睡眠医学中心'
]);
const FIRST_PERSON = /(我|本人|我们|我家|家人|孩子|父母|对象|朋友).{0,12}(去|在|到|看|挂|问|做|住|咨询|复诊|就诊|陪)/;
const SERVICE_EXPERIENCE = /(挂号|预约|排队|候诊|就诊|看病|复诊|门诊|住院|医生|护士|心理师|咨询师|收费|费用|价格|环境|隐私|态度|流程|开药|检查|量表|交通)/;

const FLAG_PATTERNS = {
  high_risk_personal_disclosure: /(自杀|轻生|自残|自伤|割腕|吞药|跳楼|不想活|活不下去|伤人|杀人)/,
  abusive_or_dehumanizing_language: /(疯子|神经病|垃圾|畜生|去死|滚开|恶心死了|低等人)/,
  public_affairs_or_identity_sensitive: /(政治|意识形态|共产党|国民党|两岸|台独|统一台湾|民族主义|地域黑|种族|宗教仇恨)/,
  advertising_or_solicitation: /(加微信|加微|私信我|代挂号|黄牛|优惠券|团购|课程报名|招生|引流)/,
  medical_claim_or_advice: /(确诊|诊断为|处方|剂量|停药|换药|加药|减药|误诊|治愈|根治)/
};

const ASPECT_PATTERNS = {
  access_and_wait: /(挂号|预约|排队|候诊|号源|复诊|转诊|交通)/,
  cost_and_billing: /(收费|费用|价格|挂号费|检查费|报销|医保|贵|便宜)/,
  staff_interaction: /(医生|护士|心理师|咨询师|态度|耐心|沟通|敷衍|尊重)/,
  process_and_information: /(流程|检查|量表|开药|取药|告知|说明|隐私|保密)/,
  environment_and_facilities: /(环境|病房|诊室|卫生|拥挤|安静|设施)/,
  continuity_and_follow_up: /(复诊|随访|转介|转诊|连续|长期|中断)/,
  self_reported_outcome: /(有效|缓解|改善|没用|无效|副作用|不舒服|加重|康复)/
};

const POSITIVE_TERMS = /(专业|耐心|温柔|尊重|清楚|方便|顺利|靠谱|负责|细致|有帮助|缓解|改善|推荐|满意)/g;
const NEGATIVE_TERMS = /(冷漠|敷衍|难挂|挂不上|排队久|太贵|后悔|投诉|误诊|失望|折腾|糟糕|不尊重|泄露隐私)/g;

const hash = (value) => createHash('sha256').update(value).digest('hex');

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  const numeric = number(value);
  if (numeric > 0) return numeric;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

const sourceTimestamp = (row, fields) => Math.max(...fields.map((field) => timestamp(row[field])), 0);

function joinText(row, fields) {
  const seen = new Set();
  const parts = [];
  for (const field of fields) {
    const value = String(row[field] ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    parts.push(value);
  }
  return parts.join('\n');
}

function cleanAndRedact(input) {
  let text = String(input ?? '').normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
  let replacements = 0;
  const replace = (pattern, token) => {
    text = text.replace(pattern, () => { replacements += 1; return token; });
  };
  replace(/https?:\/\/[^\s]+/gi, '[URL]');
  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
  replace(/(?<!\d)\d{17}[0-9Xx](?!\d)/g, '[ID]');
  replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[PHONE]');
  replace(/(?:微信|V信|VX|QQ|扣扣)\s*(?:号|:|：)?\s*[A-Za-z0-9_-]{5,}/gi, '[CONTACT]');
  replace(/@[\p{L}\p{N}_-]{2,}/gu, '[@USER]');
  return { text, replacements };
}

function buildInstitutionMatchers(institutions) {
  const byName = new Map(institutions.map((institution) => [institution.name, institution]));
  const matchers = institutions
    .filter((institution) => institution?.name
      && !GENERIC_INSTITUTION_NAME.test(institution.name)
      && !GENERIC_INSTITUTION_NAMES.has(institution.name))
    .map((institution) => ({ value: institution.name, institution }));
  for (const [alias, canonical] of Object.entries(INSTITUTION_ALIASES)) {
    const institution = byName.get(canonical)
      ?? institutions.find((item) => item.name.includes(canonical) || canonical.includes(item.name));
    if (institution) matchers.push({ value: alias, institution });
  }
  return matchers.sort((a, b) => b.value.length - a.value.length);
}

function matchInstitutions(text, matchers) {
  const matches = new Map();
  for (const matcher of matchers) {
    if (text.includes(matcher.value)) matches.set(matcher.institution.id, matcher.institution);
  }
  return [...matches.values()];
}

function readJsonl(filePath, platform, kind) {
  const buffer = readFileSync(filePath);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const lines = [];
  const quarantine = [];
  const rawLines = [];
  let start = 0;
  let physicalLine = 0;
  for (let index = 0; index <= buffer.length; index += 1) {
    if (index !== buffer.length && buffer[index] !== 10) continue;
    physicalLine += 1;
    let raw = buffer.subarray(start, index);
    start = index + 1;
    if (raw.at(-1) === 13) raw = raw.subarray(0, -1);
    if (raw.length) rawLines.push({ bytes: raw, line: physicalLine });
  }
  for (const { bytes, line } of rawLines) {
    let text;
    try {
      text = decoder.decode(bytes);
    } catch {
      quarantine.push({ platform, kind, line, reason: 'invalid_utf8', byteLength: bytes.length, sha256: hash(bytes) });
      continue;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
      lines.push({ row: parsed, line });
    } catch (error) {
      quarantine.push({
        platform, kind, line, reason: error?.message === 'not_object' ? 'not_object' : 'invalid_json',
        byteLength: bytes.length, sha256: hash(bytes)
      });
    }
  }
  return { lines, quarantine, sha256: hash(buffer), totalBytes: buffer.length, physicalLines: rawLines.length };
}

function normalizeRow(platform, kind, row, line, spec) {
  const rawId = String(row[spec.id] ?? '').trim();
  if (!rawId) return { error: 'missing_id' };
  const rawContentId = String(row[spec.contentId] ?? '').trim();
  const rawParentId = spec.parentId ? String(row[spec.parentId] ?? '').trim() : '';
  const { text, replacements } = cleanAndRedact(joinText(row, spec.text));
  const flags = [];
  if (replacements > 0) flags.push('direct_identifier_redacted');
  for (const [flag, pattern] of Object.entries(FLAG_PATTERNS)) if (pattern.test(text)) flags.push(flag);
  if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 4) flags.push('low_information');
  const engagement = {};
  for (const [name, field] of Object.entries(spec.engagement ?? {})) engagement[name] = number(row[field]);
  return {
    platform, kind,
    recordId: `r_${hash(`${platform}:${kind}:${rawId}`).slice(0, 24)}`,
    contentRef: rawContentId ? `r_${hash(`${platform}:contents:${rawContentId}`).slice(0, 24)}` : null,
    parentRef: rawParentId && rawParentId !== '0' ? `r_${hash(`${platform}:comments:${rawParentId}`).slice(0, 24)}` : null,
    sourceLine: line,
    sourceTimestamp: sourceTimestamp(row, spec.timestamp),
    cleanedText: text,
    textHash: text.length >= 12 ? hash(text) : null,
    flags,
    engagement
  };
}

function annotateRecords(records, institutions) {
  const matchers = buildInstitutionMatchers(institutions);
  const contents = new Map(records.filter((record) => record.kind === 'contents').map((record) => [record.recordId, record]));
  for (const record of records) {
    // Only text supplied by the author can establish a direct match. Search
    // keywords are intentionally excluded because they describe the crawl,
    // not necessarily the record.
    const direct = matchInstitutions(record.cleanedText, matchers);
    record.entityMatches = direct.map((institution) => ({ id: institution.id, name: institution.name }));
    record.entityMatchMethod = direct.length === 1 ? 'direct' : direct.length > 1 ? 'ambiguous' : null;
    if (direct.length === 0 && record.kind === 'comments') {
      const parentContent = contents.get(record.contentRef);
      if (parentContent?.entityMatches?.length === 1) {
        record.entityMatches = parentContent.entityMatches;
        record.entityMatchMethod = 'content_context';
      }
    }
    if (record.entityMatches.length > 1) record.flags.push('ambiguous_institution_match');
    if (record.entityMatches.length === 0) record.flags.push('no_institution_match');
    record.serviceExperience = FIRST_PERSON.test(record.cleanedText) && SERVICE_EXPERIENCE.test(record.cleanedText);
    if (!record.serviceExperience) record.flags.push('not_first_person_service_experience');
    record.aspects = Object.entries(ASPECT_PATTERNS).filter(([, pattern]) => pattern.test(record.cleanedText)).map(([name]) => name);
    const positive = [...record.cleanedText.matchAll(POSITIVE_TERMS)].length;
    const negative = [...record.cleanedText.matchAll(NEGATIVE_TERMS)].length;
    record.sentiment = positive === negative ? 'mixed_or_unclear' : positive > negative ? 'positive' : 'negative';
    const reviewFlags = new Set([
      'direct_identifier_redacted', 'high_risk_personal_disclosure', 'abusive_or_dehumanizing_language',
      'public_affairs_or_identity_sensitive', 'advertising_or_solicitation', 'medical_claim_or_advice',
      'low_information', 'ambiguous_institution_match'
    ]);
    record.requiresHumanReview = record.flags.some((flag) => reviewFlags.has(flag));
    // This is only a candidate queue for later human adjudication. It is not
    // automatically publishable and must never be interpreted as a review.
    record.candidateForExperienceReview = record.entityMatches.length === 1
      && record.serviceExperience && !record.requiresHumanReview;
  }

  const byTextHash = new Map();
  for (const record of records) {
    if (!record.textHash) continue;
    if (!byTextHash.has(record.textHash)) byTextHash.set(record.textHash, []);
    byTextHash.get(record.textHash).push(record);
  }
  let crossPlatformDuplicateGroups = 0;
  let crossPlatformDuplicateRecords = 0;
  for (const group of byTextHash.values()) {
    if (new Set(group.map((record) => record.platform)).size < 2) continue;
    crossPlatformDuplicateGroups += 1;
    const sorted = [...group].sort((a, b) => a.recordId.localeCompare(b.recordId));
    sorted.forEach((record, index) => {
      record.crossPlatformDuplicate = true;
      record.excludedAsDuplicate = index > 0;
      if (index > 0) crossPlatformDuplicateRecords += 1;
    });
  }
  return { crossPlatformDuplicateGroups, crossPlatformDuplicateRecords };
}

function aggregate(records) {
  const result = new Map();
  for (const record of records) {
    if (!record.candidateForExperienceReview || record.excludedAsDuplicate) continue;
    const entity = record.entityMatches[0];
    if (!result.has(entity.id)) {
      result.set(entity.id, {
        institutionId: entity.id, institutionName: entity.name, candidateExperienceRecords: 0,
        directMatches: 0, contextMatches: 0, platforms: {}, aspects: {},
        sentiment: { positive: 0, negative: 0, mixed_or_unclear: 0 }
      });
    }
    const item = result.get(entity.id);
    item.candidateExperienceRecords += 1;
    item.directMatches += record.entityMatchMethod === 'direct' ? 1 : 0;
    item.contextMatches += record.entityMatchMethod === 'content_context' ? 1 : 0;
    item.platforms[record.platform] = (item.platforms[record.platform] ?? 0) + 1;
    item.sentiment[record.sentiment] += 1;
    for (const aspect of record.aspects) item.aspects[aspect] = (item.aspects[aspect] ?? 0) + 1;
  }
  return [...result.values()].sort((a, b) => b.candidateExperienceRecords - a.candidateExperienceRecords);
}

export function prepareSocialData({ sources, institutionsPath, outputDir }) {
  const institutionsDocument = JSON.parse(readFileSync(institutionsPath, 'utf8'));
  const institutions = institutionsDocument?.country?.china?.institutions;
  if (institutionsDocument?.schemaVersion !== 1 || !Array.isArray(institutions)) {
    throw new Error('institutions.json must use schemaVersion 1 and country.china.institutions');
  }
  mkdirSync(outputDir, { recursive: true });
  const quarantine = [];
  const sourceReports = [];
  const unique = new Map();
  for (const source of sources) {
    const spec = PLATFORM_SPECS[source.platform]?.[source.kind];
    if (!spec) throw new Error(`unsupported source: ${source.platform}/${source.kind}`);
    const parsed = readJsonl(source.filePath, source.platform, source.kind);
    quarantine.push(...parsed.quarantine);
    let missingIdRows = 0;
    let duplicateRows = 0;
    for (const { row, line } of parsed.lines) {
      const normalized = normalizeRow(source.platform, source.kind, row, line, spec);
      if (normalized.error) {
        missingIdRows += 1;
        quarantine.push({ platform: source.platform, kind: source.kind, line, reason: normalized.error, byteLength: null, sha256: hash(JSON.stringify(row)) });
        continue;
      }
      const existing = unique.get(normalized.recordId);
      if (existing) duplicateRows += 1;
      if (!existing || normalized.sourceTimestamp >= existing.sourceTimestamp) unique.set(normalized.recordId, normalized);
    }
    sourceReports.push({
      platform: source.platform, kind: source.kind, fileName: basename(source.filePath), sha256: parsed.sha256,
      bytes: parsed.totalBytes, physicalLines: parsed.physicalLines, validRows: parsed.lines.length,
      malformedRows: parsed.quarantine.length, missingIdRows, duplicateRows
    });
  }

  const records = [...unique.values()];
  const duplicateStats = annotateRecords(records, institutions);
  const institutionsAggregate = aggregate(records);
  const flagCounts = {};
  for (const record of records) for (const flag of record.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    publicationStatus: 'LOCAL_RESEARCH_ONLY',
    sources: sourceReports,
    totals: {
      uniqueRecords: records.length,
      contents: records.filter((record) => record.kind === 'contents').length,
      comments: records.filter((record) => record.kind === 'comments').length,
      quarantineRecords: quarantine.length,
      humanReviewRecords: records.filter((record) => record.requiresHumanReview).length,
      candidateExperienceRecords: records.filter((record) => record.candidateForExperienceReview && !record.excludedAsDuplicate).length,
      matchedInstitutions: institutionsAggregate.length,
      ...duplicateStats
    },
    flagCounts,
    institutions: institutionsAggregate,
    limitations: [
      'Social-platform records are convenience samples and cannot estimate population satisfaction.',
      'Institution matching and experience classification are rule-based and require human review.',
      'Self-reported outcomes and medical claims are excluded from public quality scoring.',
      'No institution ranking or production reputation score is generated.'
    ]
  };

  const privateRows = records.map((record) => ({
    platform: record.platform, kind: record.kind, recordId: record.recordId,
    contentRef: record.contentRef, parentRef: record.parentRef, sourceTimestamp: record.sourceTimestamp,
    cleanedText: record.cleanedText, flags: record.flags,
    entityMatches: record.entityMatches, entityMatchMethod: record.entityMatchMethod,
    serviceExperience: record.serviceExperience, aspects: record.aspects, sentiment: record.sentiment,
    requiresHumanReview: record.requiresHumanReview,
    candidateForExperienceReview: record.candidateForExperienceReview,
    crossPlatformDuplicate: Boolean(record.crossPlatformDuplicate),
    excludedAsDuplicate: Boolean(record.excludedAsDuplicate), engagement: record.engagement
  }));

  writeFileSync(resolve(outputDir, 'normalized-private.jsonl'), `${privateRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  writeFileSync(resolve(outputDir, 'quarantine-metadata.jsonl'), quarantine.length ? `${quarantine.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
  writeFileSync(resolve(outputDir, 'aggregate-research.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'README.md'), [
    '# Local social-data research output', '',
    '**LOCAL RESEARCH ONLY. Do not commit or ship these files.**', '',
    '- `normalized-private.jsonl` contains redacted but still sensitive user-generated text.',
    '- `quarantine-metadata.jsonl` contains hashes and error metadata only; malformed text is not copied.',
    '- `aggregate-research.json` contains counts and institution-level research signals, not a quality score.',
    '- Human review, source authorization, entity verification, and minimum-evidence rules are required before any publication.'
  ].join('\n'));
  return summary;
}

function parseCli(args) {
  const sources = [];
  let institutionsPath = null;
  let outputDir = null;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${flag}`);
    if (CLI_FLAGS[flag]) {
      const [platform, kind] = CLI_FLAGS[flag];
      sources.push({ platform, kind, filePath: resolve(value) });
      index += 1;
    } else if (flag === '--institutions') {
      institutionsPath = resolve(value); index += 1;
    } else if (flag === '--output-dir') {
      outputDir = resolve(value); index += 1;
    } else throw new Error(`unknown argument: ${flag}`);
  }
  if (sources.length === 0 || !institutionsPath || !outputDir) {
    throw new Error('provide at least one source, --institutions, and --output-dir');
  }
  return { sources, institutionsPath, outputDir };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const summary = prepareSocialData(parseCli(process.argv.slice(2)));
    console.log(JSON.stringify({ status: summary.publicationStatus, totals: summary.totals }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
