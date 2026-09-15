// 社交证据归一化管线（私有，产物只写入 work/，绝不入库、绝不发布）
//
// 流程：原始抓取(raw/dataforweb) → 清洗去重 → 去标识风险扫描 → 机构归因 →
//       非医学服务维度预标 → 红旗标记（医学内容/广告/非亲历） → 归一化层 + 统计报告
//
// 设计原则（对应 manifest 的 boundaries）：
//   1. 归一化层是私有中间产物，发布前必须经人工裁定（review-queue-private.json）
//   2. 机器只做"预标"与"红旗"，不做最终判定；不确定一律留空/标旗，不猜测
//   3. 归因保守：仅别名精确命中算 direct，父内容命中算 content_context，否则 null
//
// 运行：node scripts/atlas/normalize-social-evidence.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(ROOT, 'raw', 'dataforweb');
const OUT_DIR = join(ROOT, 'work');
mkdirSync(OUT_DIR, { recursive: true });

// ---------- 机构别名（别名来自公开常用称呼，不做模糊外推） ----------
// 2026-09 扩充：此前只列 3 家目标机构，导致数据里其他机构的记录全部落进
// no_institution_match（11063 条里 9547 条），机构覆盖被白名单卡死在 3 家。
// 这里把原始采集数据中实际出现、且能在 src/atlas/institutions.json 里对上的机构补进来。
// 注意：补进来只意味着这些机构的记录能被归因与抽样，不代表样本量够评分 ——
// 原始采集用的是泛化关键词（"精神卫生中心""精神病院"等 8 组），多数机构只有个位数提及。
// 未纳入的泛称（"精神卫生中心""精神康复中心""睡眠医学中心""省精神病医院"）是名录里的
// 不完整条目，作为别名会造成大范围误匹配，故排除。
const INSTITUTION_ALIASES = {
  上海市精神卫生中心: [
    '上海市精神卫生中心', '上海精神卫生中心', '上海精卫中心', '上海市精卫中心',
    '上海精卫', '上精卫',
    '宛平南路600号', '宛平南路 600 号', '宛平南路六百号', '600号', '六百号'
  ],
  武汉市精神卫生中心: [
    '武汉市精神卫生中心', '武汉精神卫生中心', '武汉精卫中心', '武汉市精卫中心',
    '武汉精卫', '六角亭', '六角亭院区', '二七院区'
  ],
  北京大学第六医院: [
    '北京大学第六医院', '北大六院', '北医六院', '北京六院',
    '北京大学精神卫生研究所', '北大六院精神科'
  ],
  山东省精神卫生中心: [
    '山东省精神卫生中心', '山东精神卫生中心', '山东省精卫中心', '山东精卫中心'
  ],
  西安市精神卫生中心: [
    '西安市精神卫生中心', '西安精神卫生中心', '西安市精卫中心', '西安精卫中心'
  ],
  重庆市精神卫生中心: [
    '重庆市精神卫生中心', '重庆精神卫生中心', '重庆市精卫中心', '重庆精卫中心'
  ],
  深圳市精神卫生中心: ['深圳市精神卫生中心', '深圳精神卫生中心'],
  深圳市康宁医院: ['深圳市康宁医院', '深圳康宁医院', '深圳康宁'],
  南京脑科医院: ['南京脑科医院', '南京脑科'],
  北京回龙观医院: ['北京回龙观医院', '回龙观医院'],
  北京安定医院: ['北京安定医院', '安定医院'],
  广州白云心理医院: ['广州白云心理医院', '白云心理医院'],
  中南大学湘雅二医院: ['中南大学湘雅二医院', '湘雅二医院'],
  杭州市第七人民医院: ['杭州市第七人民医院', '杭州七院', '杭七院'],
  合肥市第四人民医院: ['合肥市第四人民医院', '合肥四院'],
  天门市精神卫生中心: ['天门市精神卫生中心'],
  永川区精神卫生中心: ['永川区精神卫生中心']
};

