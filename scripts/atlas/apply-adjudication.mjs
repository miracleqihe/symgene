// 人工裁定应用器：把逐条裁定结果写回审阅队列，产出可审计的裁定文件。
//
// 裁定准则（来自用户的审阅规范）：
//   1. 医院归因是否正确         -> entityDecision: correct | incorrect | uncertain
//   2. 是否本人/陪诊服务经历     -> experienceDecision: firsthand | accompanied | not_experience | uncertain
//   3. 涉及哪些非医学服务维度    -> aspects[]
//   4. 是否仍含人名/账号/联系方式/精确轨迹 -> privacyDecision: clear | residual_identifier | uncertain
//   5. 是否可保留为匿名聚合候选  -> aggregationDecision: include | exclude | uncertain
// 遇到残留可识别信息、医学诊断/处方/疗效/治疗建议、高风险个人披露、机构归因不明确、
// 无法证明本人或陪诊、广告转述新闻一般讨论 -> exclude 或 uncertain；不能确定一律 uncertain，不猜测。
//
// 运行：node scripts/atlas/apply-adjudication.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewQueue } from './lib/private-inputs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE = reviewQueue();
const OUT = join(ROOT, 'work', 'review-adjudication-batch1.json');

// [entityDecision, experienceDecision, privacyDecision, aggregationDecision, aspects, correctedInstitution, rationale]
const RULINGS = [
  ['incorrect', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction', 'continuity_and_follow_up'], null, '指向合肥某医生（田某），非目标机构；含医生姓名与疗效自述'],
  ['incorrect', 'not_experience', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], null, '对"避雷精神科大夫"现象的评论与转述，非本人就诊经历'],
  ['incorrect', 'firsthand', 'clear', 'exclude', [], null, '含诊断与用药内容，无机构归因'],
  ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '机构归因仅来自父视频，文本无机构证据；内容为住院服药发胖（医学）'],
  ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '仅"刚住院出来"，未指明机构，无法确认是否该院服务经历'],
  ['correct', 'firsthand', 'clear', 'include', ['staff_interaction'], '上海市精神卫生中心', 'R1放宽：父内容为上海精卫且无他院线索；"医生催我运动"是描述医生对自己的督促，属医患沟通，非向他人给治疗建议'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '个人状态描述，无就诊服务内容'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '未就医，仅表达住院意愿；含高风险表述且无机构'],
  ['incorrect', 'uncertain', 'clear', 'exclude', [], null, '家属视角但机构与场景不明（ICU），无法确认精神科服务'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], null, '含诊断结果与用药调理，并向他人给出就医建议；无机构'],
  ['incorrect', 'accompanied', 'uncertain', 'exclude', ['environment_and_facilities', 'continuity_and_follow_up'], null, '家属照护，含诊断/药物/疗程等医学内容与家庭病情披露；无机构'],
  ['uncertain', 'firsthand', 'clear', 'exclude', [], null, 'R1不适用："精卫门诊"为泛称；且仅陈述所在楼层，无任何服务维度内容'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '询问他人感受，无服务经历'],
  ['incorrect', 'uncertain', 'clear', 'exclude', ['staff_interaction'], null, '对心理咨询与药物的泛化比较（含疗效判断），无机构与具体就诊'],
  ['correct', 'accompanied', 'clear', 'include', ['cost_and_billing', 'staff_interaction', 'environment_and_facilities'], '上海市精神卫生中心', '明确"上海精卫"徐汇院区；家长带儿童特需就诊；对比费用、态度、环境，无医学建议与标识符'],
  ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '发胖主因在深圳用药，对上海精卫仅为询问，无该院服务经历'],
  ['uncertain', 'not_experience', 'residual_identifier', 'exclude', ['cost_and_billing'], null, '转述朋友经历；含医生姓名"龙彬"；机构归因依赖父内容'],
  ['incorrect', 'not_experience', 'clear', 'exclude', ['environment_and_facilities', 'continuity_and_follow_up'], null, '以专业/家属口吻给出住院与疗程建议，属医学治疗建议；无机构'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '本人经历在河北医大一与北京六院，归因到上海精卫错误；含药物发胖'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '与就诊服务无关的推测性评论'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '与就诊服务无关的推测性评论'],
  ['correct', 'accompanied', 'clear', 'include', ['access_and_wait', 'process_and_information', 'continuity_and_follow_up'], '上海市精神卫生中心', '明确"宛平南路600号"；本人带女儿就诊、父亲定期开药；涉及检查流程、心理咨询排不上与复诊开药，无医学建议与标识符'],
  ['uncertain', 'not_experience', 'clear', 'exclude', ['cost_and_billing', 'process_and_information'], null, '向他人提问在上海的就诊项目与费用，非本人经历陈述'],
  ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '未指明机构（父内容归因）；含中医诊断与处方'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '症状陈述，无服务维度'],
  ['correct', 'uncertain', 'clear', 'exclude', ['process_and_information'], '上海市精神卫生中心', '机构明确（"上精卫"公众号）；但仅为信息检索询问，无实际就诊服务经历'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '个人经历叙述与安慰建议，无就诊服务内容'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '对视频出镜者的评价，与机构服务无关'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '对笔记作者的评价，非服务经历'],
  ['incorrect', 'accompanied', 'clear', 'exclude', ['staff_interaction', 'environment_and_facilities'], null, '文本明确"我们在杭州"，归因到上海精卫错误'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '对笔记的评价，非服务经历'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'continuity_and_follow_up'], null, '本人经历在本地医院与成都华西，归因错误；含诊断与长期用药'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '药物副作用陈述，无就诊服务维度'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['cost_and_billing', 'staff_interaction'], null, '本人住院期间心理咨询冲突，无机构归因'],
  ['incorrect', 'firsthand', 'clear', 'exclude', [], null, '仅陈述住过精神病院，无机构与服务维度'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['access_and_wait'], null, '含向他人给出的挂号建议；无机构'],
  ['incorrect', 'accompanied', 'clear', 'exclude', [], null, '家属照护，含诊断与住院治疗等医学内容；无机构'],
  ['correct', 'accompanied', 'clear', 'include', ['environment_and_facilities', 'process_and_information'], '上海市精神卫生中心', '机构明确（上海精卫/宛平南路600号）；家长记录女儿21天封闭病房住院，环境与管理为主体，"康复"仅一笔带过；无标识符'],
  ['incorrect', 'not_experience', 'uncertain', 'exclude', [], null, '家族多人精神健康史，属高风险披露；无机构、非服务经历'],
  ['incorrect', 'accompanied', 'clear', 'exclude', ['environment_and_facilities'], null, '陪母亲住院的咨询，无机构归因'],
  ['correct', 'not_experience', 'uncertain', 'exclude', ['environment_and_facilities', 'staff_interaction'], '武汉市精神卫生中心', '机构明确但为实习人员视角，非患者/陪诊经历；含确切实习时段'],
  ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'staff_interaction', 'continuity_and_follow_up'], '武汉市精神卫生中心', '机构明确、本人就诊；预约排队时间长属服务维度。被投诉的"私下联系方式"是转述咨询师引流行为，未给出任何真实联系方式，非广告本身'],
  ['correct', 'not_experience', 'clear', 'exclude', [], '上海市精神卫生中心', '询问医院名称，非服务经历'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '与就诊服务无关的评论'],
  ['correct', 'not_experience', 'clear', 'exclude', ['staff_interaction'], '北京大学第六医院', '问答中的就医推荐与推测（"你去了应该…"），无法证明本人经历；含开药等医学内容'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '明确为乌鲁木齐第四医院，归因错误'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '询问租房与进修，非就诊服务经历'],
  ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'process_and_information'], '武汉市精神卫生中心', 'R1放宽：父内容为武汉精卫且无他院线索；本人当日就诊、预约已满需等一个月、公众号与挂号科室选择，服务维度清晰'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '询问实习途径，非服务经历'],
  ['incorrect', 'uncertain', 'clear', 'exclude', ['cost_and_billing'], null, '"我们这里"未指明机构'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '与就诊服务无关的评论'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '住院观察泛述，无机构与服务维度'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '向他人提问用药，非服务经历'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '无有效信息'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '药物副作用陈述，无服务维度'],
  ['incorrect', 'firsthand', 'uncertain', 'exclude', ['cost_and_billing', 'process_and_information'], null, '含检查结果与医保记录等个人医疗披露；无机构'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '与就诊服务无关的泛论'],
  ['correct', 'firsthand', 'clear', 'exclude', ['cost_and_billing'], '上海市精神卫生中心', 'R1放宽成立（父内容为宛平南路600号且无他院线索）；但内容为询问住院费用，尚未产生实际服务体验'],
  ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'process_and_information', 'continuity_and_follow_up'], null, '以线上开药与长期服药疑问为主，属处方/用药内容；归因依赖父内容'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '家庭生活内容，与机构服务无关'],
  ['correct', 'firsthand', 'uncertain', 'exclude', ['access_and_wait', 'cost_and_billing', 'process_and_information', 'continuity_and_follow_up'], '上海市精神卫生中心', '自述视频正文不可核验，且明确含"费用及建议"，无法排除夹带就医建议，按"不确定不纳入"处理'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '提问检查事项，非服务经历'],
  ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '药物反应陈述，无服务维度'],
  ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '以症状、用药与疗效为主，属医学内容；归因依赖父内容'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['cost_and_billing', 'process_and_information'], null, '"心理医院"泛称，无机构归因；费用信息无法归属'],
  ['correct', 'uncertain', 'clear', 'uncertain', ['cost_and_billing'], '武汉市精神卫生中心', '机构与费用维度明确，但无第一人称，无法证明为本人或陪诊经历；维持待复核'],
  ['uncertain', 'not_experience', 'clear', 'exclude', ['staff_interaction'], null, '向他人提问，非服务经历'],
  ['correct', 'firsthand', 'uncertain', 'uncertain', ['staff_interaction'], '北京大学第六医院', '机构明确、本人住院；但正文为漫画图，内容不可核验是否含医学或标识信息，维持待复核'],
  ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '全文围绕药物（奥氮平/曲唑酮/文拉法辛）发胖、断药与换药，属医学内容；归因依赖父内容'],
  ['correct', 'firsthand', 'clear', 'include', ['staff_interaction'], '上海市精神卫生中心', '机构明确、本人就诊；"不想再碰到不好的医生"明确指向医患沟通维度，无医学建议与标识符'],
  ['correct', 'firsthand', 'clear', 'include', ['staff_interaction'], '北京大学第六医院', '机构明确、本人住院；医生态度是明确的服务维度，文中"病友"为泛指，无具体可识别信息'],
  ['correct', 'accompanied', 'clear', 'include', ['staff_interaction', 'environment_and_facilities'], '上海市精神卫生中心', 'R1放宽：父内容为宛平南路600号且无他院线索；陪护孩子住院，护工与封闭病房属服务维度；无姓名、日期或联系方式'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '本人就诊沟通体验，无机构归因'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['process_and_information'], null, '仅陈述天天去医院检查，无机构与服务维度'],
  ['uncertain', 'not_experience', 'clear', 'exclude', ['process_and_information'], null, '询问检查执行方式，非服务经历'],
  ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '对上海精卫为询问意愿，实际经历在湖南；含复发等医学内容'],
  ['incorrect', 'accompanied', 'uncertain', 'exclude', [], null, '家属照护，含诊断、开药与家庭冲突细节；无机构'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['process_and_information'], null, '就诊现场情绪表述，无机构与服务维度'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '泛论，非服务经历'],
  ['correct', 'not_experience', 'clear', 'exclude', [], '武汉市精神卫生中心', '提供院区信息，非就诊经历'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '个人经历故事，无就诊服务维度'],
  ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'process_and_information'], '上海市精神卫生中心', '"600号"即宛平南路600号（机器漏判，已纠正）；本人挂号、抢号难属明确服务维度；开药仅为流程性询问，非疗效叙事'],
  ['incorrect', 'not_experience', 'uncertain', 'exclude', [], null, '家属求助，含母亲诊断与家庭冲突细节；无机构、尚未就医'],
  ['correct', 'not_experience', 'clear', 'exclude', [], '武汉市精神卫生中心', '指向院区的简短回复，非就诊经历'],
  ['incorrect', 'uncertain', 'residual_identifier', 'exclude', ['staff_interaction'], null, '指名道姓指控医生（诸秉根），残留可识别信息且为指控性泛论，非可核服务经历'],
  ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '含更年期诊断结论；无机构'],
  ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '作者对"收广告费"质疑的回应与观点论述，非服务经历']
];

