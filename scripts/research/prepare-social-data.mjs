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
  medical_claim_or_advice: /(确诊|诊断为|处方|剂量|停药|换药|加药|减药|误诊|治愈|根治)/,
  medical_treatment_detail: /(无抽搐电休克|电休克|电痉挛|电疗|经颅磁刺激|磁刺激治疗|机械约束|约束带|强制住院|非自愿住院|隔离病房|诊断结果|诊断分析|治疗建议|治疗方案|诊疗方案|\bM?ECT\b|\bTMS\b)/i
};

// This deliberately favors restricting a few false positives over exposing a
// named clinician or staff member in the standard review queue. Explicit
// “called/surnamed” constructions cover uncommon surnames; the surname list
// covers common “Name + role” forms without treating generic “某科医生” as a
// person name.
const CLINICIAN_NAME_PATTERNS = [
  /(?:医生|大夫|医师|护士|咨询师|心理师|治疗师|老师|教授|主任|院长)(?:名字)?(?:叫|姓|名为)\s*(?!(?:我|你|他|她|它|患者|病人|家属|孩子|父母))[\u4e00-\u9fff·]{1,4}/g,
  /(?:赵|钱|孙|李|周|吴|郑|王|冯|陈|褚|卫|蒋|沈|韩|杨|朱|秦|尤|许|何|吕|施|张|孔|曹|严|华|金|魏|陶|姜|戚|谢|邹|喻|柏|水|窦|章|云|苏|潘|葛|奚|范|彭|郎|鲁|韦|昌|马|苗|凤|花|方|俞|任|袁|柳|鲍|史|唐|费|廉|岑|薛|雷|贺|倪|汤|滕|殷|罗|毕|郝|邬|安|常|乐|于|时|傅|皮|卞|齐|康|伍|余|元|卜|顾|孟|平|黄|和|穆|萧|尹|姚|邵|汪|祁|毛|禹|狄|米|贝|明|臧|计|伏|成|戴|谈|宋|茅|庞|熊|纪|舒|屈|项|祝|董|梁|杜|阮|蓝|闵|席|季|麻|强|贾|路|娄|危|江|童|颜|郭|梅|盛|林|刁|钟|徐|邱|骆|高|夏|蔡|田|樊|胡|凌|霍|虞|万|支|柯|管|卢|莫|房|裘|缪|解|应|宗|丁|宣|邓|郁|单|杭|洪|包|左|石|崔|吉|龚|程|邢|裴|陆|荣|翁|荀|羊|惠|甄|曲|家|封|芮|储|靳|邴|糜|松|井|段|富|巫|乌|焦|巴|弓|牧|隗|山|谷|车|侯|宓|蓬|全|郗|班|仰|秋|仲|伊|宫|宁|仇|栾|暴|甘|厉|戎|祖|武|符|刘|景|詹|束|龙|叶|幸|司|韶|郜|黎|蓟|薄|印|宿|白|怀|蒲|台|从|鄂|索|咸|籍|赖|卓|蔺|屠|蒙|池|乔|阴|郁|胥|能|苍|双|闻|莘|党|翟|谭|贡|劳|逄|姬|申|扶|堵|冉|宰|郦|雍|却|璩|桑|桂|濮|牛|寿|通|边|扈|燕|冀|郏|浦|尚|农|温|别|庄|晏|柴|瞿|阎|充|慕|连|茹|习|宦|艾|鱼|容|向|古|易|慎|戈|廖|庾|终|暨|居|衡|步|都|耿|满|弘|匡|国|文|寇|广|禄|阙|东|欧|殳|沃|利|蔚|越|夔|隆|师|巩|厍|聂|晁|勾|敖|融|冷|訾|辛|阚|那|简|饶|空|曾|毋|沙|乜|养|鞠|须|丰|巢|关|蒯|相|查|后|荆|红|游|竺|权|逯|盖|益|桓|公)[\u4e00-\u9fff·]{0,2}(?:医生|大夫|医师|护士|咨询师|心理师|治疗师|老师|教授|主任|院长)/g
];

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
  const redactionFlags = new Set();
  const replace = (pattern, token, flag = null) => {
    text = text.replace(pattern, () => {
      replacements += 1;
      if (flag) redactionFlags.add(flag);
      return token;
    });
  };
  replace(/https?:\/\/[^\s]+/gi, '[URL]');
  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
  replace(/(?<!\d)\d{17}[0-9Xx](?!\d)/g, '[ID]');
  replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[PHONE]');
  replace(/(?:微信|V信|VX|QQ|扣扣)\s*(?:号|:|：)?\s*[A-Za-z0-9_-]{5,}/gi, '[CONTACT]');
  replace(/@[\p{L}\p{N}_-]{2,}/gu, '[@USER]');
  for (const pattern of CLINICIAN_NAME_PATTERNS) replace(pattern, '[CLINICIAN]', 'named_clinician_or_staff');
  return { text, replacements, redactionFlags: [...redactionFlags] };
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
    if (!text.includes(matcher.value)) continue;
    if (!matches.has(matcher.institution.id)) {
      matches.set(matcher.institution.id, { institution: matcher.institution, terms: new Set() });
    }
    matches.get(matcher.institution.id).terms.add(matcher.value);
  }
  return [...matches.values()].map(({ institution, terms }) => ({ institution, terms: [...terms] }));
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
  const { text, replacements, redactionFlags } = cleanAndRedact(joinText(row, spec.text));
  const flags = [];
  if (replacements > 0) flags.push('direct_identifier_redacted');
  flags.push(...redactionFlags);
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
  const reviewFlags = new Set([
    'direct_identifier_redacted', 'high_risk_personal_disclosure', 'abusive_or_dehumanizing_language',
    'public_affairs_or_identity_sensitive', 'advertising_or_solicitation', 'medical_claim_or_advice',
    'medical_treatment_detail', 'named_clinician_or_staff', 'low_information',
    'ambiguous_institution_match', 'context_requires_restricted_review'
  ]);

  // First annotate each author's own text. This pass intentionally does not
  // inherit a parent record so source ordering cannot change the result.
  for (const record of records) {
    // Only text supplied by the author can establish a direct match. Search
    // keywords are intentionally excluded because they describe the crawl,
    // not necessarily the record.
    const direct = matchInstitutions(record.cleanedText, matchers);
    record.entityMatches = direct.map(({ institution }) => ({ id: institution.id, name: institution.name }));
    record.entityMatchEvidence = direct.map(({ institution, terms }) => ({ institutionId: institution.id, terms }));
    record.entityMatchMethod = direct.length === 1 ? 'direct' : direct.length > 1 ? 'ambiguous' : null;
    record.serviceExperience = FIRST_PERSON.test(record.cleanedText) && SERVICE_EXPERIENCE.test(record.cleanedText);
    if (!record.serviceExperience) record.flags.push('not_first_person_service_experience');
    record.aspects = Object.entries(ASPECT_PATTERNS).filter(([, pattern]) => pattern.test(record.cleanedText)).map(([name]) => name);
    const positive = [...record.cleanedText.matchAll(POSITIVE_TERMS)].length;
    const negative = [...record.cleanedText.matchAll(NEGATIVE_TERMS)].length;
    record.sentiment = positive === negative ? 'mixed_or_unclear' : positive > negative ? 'positive' : 'negative';
  }

  // Only then may a comment inherit a single institution from its content.
  // A sensitive or otherwise restricted parent makes the whole evidence chain
  // restricted, even when the comment itself appears harmless.
  for (const record of records) {
    if (record.entityMatches.length === 0 && record.kind === 'comments') {
      const parentContent = contents.get(record.contentRef);
      if (parentContent?.entityMatches?.length === 1) {
        record.entityMatches = parentContent.entityMatches;
        record.entityMatchEvidence = parentContent.entityMatchEvidence;
        record.entityMatchMethod = 'content_context';
        if (parentContent.flags.some((flag) => reviewFlags.has(flag))) {
          record.flags.push('context_requires_restricted_review');
        }
      }
    }
    if (record.entityMatches.length > 1) record.flags.push('ambiguous_institution_match');
    if (record.entityMatches.length === 0) record.flags.push('no_institution_match');
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
    entityMatchEvidence: record.entityMatchEvidence,
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