// ---------- 红旗词表 ----------
const PII_PATTERNS = [
  { id: 'phone', re: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
  { id: 'id_card', re: /(?<!\d)\d{17}[\dXx](?!\d)/ },
  { id: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  { id: 'contact_handle', re: /(微信|weixin|wx|v信|薇|QQ|qq|扣扣)[^\w]{0,4}[A-Za-z0-9_-]{5,}/ },
  { id: 'named_clinician', re: /[\u4e00-\u9fa5]{1,3}(医生|大夫|主任|教授|专家)(?![^，。！？]{0,6}(说|表示|指出|介绍))/ },
  { id: 'precise_route', re: /(20\d{2})年\d{1,2}月\d{1,2}[日号]|周[一二三四五六日][上下]午\d{1,2}[点时]|\d{1,2}号(床|病床|诊室)/ }
];

// 医学内容：诊断/处方/疗效/治疗建议 —— 命中即不可作为服务维度证据（manifest 排除项）
const MEDICAL_PATTERNS = [
  { id: 'diagnosis', re: /(确诊|被诊断|诊断书|诊断结果|双相|精神分裂|重度抑郁|中度抑郁|焦虑症|强迫症|ptsd|adhd)/i },
  { id: 'prescription', re: /(开药|处方|药量|减药|停药|加药|换药|米氮平|舍曲林|劳拉|喹硫平|奥氮平|氟西汀|度洛西汀|文拉法辛|阿立哌唑|碳酸锂|剂量)/ },
  { id: 'efficacy', re: /(治好|治愈|痊愈|药到病除|疗效显著|保证好|根治)/ },
  { id: 'treatment_advice', re: /(建议(你|大家)?(吃|用|做|去|住院|做mect)|应该(吃|用|做)|最好(吃|用|做)|mect|电休克|电疗)/i }
];

// 广告 / 转述 / 新闻 / 一般讨论
const NOISE_PATTERNS = [
  { id: 'ad', re: /(加v|加微|私信我|扫码|优惠|报名|课程|带货|直播间|广告|推广|代购)/ },
  { id: 'secondhand', re: /(听说|我朋友说|我同学说|据说|据报道|据称|新闻|记者|转述)/ },
  { id: 'general_question', re: /^(有人知道吗|请问|求助|想问|是不是|能不能|有没有人)/ }
];

// 非医学服务维度（manifest annotationSchema.aspects）
const ASPECT_RULES = [
  { id: 'access_and_wait', re: /(挂号|排队|等号|等待|等了|预约|号源|黄牛|抢号|排到|几小时|半天才)/ },
  { id: 'cost_and_billing', re: /(费用|价格|多少钱|挂号费|医保|报销|收费|贵|便宜|自费|账单)/ },
  { id: 'staff_interaction', re: /(态度|耐心|温柔|冷漠|敷衍|沟通|解释|护士|医生[很挺还]|问诊|倾听)/ },
  { id: 'process_and_information', re: /(流程|手续|指引|导诊|告知|说明|填表|检查流程|就诊流程|环节)/ },
  { id: 'environment_and_facilities', re: /(环境|病房|设施|设备|床位|干净|吵|拥挤|硬件|住院条件)/ },
  { id: 'continuity_and_follow_up', re: /(复诊|随访|回访|后续|定期|下次|持续|长期)/ },
  { id: 'self_reported_outcome', re: /(好转|好了|没效果|没用|副作用|反应|恢复|改善|缓解|睡得着)/ }
];

// 亲历信号（本人或陪诊）：第一人称 + 就诊动作
const EXPERIENCE_PATTERNS = [
  /(我|俺)(去|去了|去过|挂|挂了|看|看了|住|住了|复诊|排队|排了|带|陪)/,
  /(我家|我妈|我爸|我女儿|我儿子|我孩子|我爱人|我老公|我老婆)/,
  /(陪(我|妈妈|爸爸|孩子|家人)|带(我|她|他)(去|看|挂))/,
  /(我(的)?(主治|门诊|住院|出院|手术|治疗))/
];

const FILES = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter((f) => f.endsWith('.jsonl')) : [];
const readJsonl = (file) => readFileSync(file, 'utf-8')
  .split(/\r?\n/).filter(Boolean)
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean);

const normText = (s) => String(s ?? '')
  .replace(/\[[^\]]{1,12}\]/g, '')      // 平台表情占位 [泣不成声]
  .replace(/\u200e|\u200f/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const fingerprint = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** 机构归因：返回**全部**命中的机构，不取第一个。
 *
 * 为什么不能取第一个：别名表从 3 家扩到 17 家后，一条文本同时提到多家机构变得常见
 * （榜单帖、跨院比较帖、"XX 和 YY 哪个好"）。此前写法是遍历到第一个命中就 return，
 * 结果是先声明谁就归给谁——语序偶然决定归因，等于让机器猜。
 * 规则见 REVIEW-RULES.md 第 1 节："不能确定时选 uncertain，不猜测"。
 * 这里改为：唯一命中才归因；命中 ≥2 家时置 null 并打 `ambiguous_multi_institution` 旗，
 * 交由人工裁定，且不参与父内容上下文归因（否则会被父帖重新劫持到其中一家）。
 */
function matchInstitutions(text) {
  const hits = [];
  for (const [name, aliases] of Object.entries(INSTITUTION_ALIASES)) {
    for (const alias of aliases) {
      if (text.includes(alias)) { hits.push({ name, method: 'direct', evidence: alias }); break; }
    }
  }
  return hits;
}

const records = [];
const skipped = { empty: 0, duplicate: 0 };
const seenText = new Map();
const parentIndex = new Map(); // parentId -> { platform, text }

// ---------- 1. 载入并清洗 ----------
for (const file of FILES) {
  const isDouyin = file.includes('douyin');
  const isContent = file.includes('contents');
  const platform = isDouyin ? 'douyin' : 'xhs';
  const kind = isContent ? 'post' : 'comment';
  for (const row of readJsonl(join(SRC_DIR, file))) {
    const raw = isContent ? (row.desc || row.title || '') : (row.content || '');
    const text = normText(raw);
    if (text.length < 6) { skipped.empty += 1; continue; }
    const parentId = String(isDouyin ? (row.aweme_id ?? '') : (row.note_id ?? ''));
    const dedupeKey = `${platform}:${fingerprint(text.slice(0, 60))}`;
    if (seenText.has(dedupeKey)) { skipped.duplicate += 1; continue; }
    seenText.set(dedupeKey, true);

    const recordId = fingerprint(`${platform}:${isContent ? row.aweme_id ?? row.note_id : row.comment_id ?? ''}:${text.slice(0, 30)}`);
    const hits = matchInstitutions(`${isContent ? row.title ?? '' : ''}${text}`);
    const item = {
      recordId,
      platform,
      kind,
      sourceFile: file,
      parentId,
      text: text.slice(0, 800),
      textLength: text.length,
      createdAt: row.create_time ? new Date((String(row.create_time).length > 11 ? row.create_time : row.create_time * 1000)).toISOString().slice(0, 10) : null,
      likes: Number(row.like_count ?? row.liked_count ?? 0) || 0,
      authorRef: row.creator_hash ?? null, // 仅本地关联用，绝不发布
      institution: hits.length === 1 ? hits[0] : null,
      institutionCandidates: hits.map((h) => h.name),
      serviceExperience: EXPERIENCE_PATTERNS.some((re) => re.test(text)),
      aspects: ASPECT_RULES.filter((a) => a.re.test(text)).map((a) => a.id),
      flags: [],
      risk: { identifiers: [], medical: [], noise: [] }
    };
    for (const p of PII_PATTERNS) if (p.re.test(text)) item.risk.identifiers.push(p.id);
    for (const p of MEDICAL_PATTERNS) if (p.re.test(text)) item.risk.medical.push(p.id);
    for (const p of NOISE_PATTERNS) if (p.re.test(text)) item.risk.noise.push(p.id);

    if (item.risk.identifiers.length) item.flags.push('possible_identifier');
    if (item.risk.medical.length) item.flags.push('possible_medical_content');
    if (item.risk.noise.length) item.flags.push('possible_ad_or_secondhand');
    if (!item.institution && hits.length === 0) item.flags.push('no_institution_match');
    if (hits.length > 1) item.flags.push('ambiguous_multi_institution');
    if (!item.serviceExperience) item.flags.push('not_experience_signal');

    records.push(item);
    if (isContent) parentIndex.set(`${platform}:${parentId}`, {
      platform,
      text: `${row.title ?? ''} ${text}`.slice(0, 800),
      institution: item.institution
    });
  }
}

// ---------- 2. 上下文归因（评论归属到所属视频/笔记命中的机构） ----------
let contextMatched = 0;
for (const rec of records) {
  if (rec.institution || !rec.parentId) continue;
  // 歧义记录不参与上下文归因：父帖恰好命中其中一家，会把它重新"洗"成单机构，
  // 而用户在评论文本里本来就是在对比，归给任何一家都是猜。
  if (rec.flags.includes('ambiguous_multi_institution')) continue;
  const parent = parentIndex.get(`${rec.platform}:${rec.parentId}`);
  if (parent?.institution) {
    rec.institution = { ...parent.institution, method: 'content_context' };
    rec.flags = rec.flags.filter((f) => f !== 'no_institution_match');
    contextMatched += 1;
  }
}

// ---------- 3. 产物 ----------
const normalizedPath = join(OUT_DIR, 'normalized-private.jsonl');
writeFileSync(normalizedPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
const sha256 = createHash('sha256').update(readFileSync(normalizedPath)).digest('hex');

const byPlatform = {};
const byInstitution = {};
const byAspect = {};
const byFlag = {};
for (const r of records) {
  byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;
  const inst = r.institution?.name ?? 'none';
  byInstitution[inst] = (byInstitution[inst] ?? 0) + 1;
  for (const a of r.aspects) byAspect[a] = (byAspect[a] ?? 0) + 1;
  for (const f of r.flags) byFlag[f] = (byFlag[f] ?? 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceFiles: FILES,
  total: records.length,
  skipped,
  contextMatched,
  ambiguousMultiInstitution: records.filter((r) => r.flags.includes('ambiguous_multi_institution')).length,
  byPlatform,
  byInstitution,
  byAspect,
  byFlag,
  normalizedFile: 'work/normalized-private.jsonl',
  sha256,
  note: '私有中间产物：仅用于人工审阅队列抽样与聚合，禁止直接发布任何原文、链接或账号字段。'
};
writeFileSync(join(OUT_DIR, 'normalization-report.json'), JSON.stringify(report, null, 2));

console.log('归一化完成：', records.length, '条（跳过 空:', skipped.empty, ' 重复:', skipped.duplicate, '）');
console.log('平台分布:', JSON.stringify(byPlatform));
console.log('机构归因:', JSON.stringify(byInstitution), '| 上下文归因补充:', contextMatched,
  '| 多机构歧义:', report.ambiguousMultiInstitution);
console.log('维度预标:', JSON.stringify(byAspect));
console.log('红旗统计:', JSON.stringify(byFlag));
console.log('sha256:', sha256);
