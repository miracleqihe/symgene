const SEARCH_FIELDS = [
  ['name', 12], ['aliases', 11], ['patientPhrases', 9], ['symptoms', 7],
  ['summary', 5], ['details', 4], ['courseClues', 4], ['functionalImpact', 3],
  ['assessment', 2], ['differentials', 2]
];

const CASE_FIELDS = [
  ['title', 8], ['tags', 7], ['summary', 6], ['presentation', 8],
  ['timeline', 5], ['functionImpact', 4], ['riskSignals', 3], ['assessmentFocus', 3]
];

const PHRASE_ALIASES = [
  ['不想活', '自伤'], ['活着没有意义', '绝望'], ['伤害自己', '自伤'], ['想死', '自杀'],
  ['割腕', '自伤'], ['跳楼', '自杀'], ['听到声音', '幻听'], ['脑子里有声音', '幻听'],
  ['脑子里有人说话', '幻听'], ['听到有人说话', '幻听'], ['有人在议论我', '被害'], ['有人害我', '被害'],
  ['被监视', '被害'], ['被跟踪', '被害'], ['有人跟踪', '被害'], ['睡不着', '失眠'],
  ['早醒', '早醒'], ['睡得很少', '睡眠需求下降'], ['几天不睡', '睡眠需求下降'], ['连续不睡', '睡眠需求下降'],
  ['不睡也有劲', '精力旺盛'], ['不睡还特别有劲', '精力旺盛'], ['只睡两三个小时', '睡眠需求下降'],
  ['乱花钱', '冲动消费'], ['花很多钱', '冲动消费'], ['大额投资', '冲动投资'],
  ['心慌', '心悸'], ['喘不上气', '呼吸困难'], ['害怕出门', '回避'], ['不敢坐地铁', '回避'],
  ['反复洗手', '强迫'], ['不停洗手', '强迫'], ['反复检查', '检查'], ['反复确认', '检查'],
  ['吃到停不下来', '暴食'], ['失控进食', '暴食'], ['暴食', '暴食'], ['催吐', '补偿行为'],
  ['手抖', '戒断'], ['喝酒', '酒精'], ['注意力不集中', '注意困难'], ['坐不住', '多动'],
  ['事故后总做噩梦', '创伤'], ['车祸后一直害怕', '创伤'], ['总做噩梦', '噩梦'], ['像回到现场', '闪回'],
  ['闪回', '再体验'], ['像在做梦', '现实解体'], ['不真实', '现实解体'],
  ['突然认不得人', '谵妄'], ['突然不认识人', '谵妄'], ['突然糊涂', '谵妄'], ['晚上说房间里有人', '视幻觉'],
  ['重复提问', '记忆下降'], ['熟悉的路也迷路', '迷路'], ['记性越来越差', '认知下降'],
  ['撞伤以后', '脑外伤'], ['头部受伤后', '脑外伤'], ['脑子变慢', '处理速度变慢'],
  ['鼻子畸形', '外貌缺陷'], ['外貌有严重缺陷', '外貌缺陷'], ['美容手术', '美容操作'], ['做了手术还是', '美容操作'],
  ['下注', '赌博'], ['赌钱', '赌博'], ['输了还想赢回来', '追损'], ['借钱想赢回来', '追损'],
  ['游戏到天亮', '游戏失控'], ['休学还停不下', '游戏失控'], ['停不下游戏', '游戏失控'],
  ['一笑就腿软', '猝倒'], ['白天突然睡着', '睡眠发作'], ['醒不过来', '睡眠惯性'],
  ['眨眼清嗓', '抽动'], ['反复眨眼', '抽动'], ['清嗓子', '发声抽动'],
  ['总是打架', '攻击'], ['偷东西', '盗窃'], ['从小学习很慢', '发育迟缓'],
  ['有时清楚有时糊涂', '认知波动'], ['总看见屋里有人', '具体视幻觉'], ['性格突然变了', '人格改变'],
  ['发烧后胡言乱语', '脑炎红旗'], ['失眠后抽搐', '脑炎红旗'], ['没吃饭后手抖', '低血糖'], ['吃糖后清醒', '低血糖'],
  ['能量饮料后心慌', '咖啡因'], ['喝咖啡后手抖', '咖啡因'], ['墙在动', '致幻剂'], ['看见拖影', '知觉重现'],
  ['闻胶水', '吸入剂'], ['闻喷雾', '吸入剂'], ['必须有人陪才敢出门', '广场恐惧'], ['离家远就害怕', '广场恐惧'],
  ['妈妈不在就害怕', '分离焦虑'], ['到校门口就肚子痛', '分离焦虑'], ['在家说话在学校不说', '选择性缄默'],
  ['在家说话很多在学校一句也说不出', '选择性缄默'],
  ['反复拔头发', '拔毛'], ['控制不住拔眉毛', '拔毛'], ['不停抠皮', '皮肤搔抓'], ['反复抠结痂', '皮肤搔抓'],
  ['感觉世界不真实', '现实解体'], ['像站在旁边看自己', '人格解体'], ['有几个小时完全不记得', '解离遗忘'], ['总是失去时间', '身份不连续'],
  ['不是怕胖但不敢吃', '限制性进食'], ['噎过以后不敢吃', '限制性进食'], ['吃墙皮', '异食'], ['总想吃泥土', '异食'],
  ['吃完食物又回到嘴里', '反刍'], ['饭后食物自己回来', '反刍'], ['放假睡得好上班起不来', '时相延迟'],
  ['打呼噜会停住不呼吸', '睡眠呼吸暂停'], ['睡觉憋醒', '睡眠呼吸暂停'], ['腿里像有虫爬', '不宁腿'],
  ['躺下就必须走动', '不宁腿'], ['睡着以后打人', '梦境演绎'], ['梦里挥拳踢腿', '梦境演绎'],
  ['不是缺钱也想偷', '偷窃冲动'], ['偷完才放松', '偷窃冲动'], ['控制不住想点火', '纵火冲动'],
  ['阅读总是跳行', '特定学习困难'], ['口头会但写不出来', '特定学习困难'], ['每次月经前情绪崩溃', '经前心境'],
  ['来月经后就恢复', '经前心境'], ['几乎每天都很易怒', '持续易怒'], ['小事就严重发脾气', '持续易怒'],
  ['系鞋带总学不会', '动作协调困难'], ['写字特别慢还累', '动作协调困难'], ['体育课总跟不上', '动作协调困难'],
  ['听不懂长指令', '语言理解困难'], ['听不懂指令', '语言理解困难'], ['指令就听不懂', '语言理解困难'], ['知道意思但说不完整', '语言表达困难'], ['讲故事没有顺序', '语言表达困难'],
  ['总把反话当真', '语用沟通困难'], ['不知道什么时候该说什么', '语用沟通困难'], ['聊天不知道什么时候停', '语用沟通困难'],
  ['有几个音发不准', '发音困难'], ['音一直发不准', '发音困难'], ['发音不准', '发音困难'], ['别人总听不清我说话', '发音困难'], ['别人听不清', '发音困难'],
  ['第一个字卡住', '口吃'], ['说话总是卡住', '口吃'], ['怕口吃不敢接电话', '口吃'],
  ['晚上总尿床', '遗尿'], ['睡着后尿床', '遗尿'], ['白天总憋不住尿', '遗尿'],
  ['内裤总是有大便', '遗粪'], ['怕痛一直憋大便', '遗粪'], ['把脏内裤藏起来', '遗粪'],
  ['受伤也不找大人', '依恋退缩'], ['不找熟悉的大人', '依恋退缩'], ['不找大人安慰', '依恋退缩'], ['别人安慰也没反应', '依恋退缩'],
  ['见陌生人就跟着走', '陌生人边界不足'], ['跟陌生人走', '陌生人边界不足'], ['陌生人就牵手', '陌生人边界不足'], ['谁来都可以牵走', '陌生人边界不足'],
  ['紧张时反复撞头', '刻板运动'], ['反复撞头', '刻板运动'], ['身体撞头', '刻板运动'], ['摇身体', '刻板运动'], ['一直摇身体', '刻板运动'], ['高兴时一直拍手摇晃', '刻板运动'],
  ['后半夜梦里挥拳', 'REM 梦境演绎'], ['梦里打人醒来真的打了', 'REM 梦境演绎'],
  ['半夜走来走去第二天不记得', 'NREM 梦游'], ['睡着后走', 'NREM 梦游'], ['第二天完全不记得', 'NREM 梦游'], ['前半夜突然尖叫', 'NREM 睡惊'],
  ['每天做同一个噩梦', '反复梦魇'], ['害怕睡觉因为会做噩梦', '反复梦魇'],
  ['心跳快怕热手抖', '甲状腺异常'], ['怕冷没力气脑子变慢', '甲状腺异常'],
  ['加大激素后几天不睡', '糖皮质激素精神症状'], ['吃激素后觉得被监视', '糖皮质激素精神症状'],
  ['多发性硬化后脑子变慢', 'MS 神经精神表现'], ['多发性硬化', 'MS 神经精神表现'], ['复发后特别疲劳抑郁', 'MS 神经精神表现'],
  ['HIV 后工作速度变慢', 'HIV 认知改变'], ['抗病毒治疗时注意力变差', 'HIV 认知改变'],
  ['肝病后白天睡晚上乱', '肝性脑病'], ['肝硬化', '肝性脑病'], ['白天睡晚上乱', '肝性脑病'], ['肝硬化后突然认不得人', '肝性脑病'],
  ['透析前脑子糊涂', '尿毒症脑病'], ['肾衰竭后手脚抽动说话乱', '尿毒症脑病'],
  ['生孩子后一直低落', '围产期抑郁'], ['孩子睡了也完全睡不着', '围产期抑郁'],
  ['产后觉得孩子被替换', '产后精神病'], ['产后几天不睡还听到声音', '产后精神病'],
  ['吃抗抑郁药后性欲下降', '药物相关性功能改变'], ['抗抑郁药后性欲', '药物相关性功能改变'], ['性欲和高潮', '药物相关性功能改变'], ['亲密时总担心失败', '性功能困扰']
];

