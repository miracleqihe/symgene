// 第二批人工裁定应用器：把 batch2（119 条）逐条裁定写盘，供合并器汇总。
// 采用 reviewId 键控，避免与队列顺序错位；缺失条目会在运行时直接报错。
//
// 裁定准则与第一批一致（scripts/atlas/REVIEW-RULES.md v2）：
//   1. 医院归因是否正确         -> entityDecision
//   2. 是否本人/陪诊服务经历     -> experienceDecision
//   3. 涉及哪些非医学服务维度    -> aspects[]
//   4. 是否仍含人名/账号/联系方式/精确轨迹 -> privacyDecision
//   5. 是否可保留为匿名聚合候选  -> aggregationDecision
//
// 本批补充两条执行细则（已写入 REVIEW-RULES.md v3）：
//   H2 最小事实原则：只有"很垃圾/很好/很可怕"这类抽象情绪评价、没有具体服务事实
//      （等待时长、费用金额、流程步骤、窗口或医护行为事件）的记录，一律 exclude。
//   R1 放宽归因：content_context 归因的记录，若①父内容指向目标机构 ②文本有第一人称
//      就诊/住院/挂号动作 ③未提及其他机构或城市 -> entity 判 correct，并标记
//      attributionBasis='parent_context_relaxed'，便于后续单独剔除复核。
//
// 运行：node scripts/atlas/apply-adjudication-batch2.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE = join(ROOT, 'work', 'review-queue-batch2.json');
const OUT = join(ROOT, 'work', 'review-adjudication-batch2.json');