const queue = JSON.parse(readFileSync(QUEUE, 'utf-8'));
if (queue.records.length !== RULINGS.length) {
  throw new Error(`裁定条数(${RULINGS.length})与队列条数(${queue.records.length})不一致`);
}

const records = queue.records.map((r, i) => {
  const [entityDecision, experienceDecision, privacyDecision, aggregationDecision, aspects, correctedInstitution, rationale] = RULINGS[i];
  return {
    reviewId: r.reviewId,
    cohort: r.cohort,
    platform: r.platform,
    proposedInstitution: r.proposedInstitution ?? null,
    adjudicatedInstitution: correctedInstitution ?? null,
    entityDecision,
    experienceDecision,
    privacyDecision,
    aggregationDecision,
    aspects,
    rationale
  };
});

const tally = (key) => records.reduce((acc, r) => {
  acc[r[key]] = (acc[r[key]] ?? 0) + 1;
  return acc;
}, {});

const out = {
  schemaVersion: 1,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  queueId: queue.queueId,
  adjudicatedAt: new Date().toISOString(),
  adjudicatorNote: '第一轮人工裁定（保守口径）：机构归因仅依赖父内容者降为 uncertain；涉及诊断/处方/疗效/治疗建议、残留可识别信息、广告转述或无法证明亲历者一律 exclude。',
  summary: {
    total: records.length,
    aggregation: tally('aggregationDecision'),
    entity: tally('entityDecision'),
    experience: tally('experienceDecision'),
    privacy: tally('privacyDecision'),
    machineMissedAttribution: records.filter((r) => !r.proposedInstitution && r.adjudicatedInstitution).length
  },
  records
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('裁定完成：', JSON.stringify(out.summary, null, 1));
console.log('输出：', OUT);