const CONCEPT_EXPANSIONS = [
  { triggers: ['睡眠需求下降', '精力旺盛', '冲动消费', '冲动投资'], terms: ['躁狂', '少睡', '精力旺盛', '冲动'] },
  { triggers: ['幻听'], terms: ['听见声音', '评论性声音', '精神病性症状'] },
  { triggers: ['被害'], terms: ['被害体验', '监视', '跟踪', '精神病性症状'] },
  { triggers: ['强迫', '检查'], terms: ['强迫观念', '强迫行为', '重复检查', '仪式'] },
  { triggers: ['创伤', '噩梦', '闪回', '再体验'], terms: ['创伤', '闪回', '噩梦', '回避', '警觉'] },
  { triggers: ['谵妄', '视幻觉'], terms: ['急性', '意识', '定向', '波动', '视幻觉'] },
  { triggers: ['记忆下降', '迷路', '认知下降'], terms: ['记忆', '认知', '迷路', '重复提问'] },
  { triggers: ['脑外伤', '处理速度变慢'], terms: ['脑外伤', '头痛', '易怒', '处理速度'] },
  { triggers: ['外貌缺陷', '美容操作'], terms: ['外貌', '缺陷', '美容', '不敢出门'] },
  { triggers: ['赌博', '追损'], terms: ['赌博', '追损', '借债', '失控'] },
  { triggers: ['游戏失控'], terms: ['游戏', '控制失败', '昼夜颠倒', '休学'] },
  { triggers: ['暴食'], terms: ['暴食', '失控进食', '大量进食'] },
  { triggers: ['猝倒', '睡眠发作'], terms: ['发作性睡病', '猝倒', '日间睡眠发作'] },
  { triggers: ['睡眠惯性'], terms: ['嗜睡', '醒来困难', '睡眠惯性'] },
  { triggers: ['抽动', '发声抽动'], terms: ['抽动', '运动抽动', '发声抽动'] },
  { triggers: ['攻击', '盗窃'], terms: ['品行', '攻击', '盗窃', '严重违规'] },
  { triggers: ['发育迟缓'], terms: ['发育', '学习困难', '适应功能'] },
  { triggers: ['认知波动', '具体视幻觉'], terms: ['认知波动', '视幻觉', '帕金森样', '梦境演绎'] },
  { triggers: ['人格改变'], terms: ['人格改变', '去抑制', '进行性', '器质性'] },
  { triggers: ['脑炎红旗'], terms: ['快速进展', '发热', '抽搐', '异常运动', '脑炎'] },
  { triggers: ['低血糖'], terms: ['低血糖', '出汗', '手抖', '意识混乱'] },
  { triggers: ['咖啡因'], terms: ['咖啡因', '心悸', '震颤', '失眠'] },
  { triggers: ['致幻剂', '知觉重现'], terms: ['致幻剂', '视觉改变', '拖影', '知觉重现'] },
  { triggers: ['吸入剂'], terms: ['吸入剂', '溶剂', '喷雾', '步态不稳'] },
  { triggers: ['广场恐惧'], terms: ['广场恐惧', '独自外出', '陪同', '难以逃离'] },
  { triggers: ['分离焦虑'], terms: ['分离焦虑', '拒学', '依恋对象', '担心出事'] },
  { triggers: ['选择性缄默'], terms: ['选择性缄默', '学校不语', '场景特异'] },
  { triggers: ['拔毛'], terms: ['拔毛', '眉毛', '睫毛', '停止失败'] },
  { triggers: ['皮肤搔抓'], terms: ['抠皮', '结痂', '皮肤损伤', '感染'] },
  { triggers: ['人格解体', '现实解体'], terms: ['人格解体', '现实解体', '不真实感', '现实检验'] },
  { triggers: ['解离遗忘', '身份不连续'], terms: ['记忆空白', '失去时间', '身份不连续', '解离'] },
  { triggers: ['限制性进食'], terms: ['限制性进食', '噎住', '感觉敏感', '不是怕胖'] },
  { triggers: ['异食'], terms: ['异食', '非食物', '泥土', '墙皮'] },
  { triggers: ['反刍'], terms: ['反刍', '餐后返流', '重新咀嚼'] },
  { triggers: ['时相延迟'], terms: ['时相延迟', '晚睡晚起', '自由作息', '昼夜节律'] },
  { triggers: ['睡眠呼吸暂停'], terms: ['打鼾', '呼吸暂停', '憋醒', '日间嗜睡'] },
  { triggers: ['不宁腿'], terms: ['不宁腿', '活动冲动', '夜间', '走动缓解'] },
  { triggers: ['梦境演绎'], terms: ['梦境演绎', '挥打', '异态睡眠', '夜间伤害'] },
  { triggers: ['偷窃冲动'], terms: ['偷窃冲动', '紧张', '释放', '非经济动机'] },
  { triggers: ['纵火冲动'], terms: ['纵火', '火源', '冲动', '公共安全'] },
  { triggers: ['特定学习困难'], terms: ['阅读困难', '书写困难', '学习障碍', '针对性教学'] },
  { triggers: ['经前心境'], terms: ['经前', '周期性', '经后缓解', '易怒'] },
  { triggers: ['持续易怒'], terms: ['持续易怒', '脾气爆发', '儿童', '多场景'] },
  { triggers: ['动作协调困难'], terms: ['动作协调', '书写', '系鞋带', '运动发育'] },
  { triggers: ['语言理解困难', '语言表达困难'], terms: ['语言障碍', '理解语言', '表达语言', '多步骤指令'] },
  { triggers: ['语用沟通困难'], terms: ['语用沟通', '非字面语言', '对话轮流', '社会沟通'] },
  { triggers: ['发音困难'], terms: ['言语声音', '发音', '可理解度'] },
  { triggers: ['口吃'], terms: ['口吃', '言语阻塞', '流畅性', '表达回避'] },
  { triggers: ['遗尿'], terms: ['尿床', '夜间遗尿', '白天尿急'] },
  { triggers: ['遗粪'], terms: ['遗粪', '便秘', '憋便', '内裤污迹'] },
  { triggers: ['依恋退缩'], terms: ['反应性依恋', '寻求安慰少', '照料不稳定'] },
  { triggers: ['陌生人边界不足'], terms: ['脱抑制性社会参与', '陌生人', '跟随', '走失'] },
  { triggers: ['刻板运动'], terms: ['刻板动作', '重复动作', '撞头', '感官负荷'] },
  { triggers: ['REM 梦境演绎'], terms: ['快速眼动睡眠行为', '后半夜', '梦境演绎', '醒后记得'] },
  { triggers: ['NREM 梦游', 'NREM 睡惊'], terms: ['非快速眼动觉醒', '前半夜', '梦游', '次日遗忘'] },
  { triggers: ['反复梦魇'], terms: ['梦魇', '反复噩梦', '醒后记得', '睡眠恐惧'] },
  { triggers: ['甲状腺异常'], terms: ['甲状腺', '心悸', '怕热', '怕冷', '手抖'] },
  { triggers: ['糖皮质激素精神症状'], terms: ['糖皮质激素', '加量', '失眠', '躁狂', '精神病性症状'] },
  { triggers: ['MS 神经精神表现'], terms: ['多发性硬化', '疲劳', '处理速度', '复发'] },
  { triggers: ['HIV 认知改变'], terms: ['HIV', '处理速度', '认知', '抗病毒治疗'] },
  { triggers: ['肝性脑病'], terms: ['肝病', '意识波动', '日夜颠倒', '扑翼样震颤'] },
  { triggers: ['尿毒症脑病'], terms: ['肾衰竭', '透析', '意识改变', '肌肉抽动'] },
  { triggers: ['围产期抑郁'], terms: ['孕期', '产后', '抑郁', '内疚', '睡眠'] },
  { triggers: ['产后精神病'], terms: ['产后', '幻觉', '妄想', '严重失眠', '婴儿安全'] },
  { triggers: ['药物相关性功能改变', '性功能困扰'], terms: ['性功能', '性欲', '高潮', '药物', '亲密关系'] }
];