// reviewId -> [entity, experience, privacy, aggregation, aspects, correctedInstitution, rationale, relaxed]
const RULINGS = {
  b2_2fae137859ae0766: ['uncertain', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'staff_interaction', 'process_and_information'], null, '同济与武汉精卫两家机构混叙，主诉在同济，归因无法收敛；含诊断结论（可能精神分裂、中度抑郁、轻度焦虑）、自杀意念与行为与住院建议', false],
  b2_59e94b502d911a5e: ['correct', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing', 'staff_interaction', 'process_and_information', 'continuity_and_follow_up'], '上海市精神卫生中心', '流程记录完整，但含医生诊断结论（轻度抑郁情绪、不足以诊断疾病）与用药方案（连续数月至半年），属医学内容', false],
  b2_bbccb8af984f92e6: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['access_and_wait', 'cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', '含医生姓名（黄某）与开药信息；挂号费用与护士态度虽为服务维度，但标识符不可剥离', false],
  b2_7c5de41c6fec9de0: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction', 'cost_and_billing'], '上海市精神卫生中心', '含两位医生全名（仇某、彭某）与疗效自述（情绪稳定、躯体症状消失）', false],
  b2_8d7898f0dd5efb80: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'staff_interaction', 'process_and_information'], '上海市精神卫生中心', '明确宛平南路600号本人就诊；仅评价导诊台响应、挂号指引与自助图示等前台服务，无诊断处方疗效，无标识符', false],
  b2_edbee1c476e3e637: ['correct', 'accompanied', 'clear', 'include', ['cost_and_billing', 'staff_interaction', 'environment_and_facilities'], '上海市精神卫生中心', 'R1：父内容指向上海精卫徐汇儿童特需；家长陪诊，对比费用、医生耐心度与候诊环境；提及同济仅作对照，无医学建议与标识符', true],
  b2_a0025364b5fde26f: ['correct', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing'], '上海市精神卫生中心', 'R1 成立但涉处方信息（最新进口药、未进医保）与药物副作用诉求，费用与用药不可剥离', true],
  b2_9c8e3f41940bdea2: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['access_and_wait', 'cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', '含医生姓名（杨某）与开药内容；虽有专家号定价与接诊时长等服务维度', false],
  b2_27be15721ecca67c: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'cost_and_billing', 'staff_interaction', 'process_and_information'], '上海市精神卫生中心', '本人初诊全流程叙述（窗口指引错误、候诊2小时、量表自费300元、交费窗口态度），未披露诊断结论、药名或疗效；机构标签明确，无标识符', false],
  b2_757f67fbfde7ef5d: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'staff_interaction', 'process_and_information'], '上海市精神卫生中心', '明确宛平南路600号本人就诊；投诉候诊时长、前台态度与取药无袋；提及六院仅为对照，无诊断疗效与标识符', false],
  b2_d7654dcad3157b6b: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['access_and_wait', 'cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', '含医生姓名（卢某）与确诊、用药及心理治疗建议', true],
  b2_d35c14b0ccca260e: ['uncertain', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing'], null, '主诉为老家与四川医院疗效对比（药全换、快好了），含换药与疗效判断；上海归属仅由父内容推断', false],
  b2_d7059b0c60fa774a: ['correct', 'not_experience', 'clear', 'exclude', ['environment_and_facilities'], '上海市精神卫生中心', '机构宣传式探访文案（WHO 合作中心、特色治疗、交通指南、欢迎留言），非本人或陪诊服务经历', false],
  b2_7dbe910a1c361be1: ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '跨机构（第二人民医院/上海/无锡精卫），上海段仅为吃了一段时间药，含用药与疗效表述', false],
  b2_5c738fbaf6c5186a: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction', 'environment_and_facilities'], '武汉市精神卫生中心', 'R1：父内容指向武汉精卫；本人住院，陈述护理沟通方式、约束处置流程与伙食；无诊断处方内容，无标识符', true],
  b2_de684a6773b3871c: ['uncertain', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing'], null, '跨机构（无锡确诊），含重度抑郁诊断；上海归属仅由父内容推断，且核心为就诊冲突', false],
  b2_2748417d1ef04d51: ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'environment_and_facilities'], null, '仅称精神病院，机构归因不明确；涉封闭式病房体罚与约束等高风险披露', false],
  b2_d908e165fabbcdba: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', '明确宛平南路600号本人就诊；诉求为专家号费用700元与普通号不可得；换药仅为就诊行为叙述，未披露药名剂量疗效，无标识符', false],
  b2_b0990d3a771fd094: ['uncertain', 'accompanied', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing'], null, '跨机构（南京两次住院），含妄想幻听等诊断披露；上海归属不明确', false],
  b2_b84dd0a4401aa053: ['uncertain', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'staff_interaction'], null, '主诉为推荐北京华科精神心理医院，对六院仅一句挂号难与态度好，服务事实过简且有他院引流倾向', false],
  b2_caba6b26b1ac978c: ['correct', 'accompanied', 'clear', 'include', ['staff_interaction', 'environment_and_facilities'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；家长陪诊，陈述成人全封闭病房护工与医生表现；无医学内容，年龄不构成标识符', true],
  b2_ebfedabec09ff951: ['uncertain', 'firsthand', 'clear', 'exclude', ['access_and_wait', 'cost_and_billing'], null, '精卫为泛称，归因不确定；水平与没人懂属医疗质量与疗效判断', false],
  b2_97b730a3a16aa633: ['uncertain', 'uncertain', 'clear', 'exclude', ['access_and_wait', 'continuity_and_follow_up'], null, '提问他人复诊预约情况，本人服务经历陈述不完整，无法核实', false],
  b2_1777cc25f24cb073: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'self_reported_outcome'], '上海市精神卫生中心', '含具体药物（喹硫平）、换药过程、病情复发与自杀意念，属医学与高风险披露', false],
  b2_17b474187949928f: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人取药环节服务体验（窗口态度、无取药袋、安保协助），无医学内容与标识符', true],
  b2_b7936bf3b175ba1d: ['correct', 'accompanied', 'residual_identifier', 'exclude', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', '含医生姓名（陆某）与开药、药物副作用内容', true],
  b2_5c25a4fa73ca1807: ['correct', 'accompanied', 'clear', 'include', ['access_and_wait', 'continuity_and_follow_up'], '上海市精神卫生中心', '明确宛平南路600号；家长陪诊，陈述检查、开药与心理咨询排不上队；核心为服务可及性，未披露药名剂量疗效', false],
  b2_17fd4f3416bc5638: ['correct', 'firsthand', 'clear', 'exclude', ['self_reported_outcome'], '北京大学第六医院', '跨机构对比且含吃着有效果等疗效判断与开药内容', false],
  b2_e463d196999a5401: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], '武汉市精神卫生中心', '含医生诊断结论（中度抑郁）与开药，虽主诉为问诊时长短与敷衍', true],
  b2_89ae402d7fc90ea7: ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '主体为回龙观医院与天津安定，非目标机构', false],
  b2_c62e64bddd36233d: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['cost_and_billing', 'staff_interaction'], '武汉市精神卫生中心', '含两位医生姓名（白某、朱某）与开药、药效副作用（头疼）', true],
  b2_692e38c6ba209a5d: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['access_and_wait', 'process_and_information'], '上海市精神卫生中心', '含医生姓名（章某）', true],
  b2_8ec78936bb3ff8b0: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '询问他人推荐医生，本人未就诊；含家属诊断与药物副作用，属医学内容', false],
  b2_bed0031892a04a08: ['uncertain', 'not_experience', 'clear', 'exclude', ['cost_and_billing'], null, '对避雷帖的评论与一般性争论，非本人服务经历陈述', false],
  b2_b5b40430b9e16913: ['correct', 'firsthand', 'clear', 'exclude', ['self_reported_outcome'], '北京大学第六医院', '含误诊、用药（抗抑郁药）、转躁等医学与疗效内容', false],
  b2_baa4a8b21bc6f24b: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction', 'environment_and_facilities'], '北京大学第六医院', 'R1：父内容指向北大六院；本人住院，评价医护态度与病区氛围；无诊断处方内容，无标识符', true],
  b2_a1c5c80f6b5a2ea4: ['correct', 'accompanied', 'clear', 'exclude', ['staff_interaction'], '北京大学第六医院', '陪护家属，含封闭住院与恢复逻辑思维等病情疗效表述，服务维度过简', true],
  b2_2042697f36ac443f: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '询问他人经验，含孩子诊断与住院建议，属医学内容且非本机构服务经历陈述', false],
  b2_f8f96dc801a0ef8d: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人就诊，评价医生共情与沟通态度；未出现医生姓名，无医学内容', true],
  b2_7e16237de415abe2: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'cost_and_billing'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人就诊，陈述闵行分院与宛平南路院区挂号可得性与费用差异，无医学内容', true],
  b2_1b8d618f93668746: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；明确上海宛平南路本人就诊，评价医生态度，无医学内容与标识符', true],
  b2_4ad6d44feb459db6: ['correct', 'firsthand', 'clear', 'include', ['environment_and_facilities'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人住院，陈述病区环境与管理氛围，无诊断处方', true],
  b2_64dadf92b964ab4a: ['uncertain', 'uncertain', 'clear', 'exclude', ['access_and_wait'], null, '仅询问线上挂号后线下是否拖晚，不构成服务经历陈述', false],
  b2_1efbe04c7599e6d0: ['uncertain', 'uncertain', 'clear', 'exclude', ['cost_and_billing'], null, '询问住院费用，本人尚未住院；含医生住院建议，属医学内容', false],
  b2_e4c9b056140c1e1f: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['process_and_information'], '上海市精神卫生中心', '含医生姓氏（姓粟）与开错药、剂量等处方内容', true],
  b2_57ff7110a4c563b5: ['correct', 'accompanied', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', '涉管制药品开具与代持，属处方与合规风险内容，不宜匿名聚合', true],
  b2_94155a9259e1ef23: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction'], '上海市精神卫生中心', '含医生姓氏与就诊年份（09年焦医生），可缩小识别范围', true],
  b2_8d9aeb9c11b19816: ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '主体为闵行区华山医院，非目标机构', false],
  b2_18e66116f243b620: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人就诊，陈述特需号300元与问诊不足2分钟；医生为匿名表述，无诊断疗效', true],
  b2_c3488661a7b51f9b: ['uncertain', 'uncertain', 'clear', 'exclude', ['access_and_wait'], null, '询问院区与医生推荐，非服务经历陈述', false],
  b2_0ccdac160aa3aaef: ['correct', 'accompanied', 'clear', 'include', ['access_and_wait', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；家属代为现场挂号，陈述首诊须线下办理，无医学内容与标识符', true],
  b2_c8438d7fdbc56587: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction'], '上海市精神卫生中心', '含医生姓名（已脱敏）并作推荐', true],
  b2_4f508e46a8ef0349: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction'], '上海市精神卫生中心', '含医生姓名（乔某）', true],
  b2_cafc187f22fffd36: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '语义不完整片段，机构与服务维度均无法判断', false],
  b2_1a9b2d06415f310e: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', '含部分打码医生名（陈某），且通篇为医患冲突与个人维权叙述，属高风险个人披露', false],
  b2_68e1d258fdb9c7d4: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', '含医生姓名（范某）、诊断结论、住院建议与童年创伤披露', false],
  b2_e5ab74c929192b6e: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'staff_interaction', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人复诊取药，陈述叫号节奏、接诊时长、医生不耐烦与挂错号处置；未披露药名、剂量、诊断或疗效', true],
  b2_0bf4bf4cd1284bce: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], '武汉市精神卫生中心', '含量表、住院建议、开药近千元与自行停药，属医学内容；六角亭虽指向明确但医学信息不可剥离', true],
  b2_e37b0d596182541d: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction'], '上海市精神卫生中心', '涉医生对患者预后与职业可能性的否定性判断，属诊疗内容；另含家属沟通场景', true],
  b2_a13dfa313a0356cd: ['uncertain', 'accompanied', 'clear', 'exclude', [], null, '本人尚未就诊，仅咨询六角亭医生推荐；含母亲诊断与用药三年，属医学内容', false],
  b2_0fd657b306c18e6c: ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '主体为瑞金医院，非目标机构', false],
  b2_83f740a662478d08: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '与精神科就诊无关的城市生活叙述，无服务经历', false],
  b2_7230df6ef3b6ee79: ['correct', 'firsthand', 'clear', 'include', ['cost_and_billing', 'staff_interaction', 'continuity_and_follow_up'], '上海市精神卫生中心', '明确宛平南路600号本人复诊；投诉每次仅简短复述近况配药仍逐次收取咨询费；未披露药名、诊断或疗效', false],
  b2_b24c5d435cd6b983: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '去了十几年未指明机构；含药物镇静作用等疗效表述与自我疏导建议', false],
  b2_1022ad746be60cdc: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '语义零散，机构与服务维度均无法确认', false],
  b2_f707603111da5d55: ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '主体为中南医院，非目标机构', false],
  b2_c6bec4ab3b5b34f9: ['incorrect', 'accompanied', 'clear', 'exclude', ['continuity_and_follow_up'], null, '主体为安定医院（北京），非目标机构', false],
  b2_d078ec6d102f9178: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '尚未就诊，仅征询北大六院是否合适；涉其他医院转诊建议', false],
  b2_e10f49ac08f44b44: ['correct', 'firsthand', 'clear', 'exclude', ['environment_and_facilities'], '上海市精神卫生中心', '含没有一点治疗效果、反而加重等疗效判断，属医学内容；虽涉未成年病区床位分配', true],
  b2_61cbf1a01bedd7cd: ['incorrect', 'accompanied', 'clear', 'exclude', ['access_and_wait'], null, '主体为武汉市第一医院（盘龙院区），非目标机构；含产后抑郁诊断', false],
  b2_16a21a92e781dc98: ['correct', 'firsthand', 'clear', 'exclude', ['cost_and_billing', 'staff_interaction'], '上海市精神卫生中心', '含医生给出的治疗建议与检查处置，属医学内容；虽有25元普通号费用与时长对比', true],
  b2_50f080e1ba558290: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '询问药物起效时间与是否服用，属用药咨询，非服务经历', false],
  b2_a429116f7a5e980a: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '请求帖主提供医生信息，非本人服务经历', false],
  b2_557d3d7fdc288903: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '尚未就诊，仅征询就医建议与目标机构选择', false],
  b2_e6b5f668eff79bc8: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '主体为东方医院，非目标机构；一般性医疗水平比较', false],
  b2_cab62c50351e74cd: ['uncertain', 'accompanied', 'clear', 'exclude', [], null, '尚未住院；含母亲诊断与住院建议，属医学内容', false],
  b2_94b3415ddb41b8fb: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '与就诊无关的家庭生活评论', false],
  b2_dfd15581da1c51ca: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '家庭决策倾诉，无机构服务经历陈述', false],
  b2_4040b0cdf788a671: ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '上海的医院去过四五家，归因泛化；含直接开药与检查，涉医学内容', false],
  b2_017a03cfc7566de8: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction', 'process_and_information'], '武汉市精神卫生中心', '含自杀意念与医生据此判断病情，属高风险与医学内容', true],
  b2_f10ded8cce416fc7: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '与就诊无关的城市生活评论', false],
  b2_6a1d66ce5e0ffc13: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '对交通路线视频的评论，无服务经历', false],
  b2_e941f58cabb27227: ['uncertain', 'accompanied', 'clear', 'exclude', [], null, '家属住院决策倾诉，涉病情与住院状态，无服务维度', false],
  b2_ac4ed9c467d96472: ['uncertain', 'not_experience', 'residual_identifier', 'exclude', [], null, '澄清他人所指医生，含医生姓名（李某、陈），非服务经历陈述', false],
  b2_8f8dae5a426f0b9e: ['uncertain', 'uncertain', 'clear', 'exclude', ['access_and_wait'], null, '放号时间讨论，本人服务经历不完整', false],
  b2_a784d44d5662d53f: ['correct', 'accompanied', 'residual_identifier', 'exclude', ['access_and_wait'], '上海市精神卫生中心', '含医生姓名（徐某）与孩子厌学等病情表述', true],
  b2_b65bf87a5fb559bc: ['correct', 'firsthand', 'clear', 'include', ['continuity_and_follow_up', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人就诊后被转介至外部心理咨询机构，属服务衔接与可及性；未披露药名、诊断或疗效', true],
  b2_9ddff8182dee767f: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '主体为交大与四医大派系医生，非目标机构；无服务经历', false],
  b2_e83ece94c849bb01: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'staff_interaction'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；明确宛平南路本人就诊体验差且已改约闵行院区专家号，无医学内容与标识符', true],
  b2_9458717ed0d608f2: ['incorrect', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '主体为安定医院，非目标机构；含用药建议', false],
  b2_ddb5b60417efbc11: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '与就诊无关的评论', false],
  b2_61ccc36ef5086975: ['uncertain', 'accompanied', 'clear', 'exclude', ['staff_interaction'], null, '归因不明确；含未看诊即让去拿药的处方式叙述，服务事实亦过简', false],
  b2_547303946e99bcfe: ['uncertain', 'not_experience', 'residual_identifier', 'exclude', ['access_and_wait'], null, '询问他人医生排班，含医生姓氏（彭医生）；非服务经历陈述', false],
  b2_623b063112c764db: ['uncertain', 'firsthand', 'clear', 'exclude', ['staff_interaction'], null, '评价医生人品但无具体服务事实，机构与服务场景不明确', false],
  b2_fcd9cd18cb8d546d: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '片段式陈述，无服务维度；涉住院状态', false],
  b2_28624493f12343bb: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '尚未就诊，仅表示打算带妹妹前往', false],
  b2_9481f9ac1abe2631: ['uncertain', 'not_experience', 'clear', 'exclude', [], null, '咨询可否前往治疗，非服务经历', false],
  b2_c266886f3007899a: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '片段式，机构与服务维度无法确认', false],
  b2_0408b7a6ee944658: ['correct', 'firsthand', 'clear', 'include', ['access_and_wait', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；明确闵行院区初诊挂号后未触发缴费的流程疑问，无医学内容与标识符', true],
  b2_2bfa17bfbc27c1e3: ['correct', 'firsthand', 'clear', 'include', ['staff_interaction', 'process_and_information'], '上海市精神卫生中心', 'R1：父内容指向上海精卫；本人就诊，陈述医生未做沟通直接安排量表测评，无医学内容与标识符', true],
  b2_a27318ae45894af3: ['correct', 'firsthand', 'clear', 'exclude', ['staff_interaction'], '武汉市精神卫生中心', '心理门诊就诊表述模糊，仅一句医生评价，无实质服务事实（H2）', true],
  b2_f648a3b721577f37: ['correct', 'firsthand', 'residual_identifier', 'exclude', ['staff_interaction'], '上海市精神卫生中心', '含医生姓名（杜某）与转诊建议', true],
  b2_ed63228df4548c97: ['incorrect', 'not_experience', 'clear', 'exclude', [], null, '与就诊无关的推荐流评论', false],
  b2_aee027231a1e116d: ['correct', 'firsthand', 'clear', 'include', ['environment_and_facilities'], '北京大学第六医院', 'R1：父内容指向北大六院；本人住院，陈述临床心理科病区管理宽松程度，无医学内容与标识符', true],
  b2_17abfae5916caee3: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅去过也很差的抽象评价，无具体服务事实（H2）', false],
  b2_cc8ab7c4441f9536: ['uncertain', 'uncertain', 'clear', 'exclude', [], null, '片段式，机构与服务维度无法确认', false],
  b2_a4050a49927d476f: ['correct', 'firsthand', 'clear', 'exclude', ['environment_and_facilities'], '北京大学第六医院', '仅感谢遇到好病友，属病友关系而非机构服务维度，服务事实不足（H2）', true],
  b2_ccb21bee5034d7e3: ['uncertain', 'firsthand', 'residual_identifier', 'exclude', [], null, '含医生姓名（于某）', false],
  b2_c078ff8ca3c83af6: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅好可怕的情绪化抽象评价，无具体服务事实（H2）', false],
  b2_aa1f9a3b2c554162: ['uncertain', 'firsthand', 'clear', 'exclude', ['environment_and_facilities'], null, '源深院区归属与就诊场景均不明确，无实质服务事实', false],
  b2_edbca54f422d7aca: ['uncertain', 'uncertain', 'clear', 'exclude', ['cost_and_billing'], null, '询问费用，非服务经历陈述', false],
  b2_e20b1384be5ba7e5: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅很垃圾的抽象评价，无具体服务事实（H2）', false],
  b2_f682c38df92558a4: ['uncertain', 'uncertain', 'clear', 'exclude', ['cost_and_billing'], null, '费用疑问片段，无服务经历', false],
  b2_91f7c24ea50a35e7: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '涉住院医学建议，无服务维度', false],
  b2_b9127fb7b3432097: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅说徐汇区很好的抽象评价，无具体服务事实（H2）', false],
  b2_d9509f33a40e75d8: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅也就这样的抽象评价，无具体服务事实（H2）', false],
  b2_3d382ba959af72ed: ['uncertain', 'firsthand', 'clear', 'exclude', [], null, '仅说明所挂科室，无服务维度', false],
  b2_daee453c9b9c53cc: ['correct', 'firsthand', 'clear', 'exclude', [], '北京大学第六医院', '仅我住的北大六院一句，无服务维度与具体事实（H2）', false],
  b2_5f68f15ace7ac965: ['correct', 'firsthand', 'clear', 'exclude', [], '北京大学第六医院', '仅我去的北大六院一句，无服务维度与具体事实（H2）', false]
};

