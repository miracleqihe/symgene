// 社交口碑聚合脚本：把 MediaCrawler 的原始 jsonl（raw/，不入库）聚合为机构级口碑指标。
// 输出 src/atlas/chinaSocialReputation.js —— 仅聚合统计，绝不含作者昵称/主页/个案内容。
// 运行：node scripts/atlas/aggregate-social.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CRAWL_DIR = join(ROOT, 'raw', 'MediaCrawler', 'data', 'xhs', 'jsonl');
const OUT = join(ROOT, 'src', 'atlas');

// 就诊语境的情感词表（可继续补充；命中按词统计，非模型评分）
const POSITIVE_WORDS = ['专业', '耐心', '温柔', '有效', '推荐', '权威', '靠谱', '缓解', '帮助', '负责', '细致', '感谢', '康复', '好评', '值得'];
const NEGATIVE_WORDS = ['态度差', '冷漠', '排队', '难挂', '挂不上', '贵', '后悔', '投诉', '敷衍', '误诊', '失望', '折腾', '坑', '糟糕'];

// 机构别名归一（用于帖子文本匹配；键 = 别名，值 = 主名）
const ALIASES = {
  '北大六院': '北京大学第六医院',
  '北医六院': '北京大学第六医院',
  '安定医院': '北京安定医院',
  '回龙观医院': '北京回龙观医院',
  '上海精卫中心': '上海市精神卫生中心',
  '宛平南路600号': '上海市精神卫生中心',
  '宛平南路600': '上海市精神卫生中心',
  '广州脑科医院': '广州医科大学附属脑科医院',
  '惠爱医院': '广州医科大学附属脑科医院',
  '杭州七院': '杭州市第七人民医院',
  '深圳康宁': '深圳市康宁医院',
  '天津安定': '天津市安定医院',
  '成都四院': '成都市第四人民医院',
  '武汉精卫': '武汉市精神卫生中心',
  '仙岳医院': '厦门市仙岳医院',
  '合肥四院': '合肥市第四人民医院'
};

const readJsonl = (file) => readFileSync(file, 'utf-8')
  .split(/\r?\n/).filter(Boolean)
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean);

if (!existsSync(CRAWL_DIR)) {
  console.error('crawl dir missing:', CRAWL_DIR);
  process.exit(1);
}

const institutionsDocument = JSON.parse(
  readFileSync(join(ROOT, 'src', 'atlas', 'institutions.json'), 'utf-8')
);
const INSTITUTIONS = institutionsDocument?.country?.china?.institutions;
if (institutionsDocument.schemaVersion !== 1 || !Array.isArray(INSTITUTIONS)) {
  throw new Error('src/atlas/institutions.json 不符合 schemaVersion 1 的 country.china.institutions 契约');
}

// 主名 + 别名的匹配串（按长度降序，避免短词抢命中）
const matchers = [];
const GENERIC_TARGET = /^(精神科|心理咨询|心理门诊|心理科|精神病院|心理卫生|心理咨询科|心理咨询中心|心理健康中心)$|^(精神|心理)$|^(精神卫生中心|心理健康)$/
for (const inst of INSTITUTIONS) {
  if (GENERIC_TARGET.test(inst.name)) continue;
  const names = new Set([inst.name]);
  for (const [alias, main] of Object.entries(ALIASES)) {
    if (main === inst.name || inst.name.includes(main)) names.add(alias);
  }
  for (const n of names) {
    if (GENERIC_TARGET.test(n)) continue;
    matchers.push({ name: n, target: inst.name });
  }
}
matchers.sort((a, b) => b.name.length - a.name.length);

const matchInstitution = (text) => {
  if (!text) return null;
  for (const m of matchers) {
    if (text.includes(m.name)) return m.target;
  }
  return null;
};

const countHits = (text, words) => words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);

const notes = [];
const comments = [];
for (const file of readdirSync(CRAWL_DIR)) {
  if (!file.endsWith('.jsonl')) continue;
  const rows = readJsonl(join(CRAWL_DIR, file));
  if (file.includes('contents')) notes.push(...rows);
  if (file.includes('comments')) comments.push(...rows);
}