const TARGET_RULES = [
  { triggers: ['睡眠需求下降', '精力旺盛', '冲动消费', '冲动投资'], targets: { bipolar: 55, cyclothymic: 18 } },
  { triggers: ['幻听'], targets: { schizophrenia: 35, schizoaffective: 18, 'substance-induced-psychosis': 12 } },
  { triggers: ['被害'], targets: { schizophrenia: 22, 'delusional-disorder': 20, schizoaffective: 10, 'substance-induced-psychosis': 10 } },
  { triggers: ['强迫', '检查'], targets: { ocd: 48 } },
  { triggers: ['创伤', '噩梦', '闪回', '再体验'], targets: { ptsd: 48, 'acute-stress': 20 } },
  { triggers: ['谵妄', '视幻觉'], targets: { delirium: 60 } },
  { triggers: ['脑外伤'], targets: { 'tbi-related-mental': 60 } },
  { triggers: ['外貌缺陷', '美容操作'], targets: { 'body-dysmorphic': 55 } },
  { triggers: ['赌博', '追损'], targets: { 'gambling-disorder': 55 } },
  { triggers: ['游戏失控'], targets: { 'gaming-disorder': 55 } },
  { triggers: ['暴食'], targets: { 'binge-eating': 50, bulimia: 12 } },
  { triggers: ['猝倒', '睡眠发作'], targets: { narcolepsy: 60 } },
  { triggers: ['睡眠惯性'], targets: { hypersomnolence: 50 } },
  { triggers: ['抽动', '发声抽动'], targets: { 'tic-disorder': 55 } },
  { triggers: ['攻击', '盗窃'], targets: { 'conduct-disorder': 40, 'intermittent-explosive': 18 } },
  { triggers: ['发育迟缓'], targets: { 'intellectual-developmental': 55 } },
  { triggers: ['认知波动', '具体视幻觉'], targets: { 'lewy-body-neurocognitive': 65, 'parkinsons-neurocognitive': 18 } },
  { triggers: ['人格改变'], targets: { 'frontotemporal-neurocognitive': 48, 'brain-tumor-related-mental': 20, 'tbi-related-mental': 15 } },
  { triggers: ['脑炎红旗'], targets: { 'encephalitis-related-mental': 75 } },
  { triggers: ['低血糖'], targets: { 'hypoglycemia-related-mental': 110 } },
  { triggers: ['咖啡因'], targets: { 'caffeine-related': 65 } },
  { triggers: ['致幻剂', '知觉重现'], targets: { 'hallucinogen-use': 65 } },
  { triggers: ['吸入剂'], targets: { 'inhalant-use': 65 } },
  { triggers: ['广场恐惧'], targets: { agoraphobia: 65, panic: 15 } },
  { triggers: ['分离焦虑'], targets: { 'separation-anxiety': 65 } },
  { triggers: ['选择性缄默'], targets: { 'selective-mutism': 100 } },
  { triggers: ['拔毛'], targets: { trichotillomania: 70 } },
  { triggers: ['皮肤搔抓'], targets: { excoriation: 70 } },
  { triggers: ['人格解体', '现实解体'], targets: { 'depersonalization-derealization': 65, dissociative: 16 } },
  { triggers: ['解离遗忘'], targets: { 'dissociative-amnesia': 70, dissociative: 15 } },
  { triggers: ['身份不连续'], targets: { 'dissociative-identity': 70, dissociative: 15 } },
  { triggers: ['限制性进食'], targets: { arfid: 70, anorexia: 8 } },
  { triggers: ['异食'], targets: { pica: 70 } },
  { triggers: ['反刍'], targets: { 'rumination-disorder': 70 } },
  { triggers: ['时相延迟'], targets: { 'circadian-rhythm-sleep': 70, insomnia: 10 } },
  { triggers: ['睡眠呼吸暂停'], targets: { 'obstructive-sleep-apnea': 75, hypersomnolence: 10 } },
  { triggers: ['不宁腿'], targets: { 'restless-legs': 70, insomnia: 8 } },
  { triggers: ['梦境演绎'], targets: { parasomnia: 70 } },
  { triggers: ['偷窃冲动'], targets: { kleptomania: 70, 'conduct-disorder': 5 } },
  { triggers: ['纵火冲动'], targets: { pyromania: 75 } },
  { triggers: ['特定学习困难'], targets: { 'specific-learning': 70 } },
  { triggers: ['经前心境'], targets: { 'premenstrual-dysphoric': 70, depression: 8 } },
  { triggers: ['持续易怒'], targets: { 'disruptive-mood-dysregulation': 55, 'oppositional-defiant': 18 } },
  { triggers: ['动作协调困难'], targets: { 'developmental-coordination': 80, 'specific-learning': 8 } },
  { triggers: ['语言理解困难', '语言表达困难'], targets: { 'language-disorder': 85, 'intellectual-developmental': 8 } },
  { triggers: ['语用沟通困难'], targets: { 'social-pragmatic-communication': 85, autism: 12 } },
  { triggers: ['发音困难'], targets: { 'speech-sound-disorder': 85, 'language-disorder': 8 } },
  { triggers: ['口吃'], targets: { 'childhood-onset-fluency': 90, 'social-anxiety': 8 } },
  { triggers: ['遗尿'], targets: { enuresis: 90 } },
  { triggers: ['遗粪'], targets: { encopresis: 90 } },
  { triggers: ['依恋退缩'], targets: { 'reactive-attachment': 90, autism: 6 } },
  { triggers: ['陌生人边界不足'], targets: { 'disinhibited-social-engagement': 95, adhd: 5 } },
  { triggers: ['刻板运动'], targets: { 'stereotypic-movement': 85, autism: 10, 'tic-disorder': 6 } },
  { triggers: ['REM 梦境演绎'], targets: { 'rem-sleep-behavior': 100, parasomnia: 10, 'lewy-body-neurocognitive': 8 } },
  { triggers: ['NREM 梦游', 'NREM 睡惊'], targets: { 'non-rem-arousal': 100, parasomnia: 10 } },
  { triggers: ['反复梦魇'], targets: { 'nightmare-disorder': 85, ptsd: 12 } },
  { triggers: ['甲状腺异常'], targets: { 'thyroid-related-mental': 110, gad: 6, depression: 6 } },
  { triggers: ['糖皮质激素精神症状'], targets: { 'corticosteroid-induced-mental': 115, bipolar: 8, 'substance-induced-psychosis': 5 } },
  { triggers: ['MS 神经精神表现'], targets: { 'multiple-sclerosis-neuropsychiatric': 105 } },
  { triggers: ['HIV 认知改变'], targets: { 'hiv-associated-neurocognitive': 105 } },
  { triggers: ['肝性脑病'], targets: { 'hepatic-encephalopathy': 120, delirium: 10 } },
  { triggers: ['尿毒症脑病'], targets: { 'uremic-encephalopathy': 120, delirium: 10 } },
  { triggers: ['围产期抑郁'], targets: { 'perinatal-depression': 100, depression: 12 } },
  { triggers: ['产后精神病'], targets: { 'postpartum-psychosis': 130, bipolar: 10 } },
  { triggers: ['药物相关性功能改变', '性功能困扰'], targets: { 'sexual-dysfunction': 95 } }
];

