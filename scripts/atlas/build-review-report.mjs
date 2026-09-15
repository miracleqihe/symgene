// 生成人工审阅报告（本地复核用，落盘 work/，不入库、不发布）
// 运行：node scripts/atlas/build-review-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reviewQueue, reviewManifest } from './lib/private-inputs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const adj = JSON.parse(readFileSync(join(ROOT, 'work', 'review-adjudication.json'), 'utf-8'));
const norm = JSON.parse(readFileSync(join(ROOT, 'work', 'normalization-report.json'), 'utf-8'));
const queue = JSON.parse(readFileSync(reviewQueue(), 'utf-8'));
const manifest = JSON.parse(readFileSync(reviewManifest(), 'utf-8'));

const byId = new Map(queue.records.map((r) => [r.reviewId, r]));
const platformLabel = { xhs: '小红书', douyin: '抖音', zhihu: '知乎' };
const cohortLabel = {
  primary_candidate: '主候选',
  target_negative_audit: '目标机构反向核查',
  unmatched_false_negative_audit: '未匹配假阴性核查'
};
const entityLabel = { correct: '归因正确', incorrect: '归因错误', uncertain: '归因不确定' };
const expLabel = { firsthand: '本人', accompanied: '陪诊', not_experience: '非亲历', uncertain: '不确定' };
const privLabel = { clear: '无残留', residual_identifier: '残留可识别', uncertain: '需复核' };
const aggLabel = { include: '纳入', exclude: '排除', uncertain: '待复核' };
const aspectLabel = {
  access_and_wait: '挂号与等待', cost_and_billing: '费用与结算', staff_interaction: '医患沟通',
  process_and_information: '流程与告知', environment_and_facilities: '环境与设施',
  continuity_and_follow_up: '复诊与连续性', self_reported_outcome: '自述结果', other: '其他'
};

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// 排除/待复核原因归类（用于 TOP 统计）
function reasonBucket(r) {
  const t = (r.text ?? byId.get(r.reviewId)?.text ?? '').toLowerCase();
  if (r.privacyDecision === 'residual_identifier') return '残留可识别信息';
  if (r.entityDecision === 'incorrect') return '机构归因不明确或错误';
  if (r.experienceDecision === 'not_experience') return '无法证明本人或陪诊';
  if (r.aggregationDecision === 'uncertain') return '信息不足待复核';
  return '医学内容或其他排除情形';
}
const buckets = {};
for (const r of adj.records) if (r.aggregationDecision !== 'include') {
  const b = reasonBucket(r);
  buckets[b] = (buckets[b] ?? 0) + 1;
}
const bucketRows = Object.entries(buckets).sort((a, b) => b[1] - a[1]);

const rows = adj.records.map((r, i) => {
  const src = byId.get(r.reviewId) ?? {};
  const text = r.text ?? src.text ?? '';
  const batch = r.batch === 'batch2' ? '第二批' : '第一批';
  return `<tr>
    <td class="mono">${i}</td>
    <td>${batch}</td>
    <td>${cohortLabel[r.cohort] ?? r.cohort}</td>
    <td>${platformLabel[r.platform] ?? r.platform}</td>
    <td class="txt">${esc(text.slice(0, 110))}${text.length > 110 ? '…' : ''}</td>
    <td>${r.adjudicatedInstitution ? esc(r.adjudicatedInstitution) : '<span class="muted">—</span>'}</td>
    <td class="tag t-${r.entityDecision}">${entityLabel[r.entityDecision]}</td>
    <td class="tag t-${r.experienceDecision}">${expLabel[r.experienceDecision]}</td>
    <td class="tag t-${r.privacyDecision}">${privLabel[r.privacyDecision]}</td>
    <td class="tag t-${r.aggregationDecision}">${aggLabel[r.aggregationDecision]}</td>
    <td class="dim">${r.aspects.map((a) => aspectLabel[a] ?? a).join('、') || '<span class="muted">—</span>'}</td>
    <td class="why">${esc(r.rationale)}</td>
  </tr>`;
}).join('\n');

const s = adj.summary;