// 机构 → 聚合
const agg = new Map();
const ensure = (name) => {
  if (!agg.has(name)) {
    agg.set(name, {
      mentions: 0, likedCount: 0, collectedCount: 0, commentCount: 0, shareCount: 0,
      commentSamples: 0, posHits: 0, negHits: 0,
      notesList: []
    });
  }
  return agg.get(name);
};

// 公开笔记的展示用元数据（标题/链接/日期/互动数/情感词命中）——不含作者任何信息
const MAX_NOTES_SHOWN = 20;
const pushNote = (a, note, posHits, negHits) => {
  if (a.notesList.length >= MAX_NOTES_SHOWN) return;
  const ts = Number(note.time ?? 0);
  a.notesList.push({
    title: String(note.title ?? note.desc ?? '').slice(0, 60) || '（无标题）',
    url: note.note_url ?? '',
    date: ts ? new Date(ts).toISOString().slice(0, 10) : null,
    liked: Number(String(note.liked_count ?? '0').replace(/[^0-9]/g, '')) || 0,
    pos: posHits,
    neg: negHits
  });
};

for (const note of notes) {
  const text = `${note.title ?? ''} ${note.desc ?? ''}`;
  const target = matchInstitution(text) ?? matchInstitution(note.source_keyword ?? '');
  if (!target) continue;
  const a = ensure(target);
  a.mentions += 1;
  const num = (v) => Number(String(v ?? '0').replace(/[^0-9]/g, '')) || 0;
  a.likedCount += num(note.liked_count);
  a.collectedCount += num(note.collected_count);
  a.commentCount += num(note.comment_count);
  a.shareCount += num(note.share_count);
  const pos = countHits(text, POSITIVE_WORDS);
  const neg = countHits(text, NEGATIVE_WORDS);
  a.posHits += pos;
  a.negHits += neg;
  pushNote(a, note, pos, neg);
}

for (const c of comments) {
  const text = `${c.content ?? ''}`;
  const target = matchInstitution(text) ?? matchInstitution(c.note_title ?? '');
  if (!target) continue;
  const a = ensure(target);
  a.commentSamples += 1;
  a.posHits += countHits(text, POSITIVE_WORDS);
  a.negHits += countHits(text, NEGATIVE_WORDS);
}

// 实体对齐：同一机构的不同名称形式合并（主名 = 数据集内的规范条目）
const ENTITY_MERGE = {
  '首都医科大学附属北京安定医院': '北京安定医院'
};
for (const [alias, canonical] of Object.entries(ENTITY_MERGE)) {
  if (agg.has(alias)) {
    const src = agg.get(alias);
    const dst = ensure(canonical);
    for (const key of ['mentions', 'likedCount', 'collectedCount', 'commentCount', 'shareCount', 'commentSamples', 'posHits', 'negHits']) {
      dst[key] += src[key];
    }
    agg.delete(alias);
  }
}

// 口碑分：情感词占比映射到 0-100（仅当有足够样本），无样本为 null
const result = {};
for (const [name, a] of agg.entries()) {
  const signals = a.posHits + a.negHits;
  const reputationScore = signals >= 3
    ? Math.round((a.posHits / signals) * 100)
    : null;
  result[name] = { ...a, reputationScore };
}
for (const [alias, canonical] of Object.entries(ENTITY_MERGE)) {
  if (result[canonical]) result[alias] = result[canonical];
}

const updatedAt = new Date().toISOString().slice(0, 10);
const platform = 'xiaohongshu';
writeFileSync(
  join(OUT, 'chinaSocialReputation.js'),
  `// 由 scripts/atlas/aggregate-social.mjs 生成，请勿手改。仅含机构级聚合指标，无任何作者/个案信息。\n` +
  `export const SOCIAL_REPUTATION_META = { platform: '${platform}', updatedAt: '${updatedAt}', noteCount: ${notes.length}, commentCount: ${comments.length} };\n` +
  `export const SOCIAL_REPUTATION = ${JSON.stringify(result, null, 1)};\n`
);

console.log('notes scanned:', notes.length, '| comments scanned:', comments.length);
console.log('institutions with reputation signals:', Object.keys(result).length);
for (const [name, a] of Object.entries(result).slice(0, 12)) {
  console.log('-', name, '| mentions:', a.mentions, '| comments:', a.commentCount, '| pos/neg:', a.posHits + '/' + a.negHits, '| score:', a.reputationScore);
}