const RISK_RULES = [
  { level: 'critical', label: '自伤/自杀风险', terms: ['自杀', '轻生', '不想活', '活着没有意义', '伤害自己', '自伤', '想死', '跳楼', '割腕', '命令性声音'] },
  { level: 'critical', label: '伤人或暴力风险', terms: ['伤人', '杀人', '攻击', '拿刀', '武器', '暴力', '要报复', '放火', '纵火', '伤婴', '伤害婴儿', '伤害孩子'] },
  { level: 'critical', label: '急性躯体/中毒风险', terms: ['胸痛', '严重呼吸困难', '晕厥', '抽搐', '高热', '意识不清', '呼吸变慢', '服药过量', '中毒', '不醒', '吞电池', '吞磁铁'] },
  { level: 'warning', label: '反复身体伤害风险', terms: ['撞头', '咬伤自己', '反复打自己'] },
  { level: 'warning', label: '需要尽快专业评估', terms: ['几天不睡', '无法进食', '无法喝水', '走失', '幻觉', '被害', '戒断', '严重失眠'] }
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();
}

function listValue(value) {
  return Array.isArray(value) ? value.join(' ') : String(value || '');
}

function aliasValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item || '').split(/[·、,，;/；|]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function textOf(item, fields) {
  return fields.map(([field]) => listValue(item[field])).join(' ');
}

function extractTerms(query, data) {
  const raw = String(query || '').toLowerCase();
  const normalized = normalize(raw);
  const terms = new Set();
  PHRASE_ALIASES.forEach(([phrase, canonical]) => {
    if (normalized.includes(normalize(phrase))) {
      terms.add(phrase);
      terms.add(canonical);
    }
  });
  CONCEPT_EXPANSIONS.forEach(({ triggers, terms: expandedTerms }) => {
    if (triggers.some((trigger) => terms.has(trigger) || normalized.includes(normalize(trigger)))) {
      expandedTerms.forEach((term) => terms.add(term));
    }
  });
  raw.split(/[，。！？；、,!?;\s]+/).map(normalize).filter((term) => term.length >= 2 && !RISK_RULES.some((rule) => rule.terms.some((riskTerm) => term.includes(normalize(riskTerm))))).forEach((term) => terms.add(term));
  const vocabulary = [];
  [...(data.disorders || []), ...(data.cases || [])].forEach((item) => {
    [...SEARCH_FIELDS, ...CASE_FIELDS].forEach(([field]) => {
      const value = item[field];
      if (Array.isArray(value)) vocabulary.push(...value);
      else if (value) vocabulary.push(value);
    });
  });
  vocabulary.filter((term) => normalize(term).length >= 2).forEach((term) => {
    const normalizedTerm = normalize(term);
    if (normalized.includes(normalizedTerm)) terms.add(term);
  });
  return [...terms].filter(Boolean);
}

function scoreItem(item, fields, terms) {
  const scoreParts = [];
  let score = 0;
  fields.forEach(([field, weight]) => {
    const value = normalize(listValue(item[field]));
    if (!value) return;
    const hits = terms.filter((term) => value.includes(normalize(term)));
    if (!hits.length) return;
    score += hits.reduce((total, term) => total + weight * Math.min(2, Math.max(1, normalize(term).length / 2)), 0);
    scoreParts.push(...hits.slice(0, 2));
  });
  return { score, hits: [...new Set(scoreParts)].slice(0, 5) };
}

function targetBoost(item, terms) {
  const termSet = new Set(terms.map(normalize));
  return TARGET_RULES.reduce((total, rule) => {
    if (!rule.triggers.some((trigger) => termSet.has(normalize(trigger)))) return total;
    return total + (rule.targets[item.id] || 0);
  }, 0);
}

function trimRanked(results, limit = 5) {
  if (!results.length) return [];
  const threshold = Math.max(8, results[0].score * 0.35);
  return results.filter((result) => result.score >= threshold).slice(0, limit);
}

export function detectRisk(query) {
  const normalized = normalize(query);
  const matches = RISK_RULES.filter((rule) => rule.terms.some((term) => normalized.includes(normalize(term))));
  if (!matches.length) return null;
  return {
    level: matches.some((rule) => rule.level === 'critical') ? 'critical' : 'warning',
    labels: matches.map((rule) => rule.label),
    message: matches.some((rule) => rule.level === 'critical')
      ? '描述中出现了需要优先处理的危险线索。请先联系身边可信任的人、当地急救或危机干预服务，不要独处。'
      : '描述中出现了需要尽快进行专业评估的线索。若情况正在加重，请联系当地医疗服务。'
  };
}

export function matchKnowledge(query, data) {
  const rawQuery = String(query || '');
  const normalizedQuery = normalize(rawQuery);
  if (!normalizedQuery) return { risk: null, disorders: [], cases: [], drugs: [], directDrugHint: false };
  const terms = extractTerms(rawQuery, data);
  const risk = detectRisk(rawQuery);
  const scoringTerms = risk?.level === 'critical' ? [] : terms;
  const scoredDisorders = data.disorders.map((item) => {
    const result = scoreItem(item, SEARCH_FIELDS, scoringTerms);
    return { item, score: result.score + targetBoost(item, scoringTerms), hits: result.hits };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score);
  const disorders = trimRanked(scoredDisorders);
  const disorderScores = new Map(disorders.map(({ item, score }) => [item.id, score]));
  const scoredCases = data.cases.map((item) => {
    const result = scoreItem(item, CASE_FIELDS, scoringTerms);
    const relatedScore = disorderScores.get(item.disorderId) || 0;
    return { item, score: relatedScore ? result.score + relatedScore * 0.28 : 0, hits: result.hits };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score);
  const cases = trimRanked(scoredCases);
  const relevantDisorderIds = new Set([...disorders.map(({ item }) => item.id), ...cases.map(({ item }) => item.disorderId)]);
  const drugIds = new Set(data.disorders.filter((item) => relevantDisorderIds.has(item.id)).flatMap((item) => item.relatedDrugIds || []));
  const drugs = data.drugs.filter((item) => drugIds.has(item.id)).slice(0, 8);
  const directDrugHint = data.drugs.some((item) => {
    const candidates = [item.name, item.englishName, ...aliasValues(item.aliases)]
      .map(normalize)
      .filter(Boolean);
    return candidates.some((candidate) => normalizedQuery.includes(candidate));
  });
  return { risk, disorders, cases, drugs, directDrugHint };
}