// 发布结论所需的动态统计
const THRESHOLD = 20;
const pol = JSON.parse(readFileSync(join(ROOT, 'work', 'polarity-adjudication.json'), 'utf-8'));
const { SOCIAL_REPUTATION: PUB, SOCIAL_REPUTATION_META: PUB_META } = await import(
  pathToFileURL(join(ROOT, 'src', 'atlas', 'chinaSocialReputation.js')).href
);
const minAspect = PUB_META.scorePolicy?.minAspectSample ?? 3;

const scoreRows = Object.entries(PUB).map(([name, agg]) => {
  const dims = agg.scoredDimensions ?? [];
  return `<tr>
    <td>${esc(name)}</td>
    <td>${agg.mentions}</td>
    <td>${agg.polarity.positive}</td>
    <td>${agg.polarity.negative}</td>
    <td>${agg.polarity.neutral}</td>
    <td>${dims.length} / ${Object.keys(agg.dimensionScores ?? {}).length}</td>
    <td><b>${agg.serviceScore != null ? `${agg.serviceScore} / 100` : '<span class="muted">—</span>'}</b></td>
    <td>${agg.reviewStatus === 'scored' ? '已评分'
      : agg.reviewStatus === 'profile_published' ? '仅发布维度分布' : '样本不足'}</td>
  </tr>`;
}).join('\n');

const aspectRows = Object.entries(PUB).map(([name, agg]) => {
  const parts = Object.entries(agg.dimensionScores ?? {})
    .sort((a, b) => b[1].n - a[1].n)
    .map(([a, d]) => `${aspectLabel[a] ?? a} ${d.score != null ? d.score : '—'}（${d.n} 条：${d.positive}正/${d.negative}负/${d.neutral}中）`);
  return `<b>${esc(name)}</b>：${parts.join(' · ') || '暂无'}`;
}).join('<br>');

const instEntries = Object.entries(adj.byInstitution ?? {});
const instLines = instEntries.map(([n, v]) => {
  const pub = PUB[n];
  const score = pub?.serviceScore != null ? `，倾向分 ${pub.serviceScore}` : '';
  return `${n} ${v.total} 条（直证 ${v.strict} / 放宽 ${v.relaxed}${score}）`;
}).join('、') || '暂无';
const reached = Object.entries(PUB).filter(([, v]) => v.serviceScore != null).map(([n]) => n);
const reachedList = reached.length
  ? `${reached.join('、')} 已达评分条件，发布服务体验倾向分；其余机构不发布分数`
  : '三家均未达评分条件，因此不发布任何分数';
