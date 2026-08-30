import { handbookDrugs } from './handbookDrugs.js';
import { expandedCases, expandedDisorders } from './expandedKnowledge.js';
import { comprehensiveCases, comprehensiveDisorders } from './comprehensiveKnowledge.js';
import { supplementalCases, supplementalDisorders } from './supplementalKnowledge.js';

const clinicalSource = '依据《Kaplan and Sadock’s Comprehensive Textbook of Psychiatry》（2024）与《精神疾病案例诊疗思路》第 3 版相关章节整理；面向公众改写，不保留页码。';
const caseSource = '依据《精神疾病案例诊疗思路》第 3 版的评估与案例框架改写；为教学性合成案例，不对应任何真实个人。';

export const seedData = {
  drugs: [],
  disorders: [
    {
      id: 'depression', name: '抑郁障碍', aliases: ['重性抑郁障碍', '抑郁发作', 'MDD'], category: '心境障碍',
      summary: '持续的低落、兴趣或愉悦感下降是核心，常伴睡眠、食欲、精力、注意和自我评价变化，并造成学习、工作或关系功能下降。',
      details: '评估不能只看“心情不好”，还要看症状是否成组出现、持续多久、与平时相比变化多大，以及是否存在躁狂/轻躁狂史、物质或躯体因素。抑郁可以单次出现，也可能反复发作，残留症状和共病焦虑会影响恢复。',
      symptoms: ['情绪低落或易激惹', '兴趣和愉悦感明显减少', '疲乏、动作或思考变慢', '睡眠或食欲改变', '注意力下降、内疚或无价值感'],
      patientPhrases: ['什么都不想做', '以前喜欢的事也没兴趣', '每天都很累', '长期都很累', '不想见人', '早醒后再也睡不着', '觉得自己没有价值', '脑子像生锈一样'],
      courseClues: ['连续数周以上', '早晚变化或晨重夜轻', '既往有类似发作或家族史', '压力事件后加重但不一定由事件单独解释'],
      functionalImpact: ['缺勤、学习效率下降', '停止社交和自我照料', '工作速度和决策能力下降'],
      assessment: ['询问持续时间、核心症状和功能变化', '主动筛查自伤/轻生想法、计划、手段和保护因素', '核对躁狂/轻躁狂、物质、药物及躯体疾病史'],
      differentials: ['双相抑郁', '持续性抑郁障碍', '焦虑或创伤相关障碍', '甲状腺疾病、贫血、睡眠障碍等躯体因素'],
      treatmentOverview: ['心理治疗、生活节律和社会支持是重要组成部分', '药物、物理治疗或联合方案需由专业人员根据严重程度选择', '复发风险、依从性和早期激越需要持续随访'],
      emergencySignals: ['出现明确自杀计划或正在准备', '无法保证自身安全', '伴精神病性体验、极度激越或拒绝进食饮水'],
      relatedDrugIds: ['sertraline', 'fluoxetine', 'escitalopram', 'venlafaxine', 'duloxetine', 'mirtazapine', 'bupropion'], source: clinicalSource
    },
    {
      id: 'persistent-depression', name: '持续性抑郁障碍', aliases: ['心境恶劣障碍', '慢性抑郁', 'PDD'], category: '心境障碍',
      summary: '低落、悲观、疲乏或自我否定长期存在，强度未必总是很高，却像背景一样持续并侵蚀生活质量。',
      details: '长期“习惯性不开心”也值得评估。需要了解起始年龄、是否有重性抑郁发作叠加、睡眠/食欲和自我评价，以及症状对工作和关系的累积影响。',
      symptoms: ['长期低落或悲观', '精力不足', '自我评价低', '难以集中注意', '对未来缺少希望'],
      patientPhrases: ['我一直就是这样', '没有特别难过但总觉得没劲', '从学生时代就不自信', '好像看不到以后会变好'],
      courseClues: ['持续多年而非几天几周', '可能有间歇性加重', '起病早时常被误认为性格问题'],
      functionalImpact: ['长期低效、回避挑战', '关系中缺乏表达和期待', '自我照料和休闲活动减少'],
      assessment: ['画出症状时间线并区分基线与加重期', '询问既往躁狂/轻躁狂、创伤、物质和躯体因素', '评估绝望感和自伤风险'],
      differentials: ['重性抑郁障碍', '双相障碍', '回避型人格特征', '甲状腺功能异常或长期睡眠不足'],
      treatmentOverview: ['长期心理治疗和行为激活常用于改善功能', '药物是否需要、如何维持由专业人员评估', '目标应包括复学/复工、关系和生活节律'],
      emergencySignals: ['绝望感快速加重', '出现自伤想法或不能照顾自己'], relatedDrugIds: ['sertraline', 'fluoxetine', 'escitalopram', 'duloxetine'], source: clinicalSource
    },
    {
      id: 'bipolar', name: '双相障碍', aliases: ['双相情感障碍', '躁郁症', '双相 I/II 型'], category: '心境障碍',
      summary: '抑郁期与躁狂或轻躁狂期交替出现，情绪、精力、睡眠需求、思维速度和冲动控制发生成段变化。',
      details: '躁狂并不只是“状态好”，而是与平时明显不同并影响判断或功能的持续高涨/易激惹状态；轻躁狂可能被当作效率提升。诊断思路要把每次发作的起止、睡眠需求、行为后果和药物/物质暴露放在同一条时间线上。',
      symptoms: ['睡眠需求显著减少却不觉得困', '语速快、思维奔逸', '夸大、自信过度或易怒', '冲动消费、投资、性行为或冒险', '抑郁期的低落、迟滞或绝望'],
      patientPhrases: ['几天不睡也特别有劲', '脑子停不下来', '我能同时做很多项目', '花钱停不住', '家人说我像变了一个人'],
      courseClues: ['发作性而非每天同样', '家属常比本人更早发现改变', '抗抑郁药后激越/失眠或既往躁狂史需重视', '家族中有双相或自杀史'],
      functionalImpact: ['财务、职业和人际后果', '冲动行为导致法律或身体风险', '抑郁期自我照料和工作能力下降'],
      assessment: ['分别询问躁狂、轻躁狂和抑郁发作的起止时间', '核对睡眠需求、冲动行为、物质使用和药物诱发可能', '评估当前自伤、他伤、走失和财务风险'],
      differentials: ['重性抑郁障碍伴激越', '注意缺陷多动障碍', '物质/药物诱发状态', '甲状腺疾病和精神分裂症谱系障碍'],
      treatmentOverview: ['稳定睡眠-觉醒节律和减少刺激是基础支持', '心境稳定剂、抗精神病药或其他方案需专科决定', '维持治疗、复发预警计划和家属参与很重要'],
      emergencySignals: ['持续不眠并出现危险冲动', '有伤人/自伤想法、严重妄想或无法管理财务', '躁狂伴意识混乱、极度激越或拒绝进食饮水'],
      relatedDrugIds: ['lithium', 'valproate', 'carbamazepine', 'lamotrigine', 'quetiapine', 'olanzapine', 'aripiprazole'], source: clinicalSource
    },
    {
      id: 'cyclothymic', name: '环性心境障碍', aliases: ['环性情绪障碍', '环性气质相关障碍'], category: '心境障碍',
      summary: '长期反复出现轻度抑郁和轻躁狂样波动，但不一定达到完整发作的强度，情绪起伏仍可能影响关系、计划和稳定性。',
      details: '重点是持续的波动模式，而不是某一天的情绪。需要确认是否存在完整躁狂/抑郁发作、物质因素和其他人格或焦虑特征，并关注波动是否造成实际功能受损。',
      symptoms: ['一段时间精力高、睡得少', '随后低落、拖延或失去兴趣', '情绪反应明显且反复', '计划和关系难以维持'],
      patientPhrases: ['我总是一阵一阵的', '状态好的时候什么都想做', '过几天又完全不想动', '家人不知道该怎么跟我相处'],
      courseClues: ['波动持续较长时间', '高低状态常未达到完整发作标准', '压力、睡眠紊乱或物质会放大波动'],
      functionalImpact: ['项目反复启动又放弃', '关系冲突和自我评价不稳定'],
      assessment: ['用月/年为单位回顾情绪、睡眠和活动变化', '排查双相 I/II、物质和 ADHD', '评估自伤与冲动风险'],
      differentials: ['双相 II 型', '持续性抑郁障碍', '边缘型人格障碍', '物质诱发的情绪波动'],
      treatmentOverview: ['规律作息、情绪记录和心理治疗可帮助识别触发因素', '药物方案需根据是否出现完整发作和共病谨慎决定'],
      emergencySignals: ['波动升级为持续不眠、危险冲动或严重绝望'], relatedDrugIds: ['lithium', 'lamotrigine', 'quetiapine'], source: clinicalSource
    },
    {
      id: 'schizophrenia', name: '精神分裂症谱系障碍', aliases: ['精神病性障碍', '思觉失调症', 'schizophrenia'], category: '精神分裂症及其他妄想障碍',
      summary: '可能出现幻觉、妄想、思维/言语紊乱、动力下降、认知困难和社会功能改变，表现与恢复速度存在个体差异。',
      details: '“听到声音”或坚信被监视等体验对当事人是真实而痛苦的。沟通时先确认安全、睡眠、物质和躯体因素，不以争辩来解决体验；早期识别、持续治疗、家庭支持和功能康复共同影响恢复。',
      symptoms: ['听见评论或对话样声音', '坚信被害、监视或特殊使命', '言语离题或思维难以跟随', '动力、情感表达和社交减少', '注意、记忆和执行功能下降'],
      patientPhrases: ['有人在议论我', '电视在给我传暗号', '脑子里有声音', '出门会被跟踪', '我已经很久没法工作'],
      courseClues: ['可能有逐渐退缩、睡眠改变和自我照料下降的前驱期', '症状常持续并影响多个生活领域', '物质使用、睡眠剥夺和躯体疾病可加重'],
      functionalImpact: ['学习/工作中断', '社交退缩和居住不稳定', '卫生、饮食和就医依从性下降'],
      assessment: ['记录症状开始、频率、确信程度和功能影响', '筛查自伤、他伤、被害相关防御行为和自我照料能力', '排查物质、药物、神经系统和情绪障碍相关精神病性症状'],
      differentials: ['双相或抑郁障碍伴精神病性症状', '妄想障碍', '物质/药物诱发精神病', '谵妄、癫痫或其他神经系统疾病'],
      treatmentOverview: ['抗精神病药、心理社会干预、家庭教育和康复支持需要协作', '治疗目标包括症状、睡眠、功能、躯体健康和复发预警'],
      emergencySignals: ['命令性声音要求自伤/伤人', '因被害体验携带武器或准备攻击', '极度混乱、数日不眠、拒绝饮水进食或无法独处'],
      relatedDrugIds: ['risperidone', 'olanzapine', 'quetiapine', 'aripiprazole', 'paliperidone', 'clozapine', 'haloperidol'], source: clinicalSource
    },
    {
      id: 'delusional-disorder', name: '妄想障碍', aliases: ['持续性妄想障碍', '被害妄想/嫉妒妄想相关状态'], category: '精神分裂症及其他妄想障碍',
      summary: '以一种或数种相对固定的妄想为主，整体言语和日常功能可能较精神分裂症保留，但围绕妄想的行为仍可能造成严重风险。',
      details: '不要只按内容判断真假，而要观察确信程度、证据解释方式、持续时间、情绪和行为后果。评估需包括物质、神经系统、视听障碍和情绪发作。',
      symptoms: ['被害、关系、嫉妒、躯体或夸大主题的固定信念', '围绕信念反复查证、跟踪或投诉', '其他领域的言语和功能相对保留'],
      patientPhrases: ['邻居一直在监视我', '伴侣肯定背叛了我', '身体里有东西在移动', '我必须找到证据'],
      courseClues: ['信念持续且难以被反证改变', '情绪和行为风险取决于妄想主题', '常见于中晚年或伴感觉功能下降者'],
      functionalImpact: ['家庭冲突、诉讼或工作关系破裂', '反复就医或检查', '因防御行为带来安全风险'],
      assessment: ['区分信念、担忧、强迫观念和文化/宗教信念', '了解是否有幻觉、思维紊乱和认知下降', '评估潜在被指向者及现实中的冲突风险'],
      differentials: ['精神分裂症', '强迫症的缺乏自知力表现', '躯体症状障碍', '痴呆或物质诱发状态'],
      treatmentOverview: ['建立不对抗的沟通关系并处理实际安全问题', '药物和心理社会干预需专业评估，必要时联络家属和社区资源'],
      emergencySignals: ['针对特定对象的威胁、跟踪或攻击准备', '命令性体验或严重自我忽视'], relatedDrugIds: ['risperidone', 'olanzapine', 'aripiprazole'], source: clinicalSource
    },
    {
      id: 'substance-induced-psychosis', name: '物质/药物所致精神病性障碍', aliases: ['物质诱发精神病', '兴奋剂相关精神病'], category: '物质所致精神障碍',
      summary: '幻觉、妄想或思维紊乱与物质使用、戒断或药物暴露在时间上相关，停止暴露后仍需观察是否持续或转为其他障碍。',
      details: '不能把所有精神病性体验都归咎于“吸了东西”，也不能忽略物质线索。时间线、剂量、混用、睡眠和既往无物质时的状态是关键。',
      symptoms: ['使用后出现被害、兴奋、幻听或严重失眠', '戒断期焦虑、震颤、出汗或意识改变', '症状与物质暴露时间密切相关'],
      patientPhrases: ['用了之后几天没睡', '停下来就发抖和害怕', '我不知道哪些是真的', '最近一直在混着用'],
      courseClues: ['症状随使用/戒断而波动', '混用或高剂量风险更高', '既往无物质时的精神病史需要单独核对'],
      functionalImpact: ['失控使用、事故和法律风险', '无法工作或照料自己'],
      assessment: ['以非评判方式询问物质种类、剂量、时间和最后一次使用', '筛查谵妄、过热、癫痫、呼吸抑制和戒断风险', '需要时进行躯体和毒物学评估'],
      differentials: ['原发性精神病性障碍', '双相躁狂伴精神病性症状', '谵妄或脑器质性疾病'],
      treatmentOverview: ['优先处理中毒/戒断和生命安全，再评估残留精神症状', '物质使用障碍需要持续的心理社会治疗和复发预防'],
      emergencySignals: ['意识混乱、抽搐、高热、胸痛、呼吸变慢', '自伤/伤人风险或无法保持清醒'], relatedDrugIds: ['haloperidol', 'lorazepam', 'buprenorphine-naloxone', 'methadone'], source: clinicalSource
    },
    {
      id: 'gad', name: '广泛性焦虑障碍', aliases: ['GAD', '持续性过度担忧'], category: '神经症及癔症',
      summary: '对多个生活领域长期、难以控制地担忧，伴坐立不安、肌肉紧张、疲劳、易怒、注意困难或睡眠问题。',
      details: '焦虑不是单一事件的短暂紧张，而是担忧范围广、控制困难且持续影响生活。需区分对现实问题的合理担忧与超出情境的灾难化预期，并排查甲状腺、咖啡因、药物和睡眠因素。',
      symptoms: ['难以停止担忧', '坐立不安或处于警觉状态', '肌肉紧张、头痛、胃肠不适', '易疲劳、易怒、失眠'],
      patientPhrases: ['脑子一直在想最坏结果', '明明没发生什么也放松不了', '肩颈一直绷着', '晚上反复想工作和家人的事'],
      courseClues: ['担忧跨越家庭、健康、工作、财务等多个主题', '症状长期存在并反复加重', '压力、咖啡因和睡眠不足会放大'],
      functionalImpact: ['反复确认、拖延和回避', '工作效率下降、关系中需要过度保证'],
      assessment: ['确定担忧的范围、可控性、躯体症状和持续模式', '筛查抑郁、惊恐、强迫、创伤、物质和躯体原因'],
      differentials: ['抑郁障碍', '惊恐障碍', '强迫症', '甲状腺疾病、心律问题或兴奋剂/咖啡因影响'],
      treatmentOverview: ['认知行为治疗、担忧暴露和睡眠节律是常见支持', '药物选择需结合共病、起效时间和依赖风险'],
      emergencySignals: ['焦虑伴胸痛、晕厥、严重呼吸困难等需先排查急性躯体疾病', '伴自伤想法或无法维持基本功能'], relatedDrugIds: ['sertraline', 'escitalopram', 'venlafaxine', 'duloxetine', 'buspirone'], source: clinicalSource
    },
    {
      id: 'panic', name: '惊恐障碍', aliases: ['惊恐发作', 'panic disorder'], category: '神经症及癔症',
      summary: '反复突发强烈恐惧或不适，伴心悸、胸闷、呼吸困难、眩晕、发抖或失控感，并因担心再次发作而回避。',
      details: '发作时的身体感受是真实的，但首次或表现异常时需先排除心肺、内分泌、神经系统和物质因素。重点看是否有持续的预期焦虑和行为改变，而非一次孤立的惊恐发作。',
      symptoms: ['突然心慌、胸闷、窒息感', '头晕、发抖、出汗、麻木', '害怕死亡、失控或发疯', '反复检查身体或回避场所'],
      patientPhrases: ['像要死了一样', '突然喘不上气', '不敢再坐地铁/电梯', '怕在人多的地方发作'],
      courseClues: ['发作达到峰值快、随后逐渐缓解', '发作间担心再次发生', '咖啡因、睡眠不足和躯体疾病会触发或模仿'],
      functionalImpact: ['回避交通、商场、独处或运动', '频繁急诊和身体检查', '出行与工作范围缩小'],
      assessment: ['记录发作前后、峰值症状和持续时间', '区分预期焦虑、广场回避与具体恐惧', '首次发作或非典型症状应进行躯体排查'],
      differentials: ['心律失常、哮喘、甲亢', '广泛性焦虑障碍', '社交焦虑或特定恐惧', '兴奋剂、咖啡因或戒断'],
      treatmentOverview: ['认知行为治疗、内感受暴露和逐步恢复活动常用于长期管理', '药物需专业评估，苯二氮䓬类不应成为唯一或长期方案'],
      emergencySignals: ['持续胸痛、晕厥、单侧无力或严重呼吸困难需急救', '发作后出现自伤想法或完全无法出门'], relatedDrugIds: ['sertraline', 'paroxetine', 'venlafaxine', 'clonazepam', 'lorazepam'], source: clinicalSource
    },
    {
      id: 'social-anxiety', name: '社交焦虑障碍', aliases: ['社交恐惧症', '社交焦虑'], category: '神经症及癔症',
      summary: '持续害怕被他人负面评价，在讲话、进食、见人或被注视的场合出现强烈焦虑，并回避或勉强忍受。',
      details: '关键不是“内向”，而是恐惧与评价相关、超出实际危险并限制了教育、工作或关系。需了解安全行为、羞耻感、酒精助“社交”和抑郁共病。',
      symptoms: ['害怕出丑、脸红、发抖或被看穿', '回避发言、聚会、约会或公共进食', '事前反复排练，事后长时间复盘'],
      patientPhrases: ['所有人都在看我', '一开口脑子就空白', '宁可不去也不想被评价', '喝点酒才敢和人说话'],
      courseClues: ['常在青少年期出现', '在熟人或独处时减轻', '长期回避可能继发抑郁和物质使用'],
      functionalImpact: ['错过课程、面试、晋升和关系机会', '生活范围和支持网络变小'],
      assessment: ['区分社交场景恐惧与广泛的人际不信任', '询问回避、安全行为、酒精/镇静药使用和抑郁'],
      differentials: ['广泛性焦虑障碍', '回避型人格障碍', '自闭症谱系社交沟通困难', '精神病性被害观念'],
      treatmentOverview: ['认知行为治疗和逐级暴露以恢复功能为目标', '必要时由专业人员评估药物及共病'],
      emergencySignals: ['以酒精/药物维持社交或出现自伤/极度绝望'], relatedDrugIds: ['sertraline', 'paroxetine', 'escitalopram', 'venlafaxine'], source: clinicalSource
    },
    {
      id: 'ocd', name: '强迫症', aliases: ['OCD', '强迫障碍'], category: '神经症及癔症',
      summary: '反复闯入、令人痛苦的强迫观念，或为降低焦虑而反复执行强迫行为；当事人往往知道这些想法/行为过度，却难以停止。',
      details: '强迫不是单纯爱干净或追求完美，而是耗时、痛苦、难以控制并造成回避。评估要记录触发-观念-焦虑-行为的循环，以及自知力、囤积、抽动和抑郁风险。',
      symptoms: ['污染、伤害、对称、道德或禁忌相关侵入性想法', '反复洗手、检查、计数、祈祷或寻求保证', '因害怕触发而回避物品/场所'],
      patientPhrases: ['知道没必要但停不下来', '不检查很多次就不安心', '一个念头会在脑子里转几个小时', '我怕自己会伤害别人'],
      courseClues: ['症状常被隐瞒，延误识别', '压力和疲劳会加重', '青少年起病需同时关注抽动和家庭参与'],
      functionalImpact: ['每天被仪式占用大量时间', '迟到、缺课、皮肤损伤、家庭冲突'],
      assessment: ['识别强迫观念/行为及其耗时与回避', '评估自知力、抑郁、自伤和共病抽动', '区分真实意图、精神病性信念和侵入性想法'],
      differentials: ['广泛性焦虑障碍', '精神病性障碍', '自闭症重复行为', '强迫型人格特征和囤积障碍'],
      treatmentOverview: ['暴露与反应预防是核心心理治疗方法', '药物需由专业人员按疗效、耐受和共病决定，常需足量足疗程评估'],
      emergencySignals: ['因仪式无法进食饮水或出现严重皮肤/身体损伤', '伴明确自伤计划或无法控制冲动'], relatedDrugIds: ['fluvoxamine', 'sertraline', 'fluoxetine', 'paroxetine', 'clomipramine'], source: clinicalSource
    },
    {
      id: 'ptsd', name: '创伤后应激障碍', aliases: ['PTSD', '创伤后应激反应'], category: '应激相关障碍',
      summary: '经历或目睹严重创伤后，持续出现侵入性回忆/噩梦、回避、警觉性升高以及情绪和认知改变。',
      details: '创伤反应不等于“想太多”，也不要求每个人都以同样方式表达。评估要尊重当事人节奏，了解创伤类型、时间、持续威胁、解离、睡眠、物质使用和安全处境。',
      symptoms: ['闪回、噩梦和身体再体验', '回避谈论、地点、人物或相关活动', '易惊、警觉、 irritability 和睡眠差', '内疚、麻木、负性信念或解离'],
      patientPhrases: ['画面会突然回来', '听到某个声音就像回到当时', '不敢走那条路', '我一直睡不好、很容易被吓到'],
      courseClues: ['症状与创伤时间上相关', '纪念日、新闻和类似情境可触发', '持续威胁、重复创伤和缺少支持会使恢复困难'],
      functionalImpact: ['避免工作/学习场所', '关系疏离、睡眠和身体健康受损', '无法处理日常警报与注意力任务'],
      assessment: ['先确认当前人身安全和持续暴力风险', '询问侵入、回避、警觉、负性认知和解离', '筛查抑郁、自伤、物质使用和头部损伤'],
      differentials: ['急性应激障碍', '适应障碍', '惊恐/广泛性焦虑', '抑郁、解离障碍或物质诱发症状'],
      treatmentOverview: ['以创伤为重点的心理治疗、稳定睡眠和社会支持是主要方向', '药物和治疗节奏需考虑安全感、共病和个体意愿'],
      emergencySignals: ['仍处在暴力/虐待威胁中', '严重解离、无法照顾自己或有自伤/他伤计划'], relatedDrugIds: ['sertraline', 'paroxetine', 'fluoxetine', 'venlafaxine', 'lorazepam'], source: clinicalSource
    },
    {
      id: 'adjustment', name: '适应障碍', aliases: ['应激相关适应障碍'], category: '应激相关障碍',
      summary: '在明确的生活应激之后出现超出预期的情绪或行为反应，造成痛苦或功能下降，但尚不符合另一种更具体的障碍。',
      details: '要把应激事件、反应开始时间、原有脆弱性和恢复过程放在一起看。它不是对困难的道德评价，也不能用来忽略自杀风险或严重抑郁/创伤症状。',
      symptoms: ['焦虑、低落、哭泣或易怒', '工作学习下降', '回避、冲突或冲动行为', '对变化感到失控'],
      patientPhrases: ['这件事后我完全乱了', '我知道事情会过去但就是撑不住', '最近总和家人吵架', '换环境后每天都很难受'],
      courseClues: ['与失业、分离、疾病、迁移、照护等应激时间相关', '应激缓解后逐步恢复，但也可能转为其他障碍'],
      functionalImpact: ['短期缺勤、退学、关系冲突', '应对方式变窄、依赖酒精或镇静药'],
      assessment: ['明确应激源、时间线和可用支持', '排除抑郁、PTSD、双相和物质所致状态', '主动问自伤和他伤风险'],
      differentials: ['抑郁障碍', '广泛性焦虑障碍', 'PTSD', '丧失相关正常哀伤反应'],
      treatmentOverview: ['危机支持、问题解决、心理治疗和恢复日常节律是重点', '短期药物需谨慎并避免掩盖风险'],
      emergencySignals: ['明确自杀计划、暴力风险或无法维持基本生活'], relatedDrugIds: ['sertraline', 'escitalopram'], source: clinicalSource
    },
    {
      id: 'somatic-symptom', name: '躯体症状障碍', aliases: ['躯体化相关障碍', 'Somatic symptom disorder'], category: '躯体症状及相关障碍',
      summary: '存在一个或多个令人困扰的身体症状，并伴随过度担忧、反复检查或投入大量时间；症状是否有医学解释不是唯一判断标准。',
      details: '身体症状应被认真评估和对待，不能简单说“都是心理作用”。专业评估关注症状带来的痛苦、健康焦虑和就医模式，并与真实躯体疾病并行管理。',
      symptoms: ['疼痛、疲劳、胃肠或多部位不适', '反复检查或寻求保证', '担心漏诊、持续扫描身体', '症状使活动和关系受限'],
      patientPhrases: ['检查正常但我还是觉得要出事', '身体每个变化我都很害怕', '我跑了很多医院也不安心'],
      courseClues: ['症状可波动并受压力影响', '就医和检查成为维持焦虑的循环', '需持续留意新的客观危险信号'],
      functionalImpact: ['反复急诊/检查、工作缺勤', '避免活动或依赖家人照护'],
      assessment: ['先做必要的医学评估并解释结果', '询问健康焦虑、检查/保证行为、功能和心理压力', '避免无限重复检查或完全否定症状'],
      differentials: ['疾病焦虑障碍', '抑郁和焦虑障碍', '真正的躯体疾病', '物质/药物副作用'],
      treatmentOverview: ['固定随访、连续的医患关系和心理治疗有助于减少失控就医', '目标是恢复功能而不是承诺“永远没有症状”'],
      emergencySignals: ['新发剧烈胸痛、呼吸困难、意识改变或神经缺损仍需急救', '伴自伤想法'], relatedDrugIds: ['sertraline', 'duloxetine'], source: clinicalSource
    },
    {
      id: 'illness-anxiety', name: '疾病焦虑障碍', aliases: ['健康焦虑', '疾病恐惧'], category: '躯体症状及相关障碍',
      summary: '身体症状很轻或几乎没有，却持续担心自己患有严重疾病，反复查体或回避就医，焦虑本身成为主要负担。',
      details: '评估要区分健康焦虑与确有症状未解释的躯体疾病，并关注网络搜索、检查和寻求保证的频率。沟通时不能保证“绝对没病”，而应建立合理的随访计划。',
      symptoms: ['持续扫描身体', '反复搜索疾病信息', '频繁就医或完全回避就医', '难以接受阴性检查结果'],
      patientPhrases: ['医生说没事但我不相信', '我每天都在查症状', '一个小疼痛就想到癌症', '我不敢去医院听结果'],
      courseClues: ['常与压力、丧失或身边人患病相关', '检查短暂缓解后焦虑反弹', '可能与强迫和广泛性焦虑重叠'],
      functionalImpact: ['时间和金钱大量用于搜索/就医', '回避运动、旅行或亲密关系'],
      assessment: ['确认必要的医学检查已完成', '评估健康信念、保证行为和回避', '筛查抑郁、强迫、惊恐和自伤风险'],
      differentials: ['躯体症状障碍', '强迫症', '广泛性焦虑障碍', '未识别的医学疾病'],
      treatmentOverview: ['结构化随访、心理治疗和减少检查/搜索循环是重点', '治疗目标为恢复生活而非消除全部不确定性'],
      emergencySignals: ['出现客观急症信号或自伤意念'], relatedDrugIds: ['sertraline', 'escitalopram'], source: clinicalSource
    },
    {
      id: 'dissociative', name: '解离障碍', aliases: ['解离症状', '人格解体/现实解体相关障碍'], category: '解离障碍',
      summary: '意识、记忆、身份、知觉或自我体验出现不连续，可能表现为失忆、人格解体、现实解体或身份状态改变。',
      details: '解离体验可能与创伤、极端压力、睡眠不足、物质或神经系统疾病有关。评估应先确认现实安全、意识状态和医学因素，再用稳定化和连续叙事帮助理解。',
      symptoms: ['像在旁观自己', '环境不真实或像梦', '对一段时间或事件记不起来', '身份感或声音体验发生变化'],
      patientPhrases: ['我像不是在自己的身体里', '这段时间完全空白', '房间看起来像假的', '我不知道自己刚刚做了什么'],
      courseClues: ['在触发情境、冲突或创伤回忆时加重', '可伴噩梦、警觉和回避', '需要排查癫痫、头部损伤、中毒和睡眠障碍'],
      functionalImpact: ['驾驶、工作、照护和记忆任务受影响', '关系中出现无法解释的行为或不信任'],
      assessment: ['确认当前定向力、意识、药物/物质和神经症状', '询问解离触发和安全行为', '避免在缺乏稳定化时强行追问创伤细节'],
      differentials: ['癫痫、谵妄和脑损伤', 'PTSD', '物质诱发状态', '精神病性障碍'],
      treatmentOverview: ['稳定化、睡眠与安全计划优先，之后再进行创伤相关心理治疗', '药物主要针对共病症状而非“消除人格”'],
      emergencySignals: ['意识持续混乱、走失、危险驾驶或自伤/他伤风险'], relatedDrugIds: ['sertraline', 'fluoxetine'], source: clinicalSource
    },
    {
      id: 'borderline-personality', name: '边缘型人格障碍', aliases: ['BPD', '情绪不稳定型人格障碍'], category: '人格障碍',
      summary: '人际关系、自我形象和情绪调节长期不稳定，伴强烈的被抛弃敏感、冲动行为和反复自伤风险。',
      details: '不能把一次情绪爆发等同于人格障碍。需要观察跨情境、长期存在的模式，理解关系触发、情绪回落速度、自我伤害功能以及创伤和共病心境障碍。',
      symptoms: ['强烈害怕被抛弃', '关系在理想化与贬低间快速变化', '情绪反应强且波动快', '冲动、自伤、空虚或解离'],
      patientPhrases: ['对方不回消息我就觉得被抛弃', '我一下很爱一个人，一下又恨', '只有伤害自己才能停下来', '我不知道自己是谁'],
      courseClues: ['通常从青少年或成年早期表现', '人际事件是常见触发', '自伤可能是调节痛苦而非单一求关注行为'],
      functionalImpact: ['关系和工作反复中断', '急诊频繁、冲动消费/性行为/物质使用'],
      assessment: ['评估自伤方式、频率、意图和可获得手段', '了解长期人际/自我形象模式并筛查双相、PTSD和物质使用', '制定具体的危机和求助计划'],
      differentials: ['双相障碍', 'PTSD/复杂创伤', '抑郁和物质使用障碍', '正常的短暂关系冲突'],
      treatmentOverview: ['结构化心理治疗和危机计划是核心', '药物只针对明确的共病或短期目标，避免多药叠加和依赖'],
      emergencySignals: ['正在自伤、准备自杀或无法承诺暂时安全', '冲动攻击、严重解离或物质中毒'], relatedDrugIds: ['sertraline', 'lamotrigine', 'quetiapine'], source: clinicalSource
    },
    {
      id: 'avoidant-personality', name: '回避型人格障碍', aliases: ['回避型人格特征'], category: '人格障碍',
      summary: '长期因害怕批评、拒绝或羞耻而回避社交和亲密关系，同时渴望被接纳，影响机会与支持网络。',
      details: '需要区分稳定的跨情境人格模式与社交焦虑障碍。重点看自我评价、回避范围、亲密关系需要和从童年到现在的连续性。',
      symptoms: ['对批评和拒绝高度敏感', '回避工作/社交中的人际接触', '担心自己不够好、尴尬或被嘲笑', '渴望关系但难以靠近'],
      patientPhrases: ['我怕别人发现我很差', '想交朋友但不敢主动', '因为怕丢脸错过了面试', '别人不回消息我就不再联系'],
      courseClues: ['长期且跨场景', '早期经历和羞耻/欺凌可能相关', '压力下可出现抑郁和焦虑'],
      functionalImpact: ['教育、职业和亲密关系机会减少', '孤立和低自尊'],
      assessment: ['了解回避行为、想要的关系和实际限制', '区分社交焦虑、孤独偏好和自闭症社交沟通差异'],
      differentials: ['社交焦虑障碍', '自闭症谱系障碍', '抑郁障碍', '分裂样人格特征'],
      treatmentOverview: ['心理治疗以逐步面对回避和建立关系能力为主', '药物仅针对共病焦虑/抑郁，由专业人员评估'],
      emergencySignals: ['孤立、抑郁加重并出现自伤想法'], relatedDrugIds: ['sertraline', 'escitalopram'], source: clinicalSource
    },
    {
      id: 'anorexia', name: '神经性厌食症', aliases: ['厌食症', 'anorexia nervosa'], category: '心理生理障碍',
      summary: '持续限制能量摄入、强烈害怕体重增加或对体形体重的体验扭曲，即使体重已明显偏低仍可能认为自己“需要更瘦”。',
      details: '进食障碍是身心共同的疾病，不能用“想开点”解决。评估既要问进食/运动和体重变化，也要关注心率、晕厥、电解质、月经/性激素、抑郁和自杀风险。',
      symptoms: ['限制进食、计算热量', '过度运动或补偿行为', '体重快速下降', '怕胖、身体形象扭曲', '怕冷、乏力、头晕或心悸'],
      patientPhrases: ['我吃一点就觉得失控', '体重已经很低但还是觉得胖', '运动一天不做就焦虑', '家人逼我吃让我很害怕'],
      courseClues: ['常在青春期/青年期出现', '体重与进食行为可能被隐瞒', '压力、社交评价和控制感相关'],
      functionalImpact: ['体力、学习、工作和社交下降', '进食相关冲突和医疗并发症'],
      assessment: ['记录进食、运动、体重轨迹和补偿行为', '测量生命体征并评估脱水、电解质和心律风险', '主动问抑郁、自伤、物质使用和家庭支持'],
      differentials: ['神经性贪食症', '回避/限制性摄食障碍', '甲状腺或胃肠疾病', '抑郁导致的食欲下降'],
      treatmentOverview: ['营养恢复、医学监测和心理治疗需要协作', '恢复体重和减少补偿行为是安全目标，不以外貌评价进展'],
      emergencySignals: ['晕厥、心率过慢、胸痛、严重脱水/电解质紊乱', '无法进食饮水或有自杀计划'], relatedDrugIds: ['fluoxetine'], source: clinicalSource
    },
    {
      id: 'bulimia', name: '神经性贪食症', aliases: ['贪食症', 'bulimia nervosa'], category: '心理生理障碍',
      summary: '反复暴食并伴失控感，随后通过催吐、泻药、禁食或过度运动补偿，体重可能并不明显偏低。',
      details: '暴食不是一次吃多，而是短时间内失控并伴明显痛苦。需要保护隐私、评估电解质和心律，关注羞耻、抑郁和自伤风险。',
      symptoms: ['短时间大量进食且难以停止', '催吐、泻药、禁食或过度运动', '体重/体形过度影响自我评价', '牙齿、腮腺、胃食管或电解质问题'],
      patientPhrases: ['我一吃就停不下来', '吃完必须把它吐出来', '别人看不出来但我每天都在循环', '我很怕体重变化'],
      courseClues: ['暴食和补偿可能持续多年而被隐藏', '压力、限制饮食和羞耻感维持循环'],
      functionalImpact: ['进食安排占据生活', '医疗并发症、财务负担和关系隐瞒'],
      assessment: ['询问暴食频率、补偿方式、泻药/利尿剂使用', '评估脱水、电解质、心律、牙齿和胃肠症状', '筛查抑郁、自伤和物质使用'],
      differentials: ['神经性厌食症', '暴食障碍', '强迫症', '内分泌或胃肠疾病'],
      treatmentOverview: ['营养规律、心理治疗和医学监测是常见组合', '不以体重单一判断严重程度'],
      emergencySignals: ['呕血、晕厥、严重脱水/心悸或意识改变', '伴自杀计划'], relatedDrugIds: ['fluoxetine'], source: clinicalSource
    },
    {
      id: 'insomnia', name: '失眠障碍', aliases: ['慢性失眠', '睡眠-觉醒障碍'], category: '睡眠障碍',
      summary: '有足够睡眠机会仍难以入睡、维持睡眠或过早醒来，并造成白天疲劳、注意力下降或情绪功能受损。',
      details: '失眠既可能是独立问题，也可能是抑郁、焦虑、躁狂、创伤、疼痛、呼吸障碍或物质/药物的表现。先看规律、白天功能和诱因，再谈药物。',
      symptoms: ['入睡困难、夜间醒来或早醒', '白天疲劳、易怒、注意力差', '上床后担心“今晚又睡不着”', '依赖酒精或安眠药'],
      patientPhrases: ['躺几个小时也睡不着', '一醒就开始担心明天', '白天脑子很慢', '只有吃药/喝酒才能睡'],
      courseClues: ['持续数月或反复发生', '作息不规律、午睡、屏幕和咖啡因会维持', '若伴睡眠需求下降却精力旺盛需筛查躁狂'],
      functionalImpact: ['驾驶和工作注意力下降', '情绪、免疫和躯体健康受影响'],
      assessment: ['记录睡眠时间、机会、白天功能和节律', '筛查抑郁、焦虑、躁狂、睡眠呼吸暂停、疼痛和物质', '询问是否自行使用酒精、苯二氮䓬或复方药'],
      differentials: ['抑郁/焦虑障碍', '双相躁狂', '睡眠呼吸暂停和不宁腿', '咖啡因、兴奋剂或戒断'],
      treatmentOverview: ['失眠认知行为治疗和规律节律通常优先', '催眠药需短期、复评和关注跌倒/依赖风险'],
      emergencySignals: ['数日不眠伴精神症状或躁狂', '呼吸暂停、晕厥、过量用药或混合酒精镇静药'], relatedDrugIds: ['ramelteon', 'zolpidem', 'eszopiclone', 'trazodone', 'mirtazapine'], source: clinicalSource
    },
    {
      id: 'adhd', name: '注意缺陷多动障碍', aliases: ['ADHD', '多动症'], category: '儿童期心理发育障碍',
      summary: '从儿童期开始、跨多个场景持续的注意维持困难、冲动或活动过多，造成学习、工作、关系或自我管理受损。',
      details: '成人也可能首次被识别，但需要追溯儿童期表现并确认不是单由焦虑、抑郁、睡眠不足、物质或环境造成。评估应结合本人、家属和学校/工作信息。',
      symptoms: ['容易分心、忘事、拖延', '难以完成多步骤任务', '打断别人、冲动决定', '坐立不安或内在躁动', '时间管理和物品组织困难'],
      patientPhrases: ['不是不会而是总是做不完', '刚放下手机就忘了要做什么', '开会很难坐住', '我从小就丢三落四'],
      courseClues: ['童年已有类似表现', '在无趣、重复任务中更明显', '兴趣驱动任务可能短时高度专注'],
      functionalImpact: ['迟到、漏交、换工作频繁', '关系中忘记承诺或冲动冲突', '交通和物质使用风险增加'],
      assessment: ['确认儿童期起病和至少两个场景的功能影响', '询问睡眠、情绪、学习障碍、自闭症和物质使用', '评估心血管、抽动和躁狂风险'],
      differentials: ['焦虑/抑郁障碍', '双相障碍', '睡眠障碍', '自闭症谱系障碍和学习障碍'],
      treatmentOverview: ['环境调整、行为策略和心理教育是基础', '兴奋剂或非兴奋剂需由专业人员结合心血管和物质风险决定'],
      emergencySignals: ['胸痛、晕厥、明显躁狂/精神病性症状或过量使用'], relatedDrugIds: ['methylphenidate', 'atomoxetine', 'guanfacine', 'clonidine'], source: clinicalSource
    },
    {
      id: 'autism', name: '孤独症谱系障碍', aliases: ['ASD', '自闭症谱系障碍'], category: '儿童期心理发育障碍',
      summary: '从早期发育开始存在社会沟通/互动差异，以及受限、重复的行为或兴趣模式；支持需求和能力差异很大。',
      details: '孤独症不是由教养造成，也不等于缺乏情感。评估要看发育史、感觉特点、语言/沟通、适应功能和共病 ADHD、焦虑、癫痫或睡眠问题。',
      symptoms: ['理解/表达社交线索困难', '对变化敏感、需要固定流程', '重复动作或高度专注的兴趣', '感觉过敏或寻求刺激'],
      patientPhrases: ['我不知道别人为什么生气', '临时改变计划会让我崩溃', '声音/灯光让我很难受', '我更擅长谈兴趣而不是寒暄'],
      courseClues: ['从早期发育阶段可见', '要求增加或环境变化时困难显现', '支持充分时可发展出独特优势和策略'],
      functionalImpact: ['学校、工作和独立生活需要支持', '社交耗竭、欺凌和焦虑风险'],
      assessment: ['发展史、适应功能和多场景观察', '筛查语言、智力、ADHD、焦虑、抑郁、癫痫和睡眠', '避免用单一测试或刻板印象下结论'],
      differentials: ['ADHD', '社交焦虑', '智力/语言障碍', '创伤、听力问题或精神病性障碍'],
      treatmentOverview: ['以沟通、环境支持、教育/职业适应和共病治疗为中心', '没有一种药物能改变核心社交特征，药物只针对明确共病症状'],
      emergencySignals: ['严重崩溃伴自伤/他伤', '癫痫、吞咽/营养问题或无法保证安全'], relatedDrugIds: ['guanfacine', 'methylphenidate', 'sertraline'], source: clinicalSource
    },
    {
      id: 'alcohol-use', name: '酒精使用障碍', aliases: ['酒精依赖', '酒精滥用', 'AUD'], category: '物质所致精神障碍',
      summary: '持续饮酒导致控制困难、渴求、耐受或戒断，并损害健康、工作、关系或安全。严重程度不由“喝多少”单独决定。',
      details: '以非评判方式询问频率、量、失控、后果、戒断和饮酒目的。突然停酒对长期大量饮酒者可能危险，需识别震颤、幻觉、抽搐和谵妄。',
      symptoms: ['想少喝却做不到', '花大量时间获取/饮酒/恢复', '耐受和戒断', '明知影响健康或关系仍继续', '酒后驾驶或危险行为'],
      patientPhrases: ['我只是想放松但每天都要喝', '不喝就手抖、出汗', '家人都说我变了', '我答应少喝但总失败'],
      courseClues: ['饮酒量和频率逐渐增加', '压力、失眠、抑郁或社交触发', '停酒后症状可能快速升级'],
      functionalImpact: ['工作缺勤、事故、家庭暴力和财务问题', '肝脏、心血管和睡眠受损'],
      assessment: ['询问最后一次饮酒、既往戒断、抽搐/谵妄和混合物质', '筛查抑郁、自伤、暴力和驾驶风险', '评估肝功能、营养和社会支持'],
      differentials: ['双相障碍', '焦虑/失眠障碍', '药物或其他物质使用障碍', '躯体疾病导致的震颤/意识改变'],
      treatmentOverview: ['医学戒断、心理社会治疗、复发预防和家庭支持需组合', '药物需结合肝肾功能、戒断阶段和是否仍饮酒由专业人员决定'],
      emergencySignals: ['抽搐、意识混乱、高热、幻觉、严重呕吐', '酒精与镇静药/阿片混用导致呼吸变慢'], relatedDrugIds: ['acamprosate', 'naltrexone', 'disulfiram', 'lorazepam'], source: clinicalSource
    },
    {
      id: 'neurocognitive', name: '神经认知障碍', aliases: ['痴呆相关障碍', '认知障碍', '阿尔茨海默病相关'], category: '脑器质性及躯体疾病所致精神障碍',
      summary: '记忆、注意、语言、执行或社会认知出现较既往下降，并影响独立生活；起病和进展方式因病因不同而不同。',
      details: '区分急性波动的谵妄、渐进性认知下降和抑郁导致的主观记忆问题。评估应包含本人和照护者信息、药物、睡眠、听视力、情绪及日常功能。',
      symptoms: ['近期记忆下降', '找词、计划、判断或熟悉任务困难', '迷路、重复提问', '性格/行为改变或日夜节律紊乱'],
      patientPhrases: ['刚说过的事我马上忘了', '在熟悉地方也会迷路', '家人说我变得不像自己', '我担心自己是不是痴呆'],
      courseClues: ['渐进性下降提示神经退行性过程', '突然波动、注意障碍和意识改变先考虑谵妄', '血管事件、感染、药物和营养因素可参与'],
      functionalImpact: ['用药、财务、驾驶、做饭和卫生管理受影响', '照护压力和家庭冲突'],
      assessment: ['记录起病、速度、波动和具体功能丧失', '进行认知、躯体、神经和药物评估', '评估走失、跌倒、虐待和照护者负担'],
      differentials: ['谵妄', '抑郁相关认知症状', '睡眠障碍', '药物、甲状腺/维生素缺乏或神经疾病'],
      treatmentOverview: ['先处理可逆因素、建立安全和照护支持', '胆碱酯酶抑制剂/美金刚等只适用于部分病因阶段，需专业评估'],
      emergencySignals: ['突然意识改变、发热、单侧无力、抽搐', '走失、跌倒、无法进食饮水或虐待风险'], relatedDrugIds: ['donepezil', 'rivastigmine', 'galantamine', 'memantine'], source: clinicalSource
    },
    ...expandedDisorders,
    ...comprehensiveDisorders,
    ...supplementalDisorders
  ],
  cases: [
    { id: 'case-depression-01', disorderId: 'depression', title: '“什么都提不起劲”的三个月', stage: '初次评估', tags: ['兴趣下降', '早醒', '功能下降'], summary: '来访者持续三个月兴趣下降、早醒和疲乏，逐渐停止与朋友联系，最近出现“活着没有意义”的想法。', presentation: ['低落、早醒、疲劳、注意力下降', '否认躁狂史，近月缺勤增加'], timeline: '症状从一次工作挫折后开始，前两周仍能维持工作，之后逐渐停止社交和锻炼。', functionImpact: '从全职工作退到请假，个人卫生和饮食变差。', riskSignals: '需要立即追问自伤想法的频率、计划、手段、既往行为和保护因素。', assessmentFocus: ['抑郁症状群与持续时间', '双相筛查', '安全计划和可用支持'], differentialClues: ['排除双相抑郁、物质和躯体因素'], safetyNote: '如当事人无法保证安全，应立即联系当地急救/危机干预服务。', source: caseSource },
    { id: 'case-bipolar-01', disorderId: 'bipolar', title: '睡得很少却精力充沛', stage: '鉴别诊断', tags: ['睡眠需求下降', '冲动投资', '家属求助'], summary: '家属描述来访者连续多日只睡两三小时却精力旺盛、语速明显加快，并突然投入大额资金。', presentation: ['高涨/易怒、思维奔逸、话多', '冲动消费和风险投资'], timeline: '一周内从“效率特别高”进展到几乎不睡，家属发现其无法停止计划。', functionImpact: '财务风险和家庭冲突显著增加，已无法安全独处管理账户。', riskSignals: '评估自伤/他伤、驾驶、财务和被害信念。', assessmentFocus: ['躁狂与轻躁狂发作史', '物质/药物诱发', '安全与照护安排'], differentialClues: ['区分 ADHD 基线、兴奋剂使用和双相躁狂'], safetyNote: '持续不眠、严重冲动或精神病性症状需要尽快专业评估。', source: caseSource },
    { id: 'case-schizophrenia-01', disorderId: 'schizophrenia', title: '“有人在议论我”', stage: '家庭沟通', tags: ['评论性声音', '被害体验', '退缩'], summary: '来访者因听见评论性声音而回避出门，家属争辩“那不是真的”后，来访者更不愿沟通。', presentation: ['听见声音、失眠、警觉', '近月不再上班，卫生和进食减少'], timeline: '先出现睡眠减少和社交退缩，随后出现声音和被议论的确信。', functionImpact: '无法工作，拒绝独处以外的活动，依赖家属购买食物。', riskSignals: '确认声音是否命令其自伤/伤人，是否有可用武器和逃避行为。', assessmentFocus: ['症状内容与危险性', '物质/躯体因素', '家庭沟通和就医连接'], differentialClues: ['区分双相/抑郁伴精神病性症状和物质诱发状态'], safetyNote: '沟通应先确认安全，不围绕信念真伪争辩。', source: caseSource },
    { id: 'case-delusional-01', disorderId: 'delusional-disorder', title: '反复寻找“监视证据”', stage: '风险评估', tags: ['被害主题', '投诉', '冲突'], summary: '来访者坚信邻居安装设备监视自己，持续拍摄和投诉，尚能完成工作但与邻居冲突升级。', presentation: ['固定被害信念', '反复查证和记录', '情绪随冲突升高'], timeline: '信念持续数月，最近开始携带棍棒“防身”。', functionImpact: '工作尚可维持，但居住关系破裂且睡眠下降。', riskSignals: '明确评估是否计划接近或攻击被指向对象。', assessmentFocus: ['妄想确信程度与行为后果', '现实安全和法律风险', '物质/神经系统排查'], differentialClues: ['与强迫性怀疑、精神分裂症和真实骚扰事件区分'], safetyNote: '优先降低对抗和接触风险，必要时联络当地专业服务。', source: caseSource },
    { id: 'case-panic-01', disorderId: 'panic', title: '第一次发作之后不敢坐地铁', stage: '身体排查与心理教育', tags: ['心悸', '回避', '内感受'], summary: '一次突发心悸、窒息感和眩晕后，来访者开始回避地铁、拥挤场所和独处。', presentation: ['突发强烈恐惧和身体症状', '反复测心率、担心再次发作'], timeline: '首次发作后两个月内没有同样强度发作，但预期焦虑和回避持续增加。', functionImpact: '通勤时间增加，开始请假并依赖家人陪同。', riskSignals: '首次或非典型胸痛/晕厥先排除急性躯体疾病。', assessmentFocus: ['发作峰值和持续时间', '广场回避与预期焦虑', '咖啡因/兴奋剂和睡眠'], differentialClues: ['区分心律失常、甲亢、社交焦虑和广泛性焦虑'], safetyNote: '出现持续胸痛、晕厥或严重呼吸困难应急救。', source: caseSource },
    { id: 'case-gad-01', disorderId: 'gad', title: '每件事都预演最坏结果', stage: '症状澄清', tags: ['过度担忧', '肌肉紧张', '失眠'], summary: '来访者同时担心工作、父母健康、财务和孩子安全，几乎每天难以停止思考。', presentation: ['持续担忧、疲劳、肩颈紧张', '睡前反复预演灾难'], timeline: '担忧模式已持续一年，压力大时明显加重。', functionImpact: '工作效率下降，周末也无法休息。', riskSignals: '筛查抑郁、自伤和酒精/镇静药自我缓解。', assessmentFocus: ['担忧范围和可控性', '躯体因素、咖啡因和睡眠', '功能与共病'], differentialClues: ['区分强迫观念、抑郁反刍和真实医学问题'], safetyNote: '若出现自伤想法或无法维持生活，应尽快求助。', source: caseSource },
    { id: 'case-social-01', disorderId: 'social-anxiety', title: '面试前一周就开始逃避', stage: '功能评估', tags: ['害怕评价', '回避', '羞耻'], summary: '来访者因害怕在面试中发抖和说错话而取消机会，平时也避免在会议中发言。', presentation: ['预期焦虑、脸红和心悸', '事后反复复盘并否定自己'], timeline: '从高中起就回避课堂展示，近年影响求职。', functionImpact: '专业能力尚可，但没有参加面试和社交活动。', riskSignals: '询问是否使用酒精/镇静药“壮胆”及抑郁风险。', assessmentFocus: ['社交场景、回避与安全行为', '童年起病和自尊', '抑郁/物质共病'], differentialClues: ['区分回避型人格、自闭症和现实欺凌'], safetyNote: '先建立可承受的小步暴露目标，不强行把人推入高压场景。', source: caseSource },
    { id: 'case-ocd-01', disorderId: 'ocd', title: '反复确认煤气是否关闭', stage: '强迫循环识别', tags: ['检查', '侵入性想法', '耗时'], summary: '来访者每天离家前检查煤气和门锁数十次，明知过度仍无法停止，常因此迟到。', presentation: ['害怕发生灾难的侵入性想法', '重复检查和寻求保证'], timeline: '压力增加后从几次检查发展到持续一小时以上。', functionImpact: '工作迟到、家人被迫参与确认，手部皮肤受损。', riskSignals: '评估是否因仪式无法进食、睡眠和自我照料。', assessmentFocus: ['观念-焦虑-仪式链', '自知力和回避', '抑郁/自伤与抽动'], differentialClues: ['区分精神病性信念和单纯谨慎'], safetyNote: '避免家属无限保证，寻求强迫症专业治疗。', source: caseSource },
    { id: 'case-ptsd-01', disorderId: 'ptsd', title: '听到刹车声就回到事故现场', stage: '创伤知情评估', tags: ['闪回', '回避', '警觉'], summary: '交通事故数月后，来访者被刹车声触发闪回，避免乘车并长期失眠。', presentation: ['侵入性画面、噩梦', '回避道路、易惊和警觉'], timeline: '事故后数周症状持续，近期因工作需要通勤而加重。', functionImpact: '无法独自乘车，工作出勤受影响。', riskSignals: '确认当前道路安全、解离、抑郁和自伤。', assessmentFocus: ['创伤症状四个维度', '持续威胁和支持', '物质使用与头部损伤'], differentialClues: ['区分急性应激、惊恐和脑震荡后症状'], safetyNote: '先建立安全感和稳定化，再讨论创伤细节。', source: caseSource },
    { id: 'case-adjustment-01', disorderId: 'adjustment', title: '搬家后整个生活失去秩序', stage: '危机支持', tags: ['生活变化', '低落', '失眠'], summary: '搬家和换工作后出现哭泣、失眠、易怒和效率下降，尚未形成持续的抑郁症状群。', presentation: ['情绪波动、担心适应不了', '与伴侣争吵增多'], timeline: '应激后一月内出现，周末回到熟悉环境会部分缓解。', functionImpact: '新工作迟到、家务和社交减少。', riskSignals: '询问绝望、自伤和酒精助眠。', assessmentFocus: ['应激-反应时间线', '可用支持和问题解决', '排除抑郁、双相和 PTSD'], differentialClues: ['反应程度、持续时间和功能决定是否需要更广泛诊断'], safetyNote: '不能因为“有原因”就跳过自杀风险筛查。', source: caseSource },
    { id: 'case-somatic-01', disorderId: 'somatic-symptom', title: '检查正常仍每天担心心脏', stage: '连续照护', tags: ['胸闷', '反复检查', '健康焦虑'], summary: '来访者已有多次正常心脏检查，仍每天测心率并反复就医，活动范围不断缩小。', presentation: ['胸闷和心悸主观困扰', '搜索疾病、要求家人陪同'], timeline: '最初症状轻微，半年内检查和保证行为增加。', functionImpact: '停止运动和旅行，工作时间用于预约检查。', riskSignals: '任何新的急性胸痛/晕厥仍需重新医学评估。', assessmentFocus: ['症状与健康焦虑循环', '固定随访计划', '抑郁/惊恐共病'], differentialClues: ['不可把既往正常检查当作永远排除新疾病'], safetyNote: '以尊重身体体验和减少失控就医为目标。', source: caseSource },
    { id: 'case-dissociative-01', disorderId: 'dissociative', title: '一段时间像被剪掉了', stage: '意识与安全评估', tags: ['失忆', '现实解体', '创伤线索'], summary: '在家庭冲突后，来访者发现自己有数小时记忆空白，并描述环境“不真实”。', presentation: ['现实解体、时间空白', '伴失眠和强烈警觉'], timeline: '类似体验在过去一年偶发，最近频率增加。', functionImpact: '不敢驾驶，工作记录出现遗漏。', riskSignals: '先排查癫痫、物质、中毒、头伤和走失风险。', assessmentFocus: ['当前意识和定向', '触发情境与安全', '是否存在持续暴力或创伤'], differentialClues: ['区分谵妄、癫痫、物质诱发和精神病性状态'], safetyNote: '避免在缺乏稳定化时强行回忆创伤。', source: caseSource },
    { id: 'case-borderline-01', disorderId: 'borderline-personality', title: '消息未回后的急剧崩溃', stage: '危机计划', tags: ['被抛弃敏感', '自伤', '关系波动'], summary: '伴侣数小时未回消息后，来访者从极度恐慌转为愤怒并划伤手臂，随后强烈后悔。', presentation: ['情绪快速波动、空虚', '自伤用于暂时减轻痛苦'], timeline: '类似危机在不同关系中反复出现多年。', functionImpact: '关系中断、急诊频繁，工作难以稳定。', riskSignals: '详细评估自伤意图、手段、频率和当下可控性。', assessmentFocus: ['长期人格模式和触发', '双相/创伤/物质共病', '具体危机与支持计划'], differentialClues: ['情绪波动速度和人际触发有助于与双相区分'], safetyNote: '正在自伤或无法保证安全时应立即获得现场支持。', source: caseSource },
    { id: 'case-avoidant-01', disorderId: 'avoidant-personality', title: '想靠近却总在最后一步退出', stage: '长期模式评估', tags: ['羞耻', '回避', '低自尊'], summary: '来访者渴望朋友和亲密关系，却在被邀请时担心被评价而取消，长期独处并感到孤独。', presentation: ['回避、害怕批评', '对自己能力和外表过度否定'], timeline: '从青少年起跨学校、工作和亲密关系持续。', functionImpact: '错过升职、社交和恋爱机会。', riskSignals: '筛查抑郁、孤立和自伤想法。', assessmentFocus: ['跨情境的稳定模式', '希望的关系与回避的代价', '社交焦虑/ASD 区分'], differentialClues: ['不是单纯偏好独处，而是想靠近却因羞耻回避'], safetyNote: '治疗目标是增加选择和连接，不是强迫外向。', source: caseSource },
    { id: 'case-anorexia-01', disorderId: 'anorexia', title: '体重下降后仍觉得“远远不够瘦”', stage: '医学与心理联合评估', tags: ['限制进食', '过度运动', '头晕'], summary: '青少年持续限制进食并每天运动，近期头晕和心率偏慢，却坚持认为需要继续减重。', presentation: ['体重下降、怕胖、体形扭曲', '回避家人进食监督'], timeline: '考试压力后限制行为增加，近月出现晕厥前感。', functionImpact: '学习和体力下降，家庭用餐冲突。', riskSignals: '生命体征、电解质、心律和自伤风险需优先。', assessmentFocus: ['营养/医学稳定性', '进食和运动模式', '抑郁、强迫与家庭支持'], differentialClues: ['区分躯体疾病导致的消瘦和抑郁食欲下降'], safetyNote: '晕厥、胸痛、严重脱水或无法进食饮水需急诊。', source: caseSource },
    { id: 'case-bulimia-01', disorderId: 'bulimia', title: '夜间暴食后的秘密补偿', stage: '羞耻与循环识别', tags: ['暴食', '催吐', '电解质风险'], summary: '来访者白天严格节食，夜间失控暴食并催吐，家人只看到体重没有明显变化。', presentation: ['失控暴食、催吐', '羞耻、牙龈/咽喉不适'], timeline: '限制饮食半年后出现暴食补偿循环。', functionImpact: '大量时间用于计划、隐藏和恢复，社交减少。', riskSignals: '询问晕厥、心悸、泻药/利尿剂及自伤。', assessmentFocus: ['暴食和补偿频率', '脱水/电解质/心律', '抑郁和物质使用'], differentialClues: ['体重可正常，不能据此排除进食障碍'], safetyNote: '呕血、晕厥、严重心悸或意识改变需急救。', source: caseSource },
    { id: 'case-insomnia-01', disorderId: 'insomnia', title: '越想睡越清醒', stage: '睡眠评估', tags: ['入睡困难', '白天疲劳', '助眠药'], summary: '来访者每晚提前上床却持续担心失眠，白天疲劳，开始自行叠加酒精和镇静药。', presentation: ['入睡困难、夜间觉醒', '睡前警觉和灾难化思考'], timeline: '工作压力后持续四个月，助眠方式不断升级。', functionImpact: '白天驾驶和工作注意力下降。', riskSignals: '核对酒精/药物剂量和呼吸抑制风险，筛查躁狂。', assessmentFocus: ['睡眠日记和白天功能', '呼吸暂停/不宁腿/疼痛', '物质与药物相互作用'], differentialClues: ['数日少睡却精力旺盛需考虑双相而非单纯失眠'], safetyNote: '混用酒精、阿片和镇静药或意识变慢需急救。', source: caseSource },
    { id: 'case-adhd-01', disorderId: 'adhd', title: '成年后才发现不是“懒”', stage: '发育史回顾', tags: ['拖延', '忘事', '时间管理'], summary: '成人来访者长期漏交任务、忘记预约和冲动购物，回顾小学时就被评价为“聪明但坐不住”。', presentation: ['注意维持困难、组织差', '兴趣任务可高度专注'], timeline: '从童年持续到工作期，换到远程工作后问题更明显。', functionImpact: '多次错过截止日期，关系中常忘记承诺。', riskSignals: '评估驾驶、物质使用、抑郁和冲动自伤。', assessmentFocus: ['童年资料和多场景功能', '睡眠、情绪、学习障碍', '心血管、抽动和躁狂筛查'], differentialClues: ['焦虑/抑郁导致的注意力下降需结合时间线判断'], safetyNote: '药物需专业评估，不能从网络自行购买或加量。', source: caseSource },
    { id: 'case-autism-01', disorderId: 'autism', title: '计划突然改变后的崩溃', stage: '发育与环境评估', tags: ['感觉敏感', '重复兴趣', '适应困难'], summary: '青年在工作排班临时变化后出现严重崩溃，描述灯光、噪音和社交暗示长期消耗很大。', presentation: ['固定流程需求、感觉过敏', '理解暗示和临场沟通困难'], timeline: '童年已有同伴互动困难，进入职场后支持不足而明显失衡。', functionImpact: '频繁请假，回家后需要长时间独处恢复。', riskSignals: '评估自伤、欺凌、睡眠和癫痫线索。', assessmentFocus: ['发展史和适应功能', '工作环境调整', 'ADHD/焦虑/抑郁共病'], differentialClues: ['区分社交焦虑、创伤和单纯性格内向'], safetyNote: '先降低感官和沟通负荷，避免把崩溃当作故意不合作。', source: caseSource },
    { id: 'case-alcohol-01', disorderId: 'alcohol-use', title: '“不喝就手抖”', stage: '戒断风险筛查', tags: ['戒断', '失控使用', '家庭冲突'], summary: '来访者每天饮酒，早晨手抖后饮酒才能工作，曾自行停酒并出现幻觉。', presentation: ['耐受、戒断、继续使用', '酒后争吵和驾驶风险'], timeline: '饮酒量逐年增加，最近一次停酒在两天内出现明显戒断。', functionImpact: '工作缺勤、伴侣关系破裂、财务受损。', riskSignals: '既往幻觉提示戒断可能升级，需尽快医学评估。', assessmentFocus: ['最后一次饮酒和戒断史', '肝功能、营养、混合物质', '自伤/暴力/驾驶风险'], differentialClues: ['震颤和焦虑也可能来自其他物质或躯体疾病'], safetyNote: '长期大量饮酒者不要独自突然停酒。', source: caseSource },
    { id: 'case-neurocognitive-01', disorderId: 'neurocognitive', title: '熟悉的路也会迷路', stage: '认知与照护评估', tags: ['记忆下降', '走失', '照护负担'], summary: '家属发现长者一年内逐渐重复提问、忘记用药并在熟悉街区迷路，近期夜间更混乱。', presentation: ['渐进记忆和执行功能下降', '夜间混乱、走失风险'], timeline: '一年渐进下降，最近感染后突然加重。', functionImpact: '无法独立管理药物和财务，照护者疲惫。', riskSignals: '感染、谵妄、跌倒、走失和虐待风险需先处理。', assessmentFocus: ['渐进下降与急性波动区分', '药物、视听力、营养和神经检查', '居家安全与照护支持'], differentialClues: ['抑郁、谵妄和可逆躯体因素需排查'], safetyNote: '突然意识改变、发热或单侧无力需急救。', source: caseSource },
    ...expandedCases,
    ...comprehensiveCases,
    ...supplementalCases
  ],
  resources: [
    { id: 'resource-who', kind: '网站', title: '世界卫生组织：Mental health', description: '全球精神卫生公共卫生信息与政策资源。', url: 'https://www.who.int/health-topics/mental-health', source: 'WHO' },
    { id: 'resource-nimh', kind: '网站', title: 'NIMH：Mental Health Information', description: '美国国家精神卫生研究所的公众健康信息和研究入口。', url: 'https://www.nimh.nih.gov/health', source: 'NIMH' },
    { id: 'resource-pubmed', kind: '网站', title: 'PubMed', description: '可检索医学与生命科学论文摘要的公开数据库。', url: 'https://pubmed.ncbi.nlm.nih.gov/', source: 'U.S. National Library of Medicine' },
    { id: 'resource-cn', kind: '网站', title: '国家卫生健康委员会', description: '健康科普、政策与公共卫生信息入口。', url: 'https://www.nhc.gov.cn/', source: '国家卫生健康委员会' }
  ]
};

export const navItems = [
  { id: 'home', label: '首页', kicker: 'WELCOME' },
  { id: 'drugs', label: '药物', kicker: 'MEDICATIONS' },
  { id: 'disorders', label: '疾病科普', kicker: 'DISORDERS' },
  { id: 'cases', label: '案例分析', kicker: 'CASE NOTES' },
  { id: 'resources', label: '网络资源', kicker: 'LIBRARY' },
  { id: 'reviews', label: '前沿综述', kicker: 'FRONTIER REVIEWS' },
  { id: 'atlas', label: '信息可视化', kicker: 'DATA ATLAS' }
];

export const typeLabels = { drugs: '药物资料', disorders: '疾病线索', cases: '相似案例', resources: '资源' };

export function cloneSeed() {
  const clone = JSON.parse(JSON.stringify(seedData));
  clone.drugs = JSON.parse(JSON.stringify(handbookDrugs));
  return clone;
}

function createSeedRevision(value) {
  const text = JSON.stringify(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${text.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export const seedRevision = createSeedRevision({
  ...seedData,
  drugs: handbookDrugs
});