const queue = JSON.parse(readFileSync(QUEUE, 'utf-8'));
const ids = new Set(queue.records.map((r) => r.reviewId));
const missing = queue.records.filter((r) => !RULINGS[r.reviewId]).map((r) => r.reviewId);
const extra = Object.keys(RULINGS).filter((id) => !ids.has(id));
if (missing.length) throw new Error(`缺少裁定：${missing.join(', ')}`);
if (extra.length) console.warn('警告：存在队列中没有的裁定条目：', extra.join(', '));

const records = queue.records.map((r) => {
  const [entityDecision, experienceDecision, privacyDecision, aggregationDecision, aspects, correctedInstitution, rationale, relaxed] = RULINGS[r.reviewId];
  return {
    reviewId: r.reviewId,
    cohort: r.cohort,
    batch: 'batch2',
    platform: r.platform,
    proposedInstitution: r.proposedInstitution ?? null,
    adjudicatedInstitution: correctedInstitution ?? null,
    attributionBasis: relaxed ? 'parent_context_relaxed' : (r.machine.matchMethod === 'direct' ? 'direct_text' : 'parent_context'),
    entityDecision,
    experienceDecision,
    privacyDecision,
    aggregationDecision,
    aspects,
    rationale,
    text: r.text
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
  adjudicatorNote: '第二批人工裁定（119 条）。沿用 REVIEW-RULES v2 的医学硬排除与标识符硬排除，新增 H2 最小事实原则（抽象情绪评价不入聚合）与 R1 放宽归因（父内容指向 + 第一人称就诊动作 + 无他院线索者判 correct 并标记 attributionBasis）。',
  summary: {
    total: records.length,
    aggregation: tally('aggregationDecision'),
    entity: tally('entityDecision'),
    experience: tally('experienceDecision'),
    privacy: tally('privacyDecision'),
    relaxedAttribution: records.filter((r) => r.attributionBasis === 'parent_context_relaxed').length
  },
  records
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('第二批裁定完成：', JSON.stringify(out.summary, null, 1));
const byInst = {};
for (const r of records.filter((r) => r.aggregationDecision === 'include')) {
  byInst[r.adjudicatedInstitution] = (byInst[r.adjudicatedInstitution] ?? 0) + 1;
}
console.log('纳入聚合分机构：', JSON.stringify(byInst));
console.log('输出：', OUT);