const strictAll = instEntries.reduce((a, [, v]) => a + v.strict, 0);
const relaxedAll = instEntries.reduce((a, [, v]) => a + v.relaxed, 0);
const html = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<title>社交证据人工审阅报告</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px; background:#f7f5f0; color:#1c2b2e;
         font:14px/1.75 "PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
  .wrap { max-width:1360px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  h2 { font-size:17px; margin:34px 0 10px; padding-bottom:6px; border-bottom:1px solid rgba(48,91,96,.15); }
  .sub { color:#4a5b5e; font-size:13px; margin:0 0 4px; }
  .badge { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px;
           background:#f0e6d8; color:#9b7647; border:1px solid rgba(155,118,71,.3); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:16px 0; }
  .card { background:#fffdf8; border:1px solid rgba(48,91,96,.14); border-radius:12px; padding:14px 16px; }
  .card b { display:block; font-family:'DM Mono',monospace; font-size:26px; line-height:1.2; }
  .card span { font-size:12px; color:#4a5b5e; }
  .card.ok b { color:#3e8271; } .card.pend b { color:#9b7647; } .card.no b { color:#c26d5a; }
  table { width:100%; border-collapse:collapse; background:#fffdf8; font-size:12.5px;
          border:1px solid rgba(48,91,96,.14); border-radius:10px; overflow:hidden; }
  th, td { padding:7px 9px; text-align:left; border-bottom:1px solid rgba(48,91,96,.08); vertical-align:top; }
  th { background:#e8f1f3; font-size:11.5px; color:#1c2b2e; position:sticky; top:0; }
  tr:hover td { background:rgba(143,209,225,.08); }
  .mono { font-family:'DM Mono',monospace; font-size:11.5px; white-space:nowrap; }
  .txt, .why { max-width:260px; color:#3d4d50; }
  .why { font-size:11.5px; color:#5a6b6e; }
  .muted { color:#9aa5a7; }
  .tag { white-space:nowrap; font-size:11.5px; }
  .t-correct,.t-firsthand,.t-clear,.t-include { color:#3e8271; }
  .t-incorrect,.t-residual_identifier,.t-exclude { color:#c26d5a; }
  .t-uncertain,.t-pending { color:#9b7647; }
  .t-accompanied { color:#4f8fa8; }
  .t-not_experience { color:#7d8896; }
  .dim { font-size:11px; color:#4a5b5e; max-width:150px; }
  .note { background:#fffdf8; border:1px solid rgba(48,91,96,.14); border-left:3px solid #3e8271;
          border-radius:8px; padding:12px 16px; font-size:13px; color:#3d4d50; }
  ul.tight { margin:6px 0 0; padding-left:20px; }
  .scroll { max-height:70vh; overflow:auto; border-radius:10px; }
</style></head><body><div class="wrap">
  <h1>社交证据人工审阅报告</h1>
  <p class="sub">队列 <span class="mono">${adj.queueId}</span> · 裁定时间 ${adj.adjudicatedAt.slice(0, 10)} ·
     <span class="badge">LOCAL_REVIEW_ONLY · 仅供本地复核，不代表发布许可</span></p>

  <h2>一、数据管线</h2>
  <p class="sub">原始抓取 → 归一化清洗 → 抽样成审阅队列 → 人工逐条裁定 → 只把通过者计入匿名聚合。</p>
  <div class="cards">
    <div class="card"><b>${norm.total.toLocaleString('zh-Hans')}</b><span>归一化后记录（原始 ${(norm.total + norm.skipped.duplicate + norm.skipped.empty).toLocaleString('zh-Hans')} 行）</span></div>
    <div class="card"><b>${norm.skipped.duplicate.toLocaleString('zh-Hans')}</b><span>去重剔除</span></div>
    <div class="card"><b>${norm.skipped.empty.toLocaleString('zh-Hans')}</b><span>空/过短剔除</span></div>
    <div class="card"><b>${norm.byInstitution['上海市精神卫生中心'] ?? 0}</b><span>上海精卫归因命中</span></div>
    <div class="card"><b>${norm.byInstitution['武汉市精神卫生中心'] ?? 0}</b><span>武汉精卫归因命中</span></div>
    <div class="card"><b>${norm.byInstitution['北京大学第六医院'] ?? 0}</b><span>北大六院归因命中</span></div>
  </div>
  <div class="note">
    归一化层自动标记红旗：<b>${norm.byFlag.possible_identifier ?? 0}</b> 条疑似可识别信息、
    <b>${norm.byFlag.possible_medical_content ?? 0}</b> 条疑似医学内容、
    <b>${norm.byFlag.possible_ad_or_secondhand ?? 0}</b> 条疑似广告/转述。
    这些只作预筛，最终以人工裁定为准。
    归一化 sha256 <span class="mono">${norm.sha256.slice(0, 16)}…</span>
    （manifest 记录为 <span class="mono">${manifest.source.sha256.slice(0, 16)}…</span>，
    两者不同：本轮按更严格口径重建了归一化规则，因此哈希不可复现；裁定以你提供的队列文件为输入。）
  </div>

  <h2>二、裁定结果</h2>
  <div class="cards">
    <div class="card"><b>${s.total}</b><span>已裁定</span></div>
    <div class="card ok"><b>${s.aggregation.include ?? 0}</b><span>纳入匿名聚合</span></div>
    <div class="card pend"><b>${s.aggregation.uncertain ?? 0}</b><span>待复核</span></div>
    <div class="card no"><b>${s.aggregation.exclude ?? 0}</b><span>排除</span></div>
    <div class="card"><b>${s.entity.correct ?? 0}</b><span>机构归因正确</span></div>
    <div class="card"><b>${(s.experience.firsthand ?? 0) + (s.experience.accompanied ?? 0)}</b><span>本人或陪诊</span></div>
    <div class="card no"><b>${s.privacy.residual_identifier ?? 0}</b><span>残留可识别</span></div>
    <div class="card pend"><b>${s.machineMissedAttribution ?? 0}</b><span>机器漏判归因（已纠正）</span></div>
  </div>
  <p class="sub"><b>排除/待复核原因分布：</b>${bucketRows.map(([k, v]) => `${k} ${v} 条`).join(' · ')}</p>

  <h2>三、逐条裁定</h2>
  <div class="scroll"><table>
    <thead><tr><th>#</th><th>批次</th><th>队列</th><th>平台</th><th>内容（截断）</th><th>裁定机构</th><th>归因</th><th>经历</th><th>隐私</th><th>结论</th><th>服务维度</th><th>依据</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>

  <h2>四、极性裁定与评分</h2>
  <p class="sub">
    对纳入匿名聚合的 ${pol.records.length} 条证据，按服务维度独立标注正负极性：正面记 1、中性记 0.5、负面记 0，
    单维度达 ${minAspect} 条才给分，总分取达标维度的简单平均（不加权）。褒贬混杂无法分辨主次的一律记中性，不做猜测。
  </p>
  <div class="cards">
    <div class="card yes"><b>${pol.summary.overall.positive ?? 0}</b><span>整体偏正面</span></div>
    <div class="card no"><b>${pol.summary.overall.negative ?? 0}</b><span>整体偏负面</span></div>
    <div class="card pend"><b>${pol.summary.overall.neutral ?? 0}</b><span>整体中性</span></div>
  </div>
  <div class="scroll"><table>
    <thead><tr><th>机构</th><th>可用样本</th><th>正面</th><th>负面</th><th>中性</th><th>达标维度</th><th>服务体验倾向分</th><th>状态</th></tr></thead>
    <tbody>${scoreRows}</tbody>
  </table></div>
  <p class="sub">各维度明细：${aspectRows}</p>

  <h2>五、发布结论</h2>
  <div class="note">
    <ul class="tight">
      <li>三家目标机构通过审阅的可用证据：${instLines}</li>
      <li>发布门槛为单机构 ≥ ${THRESHOLD} 条通过审阅的亲历证据、且至少 ${PUB_META.scorePolicy?.minDimensionsForScore ?? 3} 个维度各达 ${minAspect} 条；<b>${reachedList}</b>。</li>
      <li>不产出"机构综合口碑分"：样本是自我选择的亲历叙述，愿意写长文本就更可能是来吐槽的，加权总分会被读成"这家医院几分"。改发<b>服务体验倾向分</b>——只描述已审阅文本里的正负面构成，并在页面同时列出正/负/中性原始条数。</li>
      <li>极性裁定结果：${pol.summary.overall.positive ?? 0} 条整体偏正面、${pol.summary.overall.negative ?? 0} 条偏负面、${pol.summary.overall.neutral ?? 0} 条中性（按维度标注，褒贬混杂无法分辨主次的一律记中性）。</li>
      <li>归因口径：达门槛机构中 ${strictAll} 条为文本自身指认，${relaxedAll} 条为父内容上下文归因（R1 放宽），前端已分别标注。</li>
      <li>跨批次去重剔除 ${adj.duplicates?.length ?? 0} 条同正文重复记录，保留先裁定结果。</li>
      <li>发布数据不含原帖链接、标题、账号、平台 ID、作者哈希与 sci-hub 等外链；仅保留匿名计数与非医学服务维度分布。</li>
      <li>仍有 ${adj.summary.aggregation.uncertain ?? 0} 条“待复核”（多为正文为图片/漫画无法核验、或无第一人称无法证明亲历）。</li>
    </ul>
  </div>
</div></body></html>`;

writeFileSync(join(ROOT, 'work', 'review-report.html'), html);
console.log('报告已生成：work/review-report.html');
console.log('裁定统计:', JSON.stringify(adj.summary.aggregation));
