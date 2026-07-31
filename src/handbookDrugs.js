import { drugSideEffectsById, drugSideEffectsByProfile } from './drugSideEffects.js';

const source = '依据本项目本地资料《精神药物手册》相关分类与药物专论整理；面向公众改写，不保留页码。';

const profiles = {
  ssri: {
    className: '选择性 5-羟色胺再摄取抑制剂（SSRI）',
    indication: '常用于抑郁障碍，也用于强迫症、惊恐障碍、创伤后应激障碍、社交焦虑等，具体适应证因药物和地区而异。',
    action: '主要通过抑制 5-HT 再摄取，逐步改变突触间隙中的 5-HT 信号。疗效通常在连续治疗数周后评估，早期需观察情绪激越和自伤风险变化。',
    kinetics: '多能完全吸收并经肝脏代谢，部分药物影响 CYP450 酶。氟西汀及其活性代谢物半衰期较长，舍曲林等药物的暴露会受肝肾功能与进食影响。',
    interactions: '与 MAOI、亚甲蓝、部分 5-HT 能药物合用可能增加血清素综合征风险；与 NSAID、阿司匹林、抗凝或抗血小板药物合用需关注出血风险。',
    sideEffects: '常见恶心、腹泻或消化不适、头痛、出汗、失眠或嗜睡，以及性欲下降、延迟射精或高潮困难。开始用药或调整剂量后，少数人会短暂感到焦虑或激越。',
    contraindications: '既往过敏、合并使用 MAOI 等情况需遵循说明书禁忌。治疗早期、加量或减量时监测躁狂、自伤意念、低钠血症、出血与撤药反应。'
  },
  ndri: {
    className: '去甲肾上腺素多巴胺再摄取抑制剂（NDRI）',
    indication: '用于抑郁障碍、季节性情绪失调和戒烟辅助；对 ADHD 等情境有研究支持但需个体化评估。',
    action: '抑制去甲肾上腺素和多巴胺再摄取，通常较少引起性功能障碍和体重增加，但可能提高激活、失眠和焦虑感。',
    kinetics: '经肝脏代谢并形成活性代谢物，剂型和给药间隔会影响峰浓度。肝肾功能下降时可能需要降低暴露。',
    interactions: 'CYP2B6 抑制剂或诱导剂会改变浓度；与 MAOI、降低癫痫阈值的药物、兴奋剂和酒精合用需谨慎。',
    sideEffects: '常见口干、恶心、头痛、失眠、焦虑或激越、震颤、食欲下降和体重减轻，也可能使血压或心率升高。',
    contraindications: '癫痫、进食障碍、突然停酒或镇静药物戒断等情况通常不宜使用；出现癫痫、明显血压升高或躁狂迹象应就医。'
  },
  snri: {
    className: '5-羟色胺去甲肾上腺素再摄取抑制剂（SNRI）',
    indication: '用于抑郁障碍、广泛性焦虑、社交焦虑、惊恐障碍；度洛西汀还用于部分神经病理性痛和慢性肌肉骨骼疼痛。',
    action: '同时抑制 5-HT 和去甲肾上腺素再摄取，随着剂量变化去甲肾上腺素作用可能更明显，需关注焦虑、血压和心率。',
    kinetics: '多经肝脏 CYP 酶和葡萄糖醛酸化代谢，部分代谢物有活性；度洛西汀与文拉法辛在肝肾功能异常时暴露会明显变化。',
    interactions: '与 MAOI、其他 5-HT 能药物、曲马朵、止吐药和抗凝/抗血小板药物联用需评估血清素综合征、出血及血压风险。',
    sideEffects: '常见恶心、口干、头晕、出汗、失眠或嗜睡、便秘和性功能变化；部分人会出现心率或血压升高，突然停药还可能产生明显撤药不适。',
    contraindications: '血压控制不稳、严重肝病或严重肾功能不全者需遵循说明书限制。避免突然停药，出现高血压、躁狂、肝损伤或严重撤药反应应就医。'
  },
  sari: {
    className: '5-羟色胺-2 受体拮抗剂 / 再摄取抑制剂（SARI）',
    indication: '用于抑郁障碍；曲唑酮常被用于伴失眠的情境，奈法唑酮的使用需特别关注肝脏安全。',
    action: '兼有 5-HT2 受体拮抗和 5-HT 再摄取抑制作用，可能减轻部分 5-HT 相关副作用，但镇静、体位性低血压和性功能变化仍需观察。',
    kinetics: '经肝脏 CYP3A4 等途径代谢，食物、肝功能和合并用药会影响峰浓度及半衰期。',
    interactions: 'CYP3A4 抑制剂可提高浓度；与酒精、镇静药、抗高血压药和其他 5-HT 能药物合用可能增加嗜睡、低血压或血清素综合征风险。',
    sideEffects: '常见嗜睡、头晕、口干、恶心、便秘和体位性低血压。不同药物还需分别留意性功能变化、心律问题，以及少见但严重的持续勃起或肝损伤。',
    contraindications: '奈法唑酮存在严重肝损伤警示；曲唑酮需警惕阴茎异常勃起、心律问题、低血压与跌倒，出现持续或严重症状应立即就医。'
  },
  serotonergic: {
    className: '5-HT 调节剂',
    indication: '主要用于抑郁障碍；部分药物在焦虑障碍等情境有研究支持。',
    action: '通过 5-HT 再摄取抑制并调节特定 5-HT 受体产生作用，机制更复杂，治疗反应和耐受性存在个体差异。',
    kinetics: '经肝脏 CYP 酶代谢，药物相互作用可能改变暴露；部分药物需随餐服用以改善吸收。',
    interactions: '与 MAOI、亚甲蓝、其他 5-HT 能药物合用可增加血清素综合征风险；强 CYP2D6 或 CYP3A4 抑制剂可能需要调整剂量。',
    sideEffects: '常见恶心、腹泻、头痛、头晕、睡眠改变和性功能变化；用药初期可能短暂出现烦躁或坐立不安。',
    contraindications: '治疗早期应观察激越、躁狂、自伤意念、低钠血症与过敏反应；不要自行突然停药或改变给药方式。'
  },
  nassa: {
    className: '去甲肾上腺素能 / 特异性 5-羟色胺能抗抑郁药物（NaSSA）',
    indication: '用于抑郁障碍，尤其是伴焦虑、失眠或食欲下降的患者；其他焦虑障碍有初步研究支持。',
    action: '增强去甲肾上腺素和 5-HT 能传递，同时阻断部分 5-HT2/5-HT3 与 H1 受体，因此镇静和食欲变化较突出。',
    kinetics: '口服吸收较好，主要经 CYP1A2、CYP2D6 和 CYP3A4 代谢；吸烟、肝功能与合并用药会影响暴露。',
    interactions: '与 MAOI、其他 5-HT 能药物和中枢抑制剂合用需谨慎；吸烟可降低血药浓度，CYP3A4 抑制剂可能增加暴露。',
    sideEffects: '常见嗜睡、食欲增加、体重增加、口干、便秘和头晕；少数人可出现水肿、异常梦境或血脂变化。',
    contraindications: '需关注嗜睡、体重和代谢变化；出现发热、咽痛等感染迹象需排查粒细胞减少，双相障碍患者应监测躁狂。'
  },
  tca: {
    className: '非选择性环类抗抑郁药物（混合性再摄取抑制剂 / 受体阻滞剂）',
    indication: '用于抑郁障碍、部分慢性疼痛和强迫症等；过量风险和不良反应通常高于较新的抗抑郁药。',
    action: '抑制 5-HT 和去甲肾上腺素再摄取，同时作用于胆碱能、组胺和肾上腺素受体，因而产生多系统效应。',
    kinetics: '经肝脏 CYP2D6 等途径代谢，个体代谢差异明显；血药浓度、年龄和合并用药会影响镇静与心脏风险。',
    interactions: '与 MAOI、其他 5-HT 能药、抗胆碱能药、心律药物和中枢抑制剂合用可能导致严重相互作用。',
    sideEffects: '常见口干、便秘、视物模糊、排尿困难、嗜睡、体重增加、出汗和体位性头晕，也可能影响心率或心脏传导。',
    contraindications: '心律失常、近期心肌梗死、闭角型青光眼、尿潴留和高自杀风险患者需严格评估；过量可致致命性心律失常。'
  },
  maoi: {
    className: '单胺氧化酶抑制剂（MAOI）',
    indication: '用于部分难治性或非典型抑郁障碍，通常在其他方案效果不足时由专科人员考虑。',
    action: '抑制单胺氧化酶，减少 5-HT、去甲肾上腺素和多巴胺的分解，增强多种单胺信号。',
    kinetics: '不同制剂的可逆性、选择性和抑制持续时间不同；停药后仍需保留足够的洗脱间隔。',
    interactions: '与 5-HT 能药、拟交感药、哌替啶、右美沙芬、曲马朵和含大量酪胺食物可能导致血清素综合征或高血压危象。',
    sideEffects: '常见头晕、体位性低血压、口干、恶心、失眠或嗜睡、体重变化和性功能变化；部分人会出现水肿或便秘。',
    contraindications: '必须遵守药物和饮食限制，避免与禁忌药物重叠；出现剧烈头痛、发热、肌强直、意识改变或胸痛应急诊。'
  },
  sga: {
    className: '第二代抗精神病药物（SGA）',
    indication: '用于精神分裂症谱系障碍、双相障碍躁狂或维持治疗等，具体适应证依药物而异。',
    action: '多通过多巴胺 D2 与 5-HT2A 等受体的拮抗或调节改善阳性症状、躁动及部分情绪症状，同时影响代谢、运动和泌乳素系统。',
    kinetics: '大多经肝脏 CYP 酶代谢，吸烟、肝功能和合并用药会改变浓度；长效针剂还受给药间隔和制剂释放影响。',
    interactions: '与酒精、中枢抑制剂、影响 CYP1A2/CYP3A4 的药物和其他延长 QT 的药物联用需评估镇静、心律和代谢风险。',
    sideEffects: '常见嗜睡、头晕、口干、便秘、食欲或体重增加。不同药物还可能引起血糖血脂变化、静坐不能或其他运动症状，以及泌乳素升高。',
    contraindications: '需监测体重、腰围、血糖、血脂、血压、运动症状和泌乳素；不要自行停药，出现高热肌强直、严重皮疹或意识改变应急诊。'
  },
  tga: {
    className: '第三代抗精神病药物（TGA）',
    indication: '用于精神分裂症、双相障碍躁狂或维持治疗；部分药物可作为抑郁障碍的增效治疗。',
    action: '在多巴胺 D2 受体上兼具部分激动/稳定作用，并影响 5-HT 受体，可能降低部分泌乳素和代谢负担，但静坐不能较突出。',
    kinetics: '主要经 CYP2D6、CYP3A4 等途径代谢，抑制剂或诱导剂可能需要调整剂量。',
    interactions: 'CYP2D6/3A4 抑制剂可提高浓度，诱导剂可降低浓度；与其他中枢活性药物合用需监测激越、嗜睡和心律。',
    sideEffects: '常见静坐不能、烦躁、失眠或嗜睡、恶心、头痛和头晕，也可能出现体位性低血压、震颤或冲动控制变化。',
    contraindications: '需关注静坐不能、冲动控制障碍、躁狂转换和体位性低血压；长效制剂必须由专业人员给药和随访。'
  },
  mood: {
    className: '心境稳定剂 / 抗惊厥药物',
    indication: '用于双相障碍的躁狂、抑郁或维持治疗；部分药物用于癫痫或神经病理性疼痛。',
    action: '通过离子通道、第二信使或神经递质调节降低情绪状态的过度波动；不同药物对躁狂和抑郁的作用侧重不同。',
    kinetics: '锂主要经肾脏排泄，其他药物多经肝脏代谢；血药浓度、肾肝功能、脱水和合并用药会显著影响安全性。',
    interactions: 'NSAID、ACEI/ARB、利尿剂、激素和影响肝酶的药物可能改变浓度或毒性；与其他镇静药合用需观察中枢抑制。',
    sideEffects: '常见恶心、震颤、嗜睡、头晕、体重变化和协调变差；具体药物还可能影响皮肤、肝肾功能、血细胞或电解质。',
    contraindications: '需结合肾功能、肝功能、血常规、甲状腺、妊娠和血药浓度监测。出现严重皮疹、意识改变、共济失调或持续呕吐应立即就医。'
  },
  benzodiazepine: {
    className: '苯二氮䓬类药物',
    indication: '短期用于严重焦虑、惊恐、失眠、肌痉挛或戒断相关症状；不宜将长期使用当作唯一治疗。',
    action: '增强 GABA-A 受体抑制性信号，产生抗焦虑、镇静、肌肉松弛和抗惊厥作用。',
    kinetics: '不同药物半衰期差异很大，主要经肝脏代谢；老年、肝功能下降和多药合用会延长镇静。',
    interactions: '与酒精、阿片类、镇静催眠药和部分抗组胺药合用可导致过度镇静、呼吸抑制和跌倒。',
    sideEffects: '常见嗜睡、头晕、反应变慢、注意和记忆受影响、肌无力及步态不稳；连续使用可能产生耐受、依赖和停药反应。',
    contraindications: '呼吸功能不全、睡眠呼吸暂停、重症肌无力和物质使用风险患者需谨慎；长期使用不能突然停药，应逐步减量。'
  },
  anxiolytic: {
    className: '非苯二氮䓬类抗焦虑药',
    indication: '用于广泛性焦虑障碍，起效慢于苯二氮䓬类，不适合作为急性镇静替代物。',
    action: '主要通过 5-HT1A 部分激动调节焦虑相关网络，不产生典型苯二氮䓬类的肌松和依赖特征。',
    kinetics: '经肝脏 CYP3A4 代谢，达到稳定状态需要连续用药；葡萄柚和 CYP3A4 抑制剂可增加暴露。',
    interactions: '避免与 MAOI 合用；与中枢抑制剂、酒精和影响 CYP3A4 的药物合用需观察嗜睡、头晕和相互作用。',
    sideEffects: '常见头晕、头痛、恶心、紧张、坐立不安或嗜睡；通常不会产生与苯二氮䓬类相同程度的镇静和依赖。',
    contraindications: '不能用于需要快速控制的急性惊恐；肝肾功能异常、妊娠和合并多种精神药物时需先咨询专业人员。'
  },
  stimulant: {
    className: '精神兴奋剂',
    indication: '用于注意缺陷多动障碍（ADHD）等，需结合功能受损、心血管风险和物质使用风险评估。',
    action: '增强去甲肾上腺素和多巴胺信号，改善注意、冲动和活动水平，但可能带来食欲下降、失眠和心率血压变化。',
    kinetics: '不同制剂的起效时间和持续时间差异明显；尿液酸碱度、肝肾功能和合并药物会影响清除。',
    interactions: '与 MAOI、拟交感药、部分抗抑郁药、含咖啡因或降低癫痫阈值的药物合用需谨慎。',
    sideEffects: '常见食欲下降、体重减轻、口干、失眠、头痛、腹痛、心率或血压升高，也可能出现易怒、焦虑或抽动加重。',
    contraindications: '心脏结构或节律疾病、未控制高血压、躁狂或严重物质使用风险患者需专科评估；出现胸痛、晕厥或精神症状应及时就医。'
  },
  atomoxetine: {
    className: '选择性去甲肾上腺素再摄取抑制剂',
    indication: '用于 ADHD，可作为非兴奋剂方案；疗效和起效速度需要与患者年龄、共病和功能目标一起评估。',
    action: '选择性抑制去甲肾上腺素转运体，改善注意和冲动控制，不属于传统精神兴奋剂。',
    kinetics: '主要经 CYP2D6 代谢，代谢慢者或合并 CYP2D6 抑制剂时浓度可能明显升高。',
    interactions: '与 MAOI、影响心率血压的药物及 CYP2D6 抑制剂联用需谨慎，可能增加心血管和激活相关不良反应。',
    sideEffects: '常见恶心、腹痛、食欲下降、口干、头晕、疲乏、嗜睡或失眠，也可能出现心率血压变化以及排尿或性功能方面的不适。',
    contraindications: '需监测血压、心率、肝损伤迹象和自伤意念；出现黄疸、深色尿、胸痛或明显情绪变化应及时就医。'
  },
  alpha2: {
    className: 'α2 激动剂',
    indication: '用于 ADHD 的冲动、多动和睡眠问题，也可用于抽动、高血压或部分焦虑相关情境。',
    action: '降低去甲肾上腺素释放，改善过度唤醒与冲动控制，常见镇静、疲劳和心率血压下降。',
    kinetics: '口服和缓释制剂的峰浓度不同，主要经肝脏代谢和肾脏排泄；不能突然停药以免反跳性高血压。',
    interactions: '与中枢抑制剂、降压药和酒精合用可增强镇静或低血压；与兴奋剂合用需监测心率血压。',
    sideEffects: '常见嗜睡、疲劳、头晕、口干、便秘和头痛，也可能导致低血压、心率减慢或站立时眩晕。',
    contraindications: '低血压、心动过缓、传导异常和肝肾功能异常者需个体化评估；停药必须逐步减量。'
  },
  cholinesterase: {
    className: '胆碱酯酶抑制剂',
    indication: '用于阿尔茨海默病及其他类型痴呆的部分阶段，目标是维持认知和日常功能，不能逆转基础病程。',
    action: '抑制乙酰胆碱酯酶，增加中枢胆碱能信号，可能改善记忆、注意和部分日常功能。',
    kinetics: '不同药物经肝肾途径清除，贴剂、口服液和缓释剂型的暴露方式不同；胃肠道耐受性常需逐步调整。',
    interactions: '与其他胆碱能或抗胆碱能药物作用相反；与减慢心率、增加胃酸或影响 CYP2D6/3A4 的药物合用需评估。',
    sideEffects: '常见恶心、呕吐、腹泻、食欲下降、体重减轻、头晕、失眠和肌肉痉挛，也可能引起心率减慢或晕厥。',
    contraindications: '心动过缓、传导阻滞、消化性溃疡、哮喘、体重下降或癫痫患者需谨慎；出现晕厥、黑便或持续呕吐应就医。'
  },
  memantine: {
    className: '金刚烷胺',
    indication: '用于中重度阿尔茨海默病的症状治疗，可与胆碱酯酶抑制剂联合使用。',
    action: '通过低亲和力、非竞争性 NMDA 受体拮抗减轻谷氨酸过度兴奋，帮助维持认知与功能。',
    kinetics: '主要经肾脏排泄，尿液 pH 和肾功能会影响清除；肾功能下降时需调整剂量。',
    interactions: '与其他 NMDA 拮抗剂、尿液碱化剂或影响肾脏排泄的药物联用需谨慎。',
    sideEffects: '常见头晕、头痛、便秘、嗜睡或意识混乱，也可能出现血压升高、步态不稳或幻觉。',
    contraindications: '严重肾功能不全、癫痫或明显精神症状者需专业评估；出现意识改变、眩晕或步态不稳应及时反馈。'
  },
  substance: {
    className: '物质使用障碍治疗药物',
    indication: '用于乙醇或阿片类物质使用障碍的综合治疗，必须与心理社会支持、风险评估和随访结合。',
    action: '不同药物通过调节谷氨酸、阿片受体或乙醇代谢降低渴求、复饮风险或戒断危险。',
    kinetics: '药物的肝肾清除和半衰期差异明显，肝肾功能、是否仍在使用相关物质及给药依从性会影响风险。',
    interactions: '与阿片类、中枢抑制剂、酒精和影响肝酶的药物合用可能产生严重相互作用；用药前需核对物质使用状态。',
    sideEffects: '不同药物差异较大，常见胃肠道不适、头痛、头晕、疲劳和睡眠改变；涉及阿片受体的药物还可能引起便秘、嗜睡或戒断样不适。',
    contraindications: '急性中毒、严重肝肾功能异常、妊娠和自伤风险需专科评估；出现呼吸抑制、意识改变或严重戒断应急诊。'
  },
  vilazodone: {
    className: '5-羟色胺-1A 受体激动剂 / 5-羟色胺再摄取抑制剂',
    indication: '用于重度抑郁障碍；手册将其列为兼有 5-HT1A 部分激动与再摄取抑制的抗抑郁药。',
    action: '同时抑制 5-HT 转运体并部分激动 5-HT1A 受体，作用谱接近 SSRI 与 SARI 的组合。',
    kinetics: '主要经 CYP3A4 代谢，约 25 小时达消除半衰期；随餐服用可明显提高吸收。',
    interactions: 'CYP3A4 抑制剂可升高暴露，诱导剂可降低疗效；与 MAOI 或其他 5-HT 能药合用增加血清素综合征风险。',
    sideEffects: '常见腹泻、恶心、头痛、头晕、失眠和口干，也可能出现性功能变化或短暂坐立不安。',
    contraindications: '治疗早期需监测自伤意念、躁狂、癫痫、低钠和异常出血；停药应逐步减量。'
  },
  vortioxetine: {
    className: '5-羟色胺激动剂或调节剂',
    indication: '用于重度抑郁障碍；通过多靶点 5-HT 受体调节改善情绪和认知相关症状。',
    action: '抑制 5-HT 再摄取，并对多个 5-HT 受体产生激动、部分激动或拮抗作用。',
    kinetics: '主要经 CYP2D6 代谢，半衰期约 66 小时；强 CYP2D6 抑制剂或诱导剂会改变暴露。',
    interactions: '与 MAOI、其他 5-HT 能药、NSAID/抗凝药合用需评估血清素综合征与出血风险。',
    sideEffects: '恶心最常见，也可能出现便秘、呕吐、头晕、头痛、异常梦境和性功能变化；部分不适会随治疗继续而减轻。',
    contraindications: '治疗初期监测恶心、躁狂、低钠、自伤意念和撤药反应；不要自行突然停药。'
  },
  rima: {
    className: '可逆单胺氧化酶 A 抑制剂（RIMA）',
    indication: '用于重度抑郁障碍，也可在部分慢性或非典型抑郁、社交焦虑情境由专科考虑。',
    action: '可逆性抑制 MAO-A，减少 5-HT、去甲肾上腺素和多巴胺分解。',
    kinetics: '经肝脏代谢，抑制作用停药后相对较快逆转；肝功能异常时需减量。',
    interactions: '转换至其他 5-HT 能药需保留洗脱期；与哌替啶、曲马朵、拟交感药和高酪胺食物合用需谨慎。',
    sideEffects: '常见恶心、口干、头晕、头痛、失眠或焦虑，也可能出现体位性低血压和胃肠道不适。',
    contraindications: '出现剧烈头痛、发热、肌强直、意识改变或血压骤升应急诊；不能自行叠加抗抑郁药。'
  },
  maoi: {
    className: '不可逆单胺氧化酶（A&B）抑制剂（MAOI）',
    indication: '用于部分难治性、非典型或特定焦虑相关抑郁障碍，需在其他方案不足时由专科管理。',
    action: '不可逆抑制 MAO-A 与 MAO-B，增强 5-HT、去甲肾上腺素和多巴胺信号。',
    kinetics: '酶抑制作用持续时间超过血药半衰期，停药后仍需完整洗脱间隔。',
    interactions: '与 5-HT 能药、拟交感药、哌替啶、右美沙芬、曲马朵和高酪胺食物可发生致命相互作用。',
    sideEffects: '常见头晕、体位性低血压、口干、恶心、便秘、失眠或嗜睡，以及体重和性功能变化；部分人可出现水肿。',
    contraindications: '必须遵守饮食与药物限制；出现严重头痛、发热、胸痛、肌强直或意识改变应急诊。'
  },
  maob: {
    className: '不可逆单胺氧化酶 B（MAO-B）抑制剂',
    indication: '手册收录司来吉兰用于抑郁障碍的特定制剂方案，也常见于帕金森病治疗语境。',
    action: '抑制 MAO-B，减少多巴胺分解；高剂量或口服方案可能失去选择性。',
    kinetics: '经肝脏代谢，透皮制剂吸收与贴敷部位有关；酶抑制作用在停药后仍会持续。',
    interactions: '与 SSRI、SNRI、SARI、NaSSA、RIMA、MAOI、哌替啶、曲马朵和拟交感药合用需严格避免。',
    sideEffects: '常见贴敷部位反应、头痛、失眠、头晕和恶心，也可能出现口干或体位性低血压；发生风险与剂量和制剂有关。',
    contraindications: '需执行剂量相关饮食限制；出现高血压危象、血清素综合征、癫痫或意识改变应立即就医。'
  },
  fga: {
    className: '第一代抗精神病药物（FGA）',
    indication: '用于精神分裂症、急性激越、躁狂、谵妄和部分抽动或行为症状，具体适应证因药物而异。',
    action: '主要阻断多巴胺 D2 受体，效价和抗胆碱、抗组胺、α1 阻断作用因化学亚类不同。',
    kinetics: '多数经肝脏 CYP 酶代谢，长效针剂有较长释放和消除时间；年龄与肝功能会改变暴露。',
    interactions: '与延长 QT、中枢抑制、抗胆碱能或降低癫痫阈值药物合用需评估心律、镇静和运动风险。',
    sideEffects: '常见静坐不能、肌肉僵硬、震颤等锥体外系反应，也可出现嗜睡、口干、便秘、体位性低血压和泌乳素升高。',
    contraindications: '需监测锥体外系反应、迟发性运动障碍、QT 延长、体位性低血压和恶性综合征。'
  },
  lithium: {
    className: '锂盐',
    indication: '用于双相障碍躁狂、混合状态、维持治疗和部分抑郁增效；治疗窗较窄。',
    action: '通过第二信使、神经保护和儿茶酚胺/GABA 调节稳定情绪波动。',
    kinetics: '不经肝脏代谢，约 95% 由肾脏排泄；脱水、盐摄入改变和肾功能会迅速改变浓度。',
    interactions: 'NSAID、ACEI/ARB、噻嗪类利尿剂可升高血锂；脱水、发热和低盐饮食也会增加中毒风险。',
    sideEffects: '常见恶心、腹泻、细微震颤、口渴、多尿、体重增加、痤疮和思维变慢；持续呕吐、粗大震颤、步态不稳或意识变化可能提示中毒。',
    contraindications: '需监测血锂、肾功能、甲状腺、血钙和妊娠；粗大震颤、共济失调、持续呕吐或意识改变需急诊。'
  },
  antiepileptic: {
    className: '抗癫痫药物',
    indication: '手册将卡马西平、丙戊酸、加巴喷丁、拉莫三嗪、奥卡西平和托吡酯列入情感稳定剂的抗癫痫药物分区。',
    action: '通过钠/钙通道、GABA 或谷氨酸系统降低神经元过度兴奋；对躁狂、抑郁和维持的证据因药物不同。',
    kinetics: '肝代谢、肾排泄和血药浓度监测需求差异很大；酶诱导或抑制会影响联合用药。',
    interactions: '与激素避孕药、抗凝药、其他抗癫痫药和抗精神病药合用需核对相互作用。',
    sideEffects: '常见头晕、嗜睡、复视、协调不稳和恶心；不同药物还可能引起体重、认知、皮肤、血细胞、肝功能或电解质变化。',
    contraindications: '需结合肝肾功能、血常规、妊娠和严重皮疹风险评估；出现皮疹、黄疸、意识改变或共济失调应就医。'
  },
  gabapentinoid: {
    className: 'GABA 类似物（抗惊厥药物）',
    indication: '用于部分焦虑、神经病理性疼痛和癫痫相关情境；抗焦虑使用通常需个体化并结合指南。',
    action: '结合电压门控钙通道 α2δ 亚基，降低兴奋性递质释放，不直接激动 GABA 受体。',
    kinetics: '加巴喷丁和普瑞巴林主要经肾脏原型排泄，肾功能决定剂量和间隔。',
    interactions: '与阿片类、酒精、苯二氮䓬类和其他中枢抑制剂合用增加嗜睡与呼吸抑制风险。',
    sideEffects: '常见头晕、嗜睡、视物模糊、协调不稳、外周水肿和体重增加，也可能出现注意力或记忆受影响。',
    contraindications: '需关注头晕、共济失调、水肿、体重变化和依赖风险；肾功能不全必须调整剂量。'
  },
  hypnotic: {
    className: '催眠 / 镇静药物',
    indication: '短期用于失眠或围术期镇静；手册强调先处理睡眠节律、躯体因素和共病精神障碍。',
    action: '不同药物通过 GABA-A、组胺、褪黑素或其他中枢通路降低觉醒。',
    kinetics: '起效、半衰期和活性代谢物差异大；高龄、肝肾功能下降和重复给药会延长次日影响。',
    interactions: '与酒精、阿片、苯二氮䓬类和其他中枢抑制剂合用可导致呼吸抑制、跌倒和记忆损害。',
    sideEffects: '常见嗜睡、头晕、反应变慢、记忆受影响和步态不稳，部分药物会造成次日困倦、异常行为或停药反应。',
    contraindications: '睡眠呼吸暂停、呼吸功能不全、物质使用风险和高龄患者需谨慎；长期使用应定期复评并逐步停药。'
  },
  antihistamine: {
    className: '抗组胺药物',
    indication: '可用于短期镇静或睡眠辅助，但不应替代失眠和焦虑的规范评估与长期治疗。',
    action: '阻断中枢 H1 受体产生镇静，并可能伴抗胆碱能作用。',
    kinetics: '多数经肝脏代谢，老年人和肝肾功能异常者清除减慢；口服和注射制剂暴露不同。',
    interactions: '与酒精、阿片、苯二氮䓬类和其他镇静药合用会增强嗜睡、谵妄和呼吸抑制。',
    sideEffects: '常见嗜睡、口干、便秘、视物模糊、排尿困难和头晕，次日困倦及认知变慢在老年人中更明显。',
    contraindications: '闭角型青光眼、尿潴留、前列腺增生、认知脆弱和高龄患者需谨慎。'
  },
  barbiturate: {
    className: '巴比妥类药物',
    indication: '手册将其列为催眠/镇静及物质使用障碍相关分区，现代失眠治疗通常不作为首选。',
    action: '增强 GABA-A 抑制并在较高浓度直接抑制中枢神经活动，镇静范围窄。',
    kinetics: '部分药物半衰期长并诱导 CYP450，反复使用易蓄积和产生耐受。',
    interactions: '与酒精、阿片和其他中枢抑制剂合用可导致致命呼吸抑制；酶诱导会降低多种药物浓度。',
    sideEffects: '常见嗜睡、头晕、协调和记忆受影响、恶心及反应变慢；还可能产生耐受、依赖、停药反应和呼吸抑制。',
    contraindications: '呼吸功能不全、肝病、卟啉病和物质使用风险患者通常避免使用；停药需专业减量。'
  },
  zdrug: {
    className: '非苯二氮䓬类催眠药',
    indication: '用于短期失眠，帮助入睡或维持睡眠；疗程需短并定期评估。',
    action: '主要作用于含 α1 亚基的 GABA-A 受体，产生催眠而非完整的抗焦虑谱。',
    kinetics: '起效快、半衰期短但个体差异明显；CYP3A4 抑制剂、进食和高龄会延长暴露。',
    interactions: '与酒精、阿片、苯二氮䓬类或其他镇静药合用会增加复杂睡眠行为、跌倒和呼吸抑制。',
    sideEffects: '常见次日嗜睡、头晕、头痛、记忆受影响和协调变差；还可能出现异常梦境、口中异味或复杂睡眠行为。',
    contraindications: '睡眠呼吸暂停、重症呼吸疾病、复杂睡眠行为史和物质使用障碍患者需谨慎；不可自行加量。'
  },
  melatonin: {
    className: '选择性褪黑素激动剂',
    indication: '用于入睡困难、昼夜节律紊乱或特定非 24 小时睡眠觉醒节律障碍。',
    action: '激动 MT1/MT2 受体，调节睡眠节律而非强力镇静。',
    kinetics: '经肝脏 CYP1A2/3A4 代谢，吸烟、咖啡因和强 CYP 抑制剂会改变暴露。',
    interactions: '与氟伏沙明等 CYP1A2 抑制剂、酒精和其他镇静药合用需关注嗜睡与节律变化。',
    sideEffects: '常见嗜睡、头晕、头痛、恶心、乏力和梦境变化，少数人会在白天感到注意力下降。',
    contraindications: '需评估肝功能、妊娠哺乳和白天驾驶风险；不能把褪黑素制剂当作长期自我加量的安眠药。'
  },
  dopaminergic: {
    className: '多巴胺类药物',
    indication: '手册在 ADHD 分区列出莫达非尼；其余适应证和使用属于专科或地区差异较大的情境。',
    action: '调节多巴胺转运与觉醒网络，可能提高清醒度和执行功能。',
    kinetics: '经肝脏代谢并影响 CYP 酶，药物相互作用和肝肾功能会改变暴露。',
    interactions: '与激素避孕药、抗癫痫药、抗凝药和其他中枢兴奋/抑制药合用需核对说明书。',
    sideEffects: '常见头痛、恶心、焦虑、紧张、失眠、口干和食欲下降，也可能出现心率血压升高或皮疹。',
    contraindications: '出现皮疹、躁狂、精神病性症状、心率血压升高或严重失眠应停下自行就医。'
  },
  disulfiram: {
    className: '乙醇滥用治疗药物',
    indication: '用于已经选择戒酒并能接受监督的乙醇使用障碍患者，必须与心理社会干预结合。',
    action: '抑制乙醛脱氢酶，使饮酒后乙醛蓄积并产生不适，从而形成行为性威慑。',
    kinetics: '经肝脏代谢，作用可持续数天；肝功能和隐匿性含酒精产品会影响安全性。',
    interactions: '与任何含乙醇制品可引起双硫仑样反应；与华法林、苯妥英和部分镇静药合用需监测。',
    sideEffects: '常见嗜睡、头痛、口中金属或蒜样味、恶心和皮疹；接触酒精可引起面红、呕吐、心悸、低血压等明显反应。',
    contraindications: '严重心脏病、精神病、肝病、妊娠和无法保证监督者需避免；出现黄疸、神经病变或胸痛应就医。'
  },
  opioidMaintenance: {
    className: '阿片类滥用 / 戒断治疗药物',
    indication: '用于阿片使用障碍的维持治疗或戒断管理，需要有资质团队、心理社会支持和随访。',
    action: '丁丙诺啡/纳洛酮降低戒断与渴求，美沙酮以长效 μ 受体激动作用稳定阿片受体。',
    kinetics: '舌下、口服和长效制剂暴露不同；CYP3A4/2B6、肝功能和累积半衰期影响安全性。',
    interactions: '与酒精、苯二氮䓬类、其他阿片和中枢抑制剂合用可导致呼吸抑制；美沙酮还需关注 QT 延长。',
    sideEffects: '常见便秘、恶心、嗜睡、头晕、出汗、头痛和性功能变化；剂量过高或与其他镇静物质合用时可抑制呼吸。',
    contraindications: '急性呼吸抑制、未评估的混合物质使用、严重肝病和 QT 高风险患者需专科管理。'
  },
  smokingCessation: {
    className: '烟草滥用治疗药物',
    indication: '用于烟草依赖的戒断和复吸预防，应与行为支持、动机干预和复诊结合。',
    action: '伐尼克兰部分激动/拮抗 α4β2 烟碱受体，安非他酮调节去甲肾上腺素/多巴胺，尼古丁替代降低戒断。',
    kinetics: '伐尼克兰和尼古丁替代的清除以肾功能和剂型为主；安非他酮经肝酶代谢。',
    interactions: '戒烟会逆转烟草诱导的 CYP1A2，氯氮平、奥氮平和茶碱浓度可能上升；合并安非他酮需评估癫痫风险。',
    sideEffects: '因药物而异，常见恶心、头痛、失眠和梦境生动；尼古丁替代还可能造成皮肤或口腔刺激、心悸，安非他酮可引起口干和焦虑。',
    contraindications: '妊娠、严重肾病、癫痫、躁狂或明显自伤风险需个体化评估；出现严重皮疹、胸痛或情绪骤变应就医。'
  }
};

const profileMeta = {
  ssri: { section: '抗抑郁药物', order: 10 },
  ndri: { section: '抗抑郁药物', order: 20 },
  snri: { section: '抗抑郁药物', order: 30 },
  sari: { section: '抗抑郁药物', order: 40 },
  vilazodone: { section: '抗抑郁药物', order: 50 },
  vortioxetine: { section: '抗抑郁药物', order: 60 },
  nassa: { section: '抗抑郁药物', order: 70 },
  tca: { section: '抗抑郁药物', order: 80 },
  rima: { section: '抗抑郁药物', order: 90 },
  maoi: { section: '抗抑郁药物', order: 100 },
  maob: { section: '抗抑郁药物', order: 110 },
  sga: { section: '抗精神病药物', order: 120 },
  tga: { section: '抗精神病药物', order: 130 },
  fga: { section: '抗精神病药物', order: 140 },
  benzodiazepine: { section: '抗焦虑药物', order: 150 },
  anxiolytic: { section: '抗焦虑药物', order: 160 },
  gabapentinoid: { section: '抗焦虑药物', order: 170 },
  hypnotic: { section: '催眠 / 镇静药物', order: 180 },
  antihistamine: { section: '催眠 / 镇静药物', order: 190 },
  barbiturate: { section: '催眠 / 镇静药物', order: 200 },
  zdrug: { section: '催眠 / 镇静药物', order: 210 },
  melatonin: { section: '催眠 / 镇静药物', order: 220 },
  lithium: { section: '情感稳定剂', order: 230 },
  mood: { section: '情感稳定剂', order: 240 },
  antiepileptic: { section: '情感稳定剂', order: 250 },
  stimulant: { section: 'ADHD 药物', order: 260 },
  atomoxetine: { section: 'ADHD 药物', order: 270 },
  alpha2: { section: 'ADHD 药物', order: 280 },
  dopaminergic: { section: 'ADHD 药物', order: 290 },
  cholinesterase: { section: '痴呆治疗药物', order: 300 },
  memantine: { section: '痴呆治疗药物', order: 310 },
  substance: { section: '物质滥用的治疗', order: 320 },
  disulfiram: { section: '物质滥用的治疗', order: 330 },
  opioidMaintenance: { section: '物质滥用的治疗', order: 340 },
  smokingCessation: { section: '物质滥用的治疗', order: 350 }
};

const categoryLabels = {
  ssri: 'SSRI',
  ndri: 'NDRI',
  snri: 'SNRI',
  sari: 'SARI',
  serotonergic: '5-HT 调节剂',
  vilazodone: '维拉佐酮类',
  vortioxetine: '沃替西汀类',
  nassa: 'NaSSA',
  tca: '非选择性环类',
  rima: 'RIMA',
  maoi: 'MAOI',
  maob: 'MAO-B',
  sga: 'SGA',
  tga: 'TGA',
  fga: 'FGA',
  benzodiazepine: '苯二氮䓬类',
  anxiolytic: '非苯二氮䓬类抗焦虑药',
  gabapentinoid: 'GABA 类似物',
  hypnotic: '催眠 / 镇静药物',
  antihistamine: '抗组胺药物',
  barbiturate: '巴比妥类药物',
  zdrug: '非苯二氮䓬类催眠药',
  melatonin: '褪黑素激动剂',
  lithium: '锂盐',
  mood: '其他情感稳定剂',
  antiepileptic: '抗癫痫药物',
  stimulant: '精神兴奋剂',
  atomoxetine: '托莫西汀类',
  alpha2: 'α2 激动剂',
  dopaminergic: '多巴胺类药物',
  cholinesterase: '胆碱酯酶抑制剂',
  memantine: '美金刚类',
  substance: '物质使用障碍治疗药物',
  disulfiram: '乙醇滥用治疗药物',
  opioidMaintenance: '阿片类维持 / 戒断治疗',
  smokingCessation: '烟草滥用治疗药物'
};

function drug(id, name, aliases, profile, extra = {}) {
  const meta = profileMeta[profile] || { section: '待补充分类', order: 999 };
  return {
    id,
    name,
    aliases,
    ...profiles[profile],
    sideEffects: drugSideEffectsById[id] || drugSideEffectsByProfile[profile] || '待补充',
    section: meta.section,
    categoryLabel: categoryLabels[profile] || profiles[profile]?.className || '待补充分类',
    classOrder: meta.order,
    source,
    updated: '2026-07-29',
    ...extra
  };
}

export const handbookDrugs = [
  drug('citalopram', '西酞普兰', 'Citalopram · 喜普妙', 'ssri', {
    kinetics: '经肝脏 CYP2C19、CYP3A4 代谢为去甲基西酞普兰再经由 CYP2D6 转化为去二甲基西酞普兰，CYP2C19 分为强弱代谢型， 强代谢型纯合子的酶活性女性高于男性，弱代谢型表型出现率中国人远高于白种人，具体为14.3%和3%-5%，当CYP2C19等位基因为突变型纯合子时更容易产生副作用，半衰期约 30-35 小时，弱代谢型会延长至 95 小时；老年、肝损害或 CYP2C19 抑制时暴露增加，吸烟和肾功能受损对于药物代谢几乎无影响，在治疗中女性的血药浓度显著高于男性。',
    contraindications: '请勿在没有医生指导下撤药，可能诱发副作用里的不适症状；避免从事危险性工作，禁止过量服用',
    sideEffects: `• 中枢神经系统：头痛（必要时考虑对乙酰氨基酚）；兴奋，激动焦虑等（必要时考虑劳拉西泮）；失眠或嗜睡（若嗜睡或者冷漠考虑金刚烷胺或其他精神活性物质）；轻躁狂（必要时考虑情感稳定剂）；极少数认知受损（多奈哌齐有效缓解）；运动障碍（多发于老人）；感觉异常（服用维生素B6缓解）
    • 心血管：QT周期相关，剂量依赖性 QT 间期延长是重要警示；先天性长 QT、心动过缓、低钾低镁或合并延长 QT 药物时需避免或严密监测；极少数心动过速，心悸；头晕
    • 血液系统：血小板减少，出血倾向，服用非甾体类抗炎药物（如布洛芬，双氯芬酸），阿司匹林或其他抗凝药物时需谨慎
    • 内分泌/代谢：低钠血症；女性泌乳素升高
    • 消化系统：恶心，呕吐（考虑随饭一起服用或考虑酸奶，赛庚啶 2mg，生姜）；少数腹泻；厌食或体重减轻（多见于超重或碳水爱好者）
    • 泌尿生殖系统：性欲下降，性功能障碍（必要时减量）；勃起障碍（考虑西地那非或者金刚烷胺）；性快感缺失或者延迟高潮（考虑金刚烷胺，赛庚啶）
    • 过敏：及其罕见，主要为皮疹
    • 其他：脱发，鼻炎，夜尿，骨质疏松（多见于女性，老人）`,
  }),
  drug('escitalopram', '艾司西酞普兰', 'Escitalopram · 来士普', 'ssri', {
    action: '为西酞普兰的活性异构体，选择性抑制 5-HT 再摄取，通常用于抑郁和多种焦虑障碍。',
    kinetics: '主要经 CYP2C19、CYP2D6 和 CYP3A4 代谢，半衰期约 27 至 32 小时；肝功能不全时需降低剂量。',
    contraindications: '关注 QT 间期、低钠血症、出血、躁狂转换和撤药反应；与 MAOI 或其他 5-HT 能药物合用属高风险。'
  }),
  drug('fluoxetine', '氟西汀', 'Fluoxetine · 百忧解', 'ssri', {
    action: '选择性抑制 5-HT 再摄取，兼有轻度去甲肾上腺素和多巴胺再摄取影响；常用于抑郁、强迫、惊恐和进食障碍。',
    kinetics: '氟西汀及活性代谢物去甲氟西汀半衰期长，分别约 70 小时和 330 小时；主要经肝脏代谢，停药后的相互作用窗口较长。',
    interactions: '强 CYP2D6 抑制作用可影响多种药物；与 MAOI、含 5-HT 药物、曲马朵和部分抗凝药合用需特别谨慎。',
    contraindications: '双相障碍患者监测躁狂转换；治疗早期关注激越、自伤意念、低钠血症、出血和胃肠道不适，不应自行突然加减量。'
  }),
  drug('fluvoxamine', '氟伏沙明', 'Fluvoxamine · 兰释', 'ssri', {
    action: '选择性抑制 5-HT 再摄取，并具有较强的 CYP1A2、CYP2C19 抑制作用；在强迫症治疗中使用较多。',
    kinetics: '主要经肝脏代谢，半衰期相对较短；CYP1A2、CYP2C19 抑制使许多合并药物浓度升高。',
    interactions: '与茶碱、部分抗精神病药、苯二氮䓬类、华法林和其他 5-HT 能药物相互作用明显，需逐项核对。',
    contraindications: '合并多种药物、肝功能异常和高出血风险患者需谨慎；出现血清素综合征、严重皮疹或意识改变应急诊。'
  }),
  drug('paroxetine', '帕罗西汀', 'Paroxetine · 赛乐特', 'ssri', {
    action: '强效抑制 5-HT 再摄取，兼有一定抗胆碱和去甲肾上腺素作用；用于抑郁、焦虑、强迫和 PTSD 等情境。',
    kinetics: '主要经 CYP2D6 代谢并抑制该酶，半衰期约 21 小时；肝肾功能不全时需考虑降低剂量。',
    interactions: 'CYP2D6 相互作用较突出，可影响他莫昔芬、部分抗精神病药和三环类药物；与 NSAID、抗凝药合用增加出血风险。',
    contraindications: '撤药反应和性功能障碍相对常见，需逐步减量；孕期、老年低钠血症风险及躁狂病史需要专科评估。'
  }),
  drug('sertraline', '舍曲林', 'Sertraline · 左洛复', 'ssri', {
    action: '抑制 5-HT 再摄取，并有轻度多巴胺再摄取影响；常用于抑郁、强迫、惊恐、社交焦虑和 PTSD。',
    kinetics: '主要经肝脏代谢，蛋白结合率高；进食可增加峰浓度，肝功能异常时暴露增加，肾功能影响相对有限。',
    interactions: '与 MAOI、亚甲蓝、曲马朵、止吐药和抗凝/抗血小板药物合用需评估血清素综合征与出血风险。',
    contraindications: '常见恶心、腹泻、震颤和性功能变化；治疗早期、双相病史及老年患者需监测激越、躁狂和低钠血症。'
  }),
  drug('bupropion', '安非他酮', 'Bupropion · 韦伯特林', 'ndri', {
    action: '抑制去甲肾上腺素和多巴胺再摄取，常用于抑郁、季节性情绪失调和戒烟辅助，性功能影响通常较少。',
    kinetics: '经 CYP2B6 代谢为活性代谢物；常释、缓释和控释剂型的给药间隔不同，不能随意掰碎或合并剂量。',
    interactions: '抑制 CYP2D6，可能提高部分抗抑郁药、抗精神病药和β受体阻滞剂浓度；与降低癫痫阈值药物合用需谨慎。',
    contraindications: '癫痫、厌食/贪食症、突然停酒或镇静药物戒断者通常禁用或慎用；出现癫痫、明显失眠或躁狂应就医。'
  }),
  drug('venlafaxine', '文拉法辛', 'Venlafaxine · 怡诺思', 'snri', {
    action: '低剂量以 5-HT 再摄取抑制为主，较高剂量时去甲肾上腺素作用更明显；用于抑郁和多种焦虑障碍。',
    kinetics: '经 CYP2D6 转化为活性代谢物去甲文拉法辛，原药半衰期约 3 至 7 小时，代谢物约 9 至 14 小时。',
    interactions: '剂量相关血压升高和撤药反应需关注；与 MAOI、曲马朵、其他 5-HT 能药和抗凝药合用风险增加。',
    contraindications: '血压控制不稳、双相躁狂史、癫痫和高自杀风险患者需专科监测；停药必须逐步进行。'
  }),
  drug('desvenlafaxine', '去甲文拉法辛', 'Desvenlafaxine · Pristiq', 'snri', {
    action: '文拉法辛的主要活性代谢物，直接增强 5-HT 和去甲肾上腺素信号，CYP2D6 依赖较少。',
    kinetics: '主要经葡萄糖醛酸化并由肾脏排泄，半衰期约 11 小时；肾功能不全时需限制最大剂量或延长间隔。',
    interactions: '与 MAOI、其他 5-HT 能药和抗凝/抗血小板药合用需谨慎；肾功能变化会影响血药浓度。',
    contraindications: '关注血压、心率、低钠血症、躁狂和撤药反应；终末期肾病患者需遵循当地说明书限制。'
  }),
  drug('duloxetine', '度洛西汀', 'Duloxetine · 欣百达', 'snri', {
    action: '对 5-HT 和去甲肾上腺素再摄取抑制作用相对均衡，用于抑郁、焦虑及糖尿病性神经痛等疼痛情境。',
    kinetics: '经 CYP1A2 和 CYP2D6 代谢，也是 CYP2D6 抑制剂；肝损伤时半衰期和暴露显著增加。',
    interactions: '吸烟可降低暴露；与 CYP1A2 抑制剂、其他 5-HT 能药、抗凝药和影响肝脏的药物合用需评估。',
    contraindications: '严重肝病、慢性肝损伤、乙醇滥用或严重肾功能不全者通常避免使用；恶心、血压升高和肝酶异常需监测。'
  }),
  drug('trazodone', '曲唑酮', 'Trazodone · Desyrel', 'sari', {
    action: '兼有 5-HT2 拮抗、弱再摄取抑制和组胺/肾上腺素受体作用；抑郁伴失眠时常被关注。',
    kinetics: '经 CYP3A4 代谢，食物会改变峰浓度；半衰期短于其活性代谢物，剂型影响给药频率。',
    interactions: '与 CYP3A4 抑制剂、酒精、镇静药、降压药和其他 5-HT 能药物合用可能增加嗜睡、低血压或血清素综合征。',
    contraindications: '需警惕体位性低血压、跌倒、心律问题和阴茎异常勃起；出现持续勃起、晕厥或意识改变应急诊。'
  }),
  drug('mirtazapine', '米氮平', 'Mirtazapine · 瑞美隆', 'nassa', {
    action: '阻断 α2 自身受体和异受体以增强 5-HT/去甲肾上腺素传递，阻断 H1 受体使镇静和食欲增加较突出。',
    kinetics: '经 CYP1A2、CYP2D6、CYP3A4 代谢；吸烟可显著降低浓度，肝肾功能下降时清除减慢。',
    interactions: '与文拉法辛等 5-HT 能药合用有血清素综合征病例；与酒精、苯二氮䓬类和阿片类合用增加中枢抑制。',
    contraindications: '关注嗜睡、体重增加、血脂变化和粒细胞减少；出现发热、咽痛、明显肝损伤或躁狂应及时就医。'
  }),
  drug('amitriptyline', '阿米替林', 'Amitriptyline · Elavil', 'tca', {
    action: '抑制 5-HT 与去甲肾上腺素再摄取，并具有明显抗胆碱、抗组胺和α1 阻断作用；也用于部分慢性疼痛。',
    kinetics: '经 CYP2D6、CYP2C19 代谢，个体差异较大；药物和活性代谢物可蓄积，老年人更敏感。',
    interactions: '与 MAOI、抗心律失常药、抗胆碱药、中枢抑制剂和延长 QT 药物合用可增加严重风险。',
    contraindications: '心脏传导异常、闭角型青光眼、尿潴留和高自杀风险者需严格评估；过量可致昏迷、癫痫和致命心律失常。'
  }),
  drug('clomipramine', '氯米帕明', 'Clomipramine · Anafranil', 'tca', {
    indication: '以强迫症治疗证据较充分，也可用于抑郁和部分焦虑相关情境。',
    action: '较强抑制 5-HT 再摄取，同时具有三环类药物的抗胆碱、抗组胺和心血管效应。',
    kinetics: '经 CYP2D6 等途径代谢，活性代谢物半衰期较长；剂量增加需缓慢并关注血药浓度。',
    contraindications: '癫痫、心律失常、青光眼、尿潴留和高自杀风险需专科评估；与 MAOI 或强 5-HT 能药合用风险高。'
  }),
  drug('moclobemide', '吗氯贝胺', 'Moclobemide · Aurorix', 'rima', {
    action: '可逆性抑制 MAO-A，增强 5-HT、去甲肾上腺素和多巴胺传递，作用消退较快。',
    kinetics: '经肝脏代谢，抑制作用在停药后相对较快逆转；肝功能异常时需降低剂量并监测。',
    interactions: '虽饮食限制相对少于不可逆 MAOI，但与 5-HT 能药、哌替啶、曲马朵、拟交感药和亚甲蓝仍需避免或间隔。',
    contraindications: '治疗转换必须保留洗脱期；出现高血压、发热、震颤、肌强直或意识改变需按血清素综合征急症处理。'
  }),
  drug('aripiprazole', '阿立哌唑', 'Aripiprazole · Abilify', 'tga', {
    action: '多巴胺 D2/D3 和 5-HT1A 部分激动、5-HT2A 拮抗，常用于精神分裂症、双相躁狂及抑郁增效。',
    kinetics: '经 CYP2D6 和 CYP3A4 代谢，半衰期长；强抑制剂或诱导剂联用需调整剂量。',
    interactions: '氟西汀、帕罗西汀等 CYP2D6 抑制剂可提高阿立哌唑暴露；与酒精或其他中枢药合用需观察镇静和冲动。',
    contraindications: '静坐不能、激越、失眠、冲动控制障碍和体位性低血压需监测；老年痴呆相关精神病患者有死亡风险警示。'
  }),
  drug('olanzapine', '奥氮平', 'Olanzapine · 再普乐', 'sga', {
    action: '拮抗多巴胺和 5-HT2A 等多种受体，改善精神病性症状和躁狂；镇静、食欲与代谢影响较明显。',
    kinetics: '主要经 CYP1A2 和葡萄糖醛酸化代谢；吸烟可降低浓度，肝功能、年龄和合并药物影响镇静程度。',
    interactions: '氟伏沙明可显著提高浓度，吸烟可降低浓度；与酒精、劳拉西泮肌注制剂或其他镇静药合用增加呼吸/循环风险。',
    contraindications: '重点监测体重、血糖、血脂、血压、嗜睡和体位性低血压；长期治疗需定期代谢随访，不应自行停药。'
  }),
  drug('quetiapine', '喹硫平', 'Quetiapine · 思瑞康', 'sga', {
    action: '拮抗 5-HT2A 和 D2 受体，并有 H1、α1 阻断作用；用于精神分裂症、双相障碍和部分抑郁增效方案。',
    kinetics: '经 CYP3A4 代谢，速释与缓释制剂暴露不同；强 CYP3A4 抑制剂会显著增加浓度。',
    interactions: '与 CYP3A4 抑制剂、酒精、中枢抑制剂和延长 QT 药物合用需谨慎；吸烟影响相对较小。',
    contraindications: '嗜睡、体位性低血压、体重增加、血糖血脂异常和白内障风险需监测；老年痴呆相关精神病患者有死亡风险警示。'
  }),
  drug('risperidone', '利培酮', 'Risperidone · 维思通', 'sga', {
    action: '拮抗 D2 与 5-HT2A 受体，改善阳性症状、躁狂和部分行为问题；对泌乳素影响相对明显。',
    kinetics: '经 CYP2D6 转化为活性代谢物帕利哌酮；长效针剂释放时间较长，给药与随访需专业管理。',
    interactions: 'CYP2D6 抑制剂可改变原药与代谢物比例；与降压药、镇静药和其他延长 QT 药合用需观察。',
    contraindications: '监测泌乳素、体重、血糖、运动症状和体位性低血压；出现高热肌强直、吞咽困难或异常运动应急诊。'
  }),
  drug('clozapine', '氯氮平', 'Clozapine · Clozaril', 'sga', {
    action: '多受体拮抗作用，适用于治疗抵抗性精神分裂症并可能降低自杀风险，但需要严格安全监测。',
    kinetics: '主要经 CYP1A2、CYP3A4 和 CYP2D6 代谢；吸烟、感染、氟伏沙明和突然戒烟可显著改变浓度。',
    interactions: '与骨髓抑制药、降低癫痫阈值药物、中枢抑制剂和影响 CYP1A2 的因素合用需专科管理。',
    contraindications: '必须监测中性粒细胞；还需警惕心肌炎、癫痫、便秘性肠梗阻、流涎、代谢异常和严重感染。'
  }),
  drug('lurasidone', '鲁拉西酮', 'Lurasidone · Latuda', 'sga', {
    indication: '用于精神分裂症和双相抑郁等，具体适应证随地区和制剂不同。',
    action: '主要拮抗 D2、5-HT2A 和 5-HT7，并对 5-HT1A 有部分激动作用；相对少见明显代谢负担但静坐不能仍需关注。',
    kinetics: '主要经 CYP3A4 代谢，需随含一定热量的食物服用；强 CYP3A4 抑制剂或诱导剂禁忌或需调整。',
    contraindications: '监测静坐不能、嗜睡、恶心、体位性低血压和运动症状；不能与强 CYP3A4 诱导/抑制药随意合用。'
  }),
  drug('paliperidone', '帕利哌酮', 'Paliperidone · 芮达 / 善思达', 'sga', {
    action: '利培酮的主要活性代谢物，拮抗 D2 和 5-HT2A 受体，可用口服或长效针剂维持治疗。',
    kinetics: '以肾脏排泄为主，肾功能对暴露影响明显；长效棕榈酸帕利哌酮的给药间隔和负荷方案必须遵医嘱。',
    interactions: '与其他延长 QT、升高泌乳素或中枢抑制药合用需评估；肾功能变化时需要调整剂量。',
    contraindications: '监测泌乳素、体重、血糖、运动症状、心律和注射部位反应；严重肾功能不全者需专科评估。'
  }),
  drug('lithium', '锂盐', 'Lithium carbonate · 碳酸锂', 'lithium', {
    action: '通过多条细胞内信号通路稳定情绪，常用于双相躁狂、维持治疗和部分抑郁增效；治疗窗较窄。',
    kinetics: '不经肝脏代谢，主要由肾脏排泄；脱水、发热、腹泻、低盐饮食和肾功能变化会迅速改变浓度。',
    interactions: 'NSAID、ACEI/ARB、噻嗪类利尿剂可升高锂浓度；钠摄入增加可能降低浓度，减少则可能升高。',
    contraindications: '必须监测血药浓度、肾功能、甲状腺、血钙和体重；粗大震颤、共济失调、持续呕吐、意识改变可能提示中毒，应急诊。'
  }),
  drug('valproate', '丙戊酸 / 丙戊酸钠', 'Valproate · Valproic acid', 'antiepileptic', {
    action: '通过多种机制增强 GABA 并调节离子通道，常用于双相躁狂、维持治疗和癫痫；对双相抑郁的作用需个体化。',
    kinetics: '肝脏代谢且蛋白结合率高，血药浓度受剂型、肝功能和合并药物影响；可穿过胎盘。',
    interactions: '与拉莫三嗪合用会提高拉莫三嗪暴露和严重皮疹风险；与其他肝酶抑制/诱导药和抗凝药联用需监测。',
    contraindications: '肝病、胰腺炎、血小板减少、妊娠或备孕者需严格专科评估；出现腹痛、黄疸、异常出血或意识改变应就医。'
  }),
  drug('carbamazepine', '卡马西平', 'Carbamazepine · 得理多', 'antiepileptic', {
    action: '调节电压门控钠通道，具有抗惊厥和心境稳定作用，常用于双相躁狂或特定神经痛。',
    kinetics: '经 CYP3A4 代谢并强烈诱导多种肝酶，具有自身诱导；血药浓度与剂量在开始数周会变化。',
    interactions: '可降低多种药物浓度，包括口服避孕药、抗精神病药和部分抗抑郁药；与葡萄柚、CYP3A4 抑制剂合用需谨慎。',
    contraindications: 'HLA-B*1502 携带者发生严重皮肤反应风险更高；需监测血常规、肝功能、低钠血症和皮疹，出现发热/皮疹应停下自行就医。'
  }),
  drug('lamotrigine', '拉莫三嗪', 'Lamotrigine · 利必通', 'antiepileptic', {
    action: '调节电压门控钠通道并减少谷氨酸释放，对双相障碍抑郁和维持治疗更有价值，对急性躁狂作用有限。',
    kinetics: '主要经葡萄糖醛酸化清除；丙戊酸会显著延长半衰期并提高暴露，口服避孕药可能降低浓度。',
    interactions: '与丙戊酸合用必须显著放慢滴定；与影响葡萄糖醛酸化的药物、激素制剂联用需核对说明书。',
    contraindications: '必须缓慢加量，出现皮疹、发热、黏膜损伤或面部水肿需立即就医，以排除 Stevens-Johnson 综合征。'
  }),
  drug('buspirone', '丁螺环酮', 'Buspirone · BuSpar', 'anxiolytic', {
    indication: '用于广泛性焦虑障碍，通常需要连续数周才能判断疗效，不用于立即终止急性惊恐。',
    action: '主要为 5-HT1A 部分激动剂，抗焦虑作用不依赖明显镇静或肌肉松弛。',
    kinetics: '首过代谢明显，主要经 CYP3A4 代谢；葡萄柚和强 CYP3A4 抑制剂会增加浓度。',
    contraindications: '与 MAOI 不应合用；肝肾功能异常、妊娠和合并多种中枢药物时需专科评估。'
  }),
  drug('lorazepam', '劳拉西泮', 'Lorazepam · Ativan', 'benzodiazepine', {
    action: '增强 GABA-A 抑制，抗焦虑、镇静、抗惊厥作用较明确，常用于短期急性焦虑或戒断相关症状。',
    kinetics: '主要经葡萄糖醛酸化代谢，受 CYP 影响相对少；老年和呼吸功能不全患者仍可能出现明显蓄积。',
    interactions: '与阿片类、酒精和其他镇静药合用可导致呼吸抑制；肌注奥氮平与肠外劳拉西泮同时使用存在额外风险。',
    contraindications: '长期使用需评估耐受、依赖和认知影响；不能突然停药，出现过度嗜睡、呼吸变慢或意识改变需急诊。'
  }),
  drug('clonazepam', '氯硝西泮', 'Clonazepam · Klonopin', 'benzodiazepine', {
    indication: '短期用于惊恐障碍、严重焦虑或特定癫痫发作，长期方案需定期复评。',
    action: '增强 GABA-A 受体作用，抗焦虑、镇静和抗惊厥效应持续时间较长。',
    kinetics: '肝脏代谢，半衰期较长，老年或肝功能异常时镇静可能持续更久。',
    contraindications: '与阿片、酒精合用有呼吸抑制风险；睡眠呼吸暂停、重症肌无力和物质使用风险患者需谨慎，停药需逐步减量。'
  }),
  drug('methylphenidate', '哌甲酯', 'Methylphenidate · 利他林', 'stimulant', {
    action: '阻断多巴胺和去甲肾上腺素转运体，改善 ADHD 注意、冲动和活动水平；不同制剂持续时间差异明显。',
    kinetics: '经 CES1 代谢，速释和缓释制剂的峰浓度不同；食物和制剂不能随意替换。',
    interactions: '与 MAOI 禁止合用；与降压药、抗精神病药、兴奋剂和含咖啡因物质合用需监测心率、血压与激越。',
    contraindications: '需评估心血管病史、抽动、躁狂、精神病性症状和物质使用风险；出现胸痛、晕厥或明显精神症状应立即就医。'
  }),
  drug('atomoxetine', '托莫西汀', 'Atomoxetine · Strattera', 'atomoxetine', {
    kinetics: '主要由 CYP2D6 代谢，慢代谢者或合用 CYP2D6 抑制剂时暴露显著升高；肝损伤时需调整。',
    contraindications: '监测血压、心率、肝损伤和自伤意念；不与 MAOI 合用，出现黄疸、深色尿、胸痛或晕厥需及时就医。'
  }),
  drug('guanfacine', '胍法辛', 'Guanfacine · Intuniv', 'alpha2', {
    action: '选择性激动 α2A 受体，改善 ADHD 的冲动、多动和睡眠问题，镇静和低血压较常见。',
    kinetics: '主要经 CYP3A4 代谢，缓释制剂需完整吞服；强 CYP3A4 抑制剂或诱导剂会改变暴露。',
    contraindications: '心动过缓、低血压和肝肾功能异常者需监测；停药必须逐步减量以避免反跳性高血压。'
  }),
  drug('donepezil', '多奈哌齐', 'Donepezil · 安理申', 'cholinesterase', {
    action: '可逆性抑制乙酰胆碱酯酶，主要用于轻中重度阿尔茨海默病的认知和功能症状治疗。',
    kinetics: '半衰期较长，主要经 CYP2D6、CYP3A4 代谢；剂量通常逐步增加以改善胃肠道耐受。',
    interactions: '与抗胆碱能药物作用相反；与减慢心率、增加胃酸或影响 CYP2D6/3A4 的药物联用需监测。',
    contraindications: '心动过缓、传导异常、消化性溃疡、哮喘和癫痫患者需谨慎；晕厥、黑便或持续呕吐应就医。'
  }),
  drug('rivastigmine', '利凡斯的明', 'Rivastigmine · 艾司能', 'cholinesterase', {
    indication: '用于阿尔茨海默病和帕金森病痴呆的轻中度症状，口服与贴剂需按说明书转换。',
    action: '抑制乙酰胆碱酯酶和丁酰胆碱酯酶，增强中枢胆碱能传递。',
    kinetics: '主要经酯酶水解，CYP 相互作用相对少；贴剂可降低峰浓度和胃肠道波动，但仍需监测体重。',
    contraindications: '体重下降、心动过缓、消化性溃疡、哮喘和贴剂皮肤反应需关注；贴剂不能重复使用或同时叠加。'
  }),
  drug('galantamine', '加兰他敏', 'Galantamine · Razadyne', 'cholinesterase', {
    action: '抑制乙酰胆碱酯酶并调节烟碱型受体，改善部分阿尔茨海默病患者的认知和功能。',
    kinetics: '经 CYP2D6 和 CYP3A4 代谢，肝肾功能下降或抑制剂合用会提高暴露。',
    interactions: '与抗胆碱能、减慢心率或影响 CYP2D6/3A4 的药物合用需谨慎；NSAID 可能增加胃肠道风险。',
    contraindications: '恶心、呕吐、体重下降、心动过缓、晕厥和癫痫需监测；出现黑便、脱水或持续心动过缓应就医。'
  }),
  drug('memantine', '美金刚', 'Memantine · Namenda', 'memantine', {
    action: '低亲和力、非竞争性拮抗 NMDA 受体，减少谷氨酸过度兴奋，用于中重度阿尔茨海默病。',
    kinetics: '主要经肾脏排泄；肾功能不全和尿液碱化会延长半衰期，需要调整剂量或间隔。',
    interactions: '与金刚烷胺、氯胺酮等 NMDA 拮抗剂或尿液碱化剂合用需谨慎。',
    contraindications: '需关注眩晕、步态不稳、意识变化和血压；严重肾功能不全者应按当地说明书调整。'
  }),
  drug('acamprosate', '阿坎酸', 'Acamprosate · Campral', 'substance', {
    indication: '用于已经停止饮酒并希望维持戒酒的乙醇使用障碍患者，必须与心理社会支持结合。',
    action: '调节谷氨酸和 GABA 平衡，帮助降低持续饮酒后的渴求和复饮风险。',
    kinetics: '几乎不经肝脏代谢，主要由肾脏排泄；肾功能决定是否减量或禁用。',
    contraindications: '严重肾功能不全通常禁用，妊娠和抑郁/自伤风险需专科评估；腹泻是常见不良反应。'
  }),
  drug('naltrexone', '纳曲酮', 'Naltrexone · ReVia / Vivitrol', 'substance', {
    indication: '用于乙醇依赖维持治疗和阿片使用障碍脱毒后的复发预防，需确认患者不在阿片作用或戒断期。',
    action: '拮抗 μ 阿片受体，降低阿片和乙醇相关的奖赏与渴求。',
    kinetics: '经肝脏代谢为活性代谢物，口服与长效注射制剂暴露不同；肝功能会影响安全性。',
    interactions: '使用阿片镇痛药前必须告知医生；与其他肝毒性药物合用需监测肝功能，不能用来处理急性阿片戒断。',
    contraindications: '急性肝炎、肝衰竭、正在使用阿片或未完成脱毒者禁用或慎用；开始前需核对阿片阴性和肝功能。'
  }),
  drug('buprenorphine', '丁丙诺啡', 'Buprenorphine · Subutex / Suboxone', 'substance', {
    indication: '用于阿片使用障碍的维持治疗，常与纳洛酮合用以降低注射滥用风险。',
    action: '对 μ 阿片受体部分激动，对 κ 受体拮抗，降低戒断和渴求，同时有一定呼吸抑制风险。',
    kinetics: '经 CYP3A4 代谢，舌下、透皮和注射制剂的暴露不同；长效制剂需按专业方案给药。',
    interactions: '与酒精、苯二氮䓬类和其他中枢抑制剂合用可导致呼吸抑制；CYP3A4 抑制剂会提高浓度。',
    contraindications: '急性呼吸抑制、严重肝病和未评估的混合物质使用需专科管理；出现嗜睡、呼吸变慢或意识改变需急诊。'
  }),
  drug('methadone', '美沙酮', 'Methadone · Dolophine', 'opioidMaintenance', {
    indication: '用于阿片使用障碍替代治疗或特定疼痛管理，需由有资质的专业服务提供。',
    action: '长效 μ 阿片受体激动剂并具有 NMDA/单胺作用，抑制戒断但存在剂量累积和呼吸抑制风险。',
    kinetics: '半衰期个体差异大，经 CYP 多途径代谢；达到稳态和剂量调整需要缓慢进行。',
    interactions: '与酒精、苯二氮䓬类、其他阿片和延长 QT 药物合用风险高；CYP3A4/2B6 诱导或抑制会改变浓度。',
    contraindications: '呼吸抑制、QT 延长、严重肝病和混合物质使用需严密监测；不能自行加量或突然停药。'
  }),

  drug('levomilnacipran', '左旋米那普仑', 'Levomilnacipran · Fetzima', 'snri', {
    indication: '用于重度抑郁障碍；手册指出其去甲肾上腺素作用相对更突出。',
    action: '抑制 5-HT 与去甲肾上腺素再摄取，对去甲肾上腺素转运体的选择性更高。',
    kinetics: '主要经 CYP3A4 代谢并由肾脏清除，肾功能不全时需调整剂量。',
    interactions: '与 MAOI、其他 5-HT 能药、降压药和影响 CYP3A4 的药物合用需监测血压与血清素综合征。',
    contraindications: '高血压、心率增快、尿潴留、躁狂和严重肾病患者需专科评估。'
  }),
  drug('nefazodone', '奈法唑酮', 'Nefazodone · Serzone', 'sari', {
    indication: '用于抑郁障碍；手册特别提示其肝毒性限制。',
    action: '拮抗 5-HT2A/2C 与 α1 受体，并抑制 5-HT、去甲肾上腺素再摄取。',
    kinetics: '经 CYP3A4 广泛代谢，活性代谢物和葡萄柚汁会改变暴露。',
    interactions: '强 CYP3A4 抑制剂、酒精、镇静药和其他 5-HT 能药会增加风险。',
    contraindications: '既往肝损伤或活动性肝病通常禁用；出现黄疸、深色尿、持续恶心或异常乏力应急诊评估。'
  }),
  drug('vilazodone', '维拉佐酮', 'Vilazodone · Viibryd', 'vilazodone'),
  drug('vortioxetine', '沃替西汀', 'Vortioxetine · Trintellix', 'vortioxetine'),
  drug('desipramine', '地昔帕明', 'Desipramine · Norpramin', 'tca', {
    indication: '用于抑郁障碍；也可在专科方案中用于神经病理性疼痛或增效。',
    action: '三环类中去甲肾上腺素再摄取抑制较突出，抗胆碱和镇静作用相对较少。',
    kinetics: '主要经 CYP2D6 代谢，血药浓度受遗传代谢型和合并药物影响。',
    interactions: '与 CYP2D6 抑制剂、MAOI、延长 QT 药和中枢抑制剂合用需严密监测。',
    contraindications: '心律失常、青光眼、尿潴留和高自杀风险者需专科评估；过量可致致命心律失常。'
  }),
  drug('doxepin', '多塞平', 'Doxepin · Sinequan / Silenor', 'tca', {
    indication: '用于抑郁障碍和焦虑；低剂量制剂也用于睡眠维持困难。',
    action: '抑制 5-HT/去甲肾上腺素再摄取，并强力阻断 H1 受体，低剂量时以催眠为主。',
    kinetics: '经 CYP2D6、CYP2C19 等途径代谢，老年患者半衰期延长。',
    interactions: '与酒精、抗胆碱能药、MAOI 和延长 QT 药物合用增加镇静与心律风险。',
    contraindications: '青光眼、尿潴留、严重心脏病和高自杀风险者需谨慎；过量可能危及生命。'
  }),
  drug('imipramine', '丙米嗪', 'Imipramine · Tofranil', 'tca', {
    indication: '用于抑郁障碍；手册也收录其在儿童遗尿等非抑郁适应证的历史使用。',
    action: '抑制 5-HT 和去甲肾上腺素再摄取，并阻断 M1、H1 和 α1 受体。',
    kinetics: '经 CYP2D6、CYP2C19 代谢为活性代谢物，药物相互作用明显。',
    interactions: '与 MAOI、抗胆碱药、抗心律失常药和中枢抑制剂合用需避免或监测。',
    contraindications: '心脏传导异常、闭角型青光眼、尿潴留、癫痫和高自杀风险需评估。'
  }),
  drug('nortriptyline', '去甲替林', 'Nortriptyline · Pamelor', 'tca', {
    indication: '用于抑郁障碍、神经病理性疼痛；手册将其列为烟草依赖二线治疗选项。',
    action: '以去甲肾上腺素再摄取抑制为主，抗胆碱能和镇静作用低于部分三环药。',
    kinetics: '经 CYP2D6 代谢，血药浓度可用于评估疗效和毒性。',
    interactions: '与 CYP2D6 抑制剂、MAOI、心律药和延长 QT 药合用需谨慎。',
    contraindications: '心律失常、青光眼、尿潴留和躁狂史患者需专科管理；过量风险高。'
  }),
  drug('maprotiline', '马普替林', 'Maprotiline · Ludiomil', 'tca', {
    indication: '用于抑郁障碍，尤其是伴焦虑或激越的情境。',
    action: '四环结构但以去甲肾上腺素再摄取抑制为主，同时有 H1 阻断。',
    kinetics: '经肝脏代谢，半衰期较长；高龄和肝功能异常时更易蓄积。',
    interactions: '与降低癫痫阈值、MAOI、抗心律和中枢抑制药合用增加风险。',
    contraindications: '癫痫、心脏传导病、青光眼和尿潴留者通常避免使用；过量可能诱发癫痫和心律失常。'
  }),
  drug('protriptyline', '普罗替林', 'Protriptyline · Vivactil', 'tca', {
    indication: '用于抑郁障碍；镇静较少但激活作用较明显。',
    action: '偏向去甲肾上腺素再摄取抑制，抗胆碱和心血管作用仍需监测。',
    kinetics: '经肝脏 CYP 代谢，个体差异和药物相互作用较大。',
    interactions: '与 MAOI、兴奋剂、甲状腺激素和延长 QT 药物合用需评估。',
    contraindications: '心律失常、躁狂、癫痫、青光眼和高自杀风险者需专科评估。'
  }),
  drug('trimipramine', '曲米帕明', 'Trimipramine · Surmontil', 'tca', {
    indication: '用于抑郁障碍，伴失眠或焦虑时可能更突出镇静。',
    action: '三环类多受体阻断，H1、M1 和 α1 作用带来镇静、抗胆碱和低血压。',
    kinetics: '经肝脏代谢，老年和肝功能不全时清除减慢。',
    interactions: '与酒精、苯二氮䓬类、MAOI、抗胆碱药和延长 QT 药合用增加风险。',
    contraindications: '心律失常、青光眼、尿潴留和高自杀风险患者需谨慎；过量可致昏迷。'
  }),
  drug('isocarboxazid', '异卡波肼', 'Isocarboxazid · Marplan', 'maoi'),
  drug('phenelzine', '苯乙肼', 'Phenelzine · Nardil', 'maoi'),
  drug('tranylcypromine', '反苯环丙胺', 'Tranylcypromine · Parnate', 'maoi'),
  drug('selegiline', '司来吉兰', 'Selegiline · Eldepryl / EMSAM', 'maob'),

  drug('iloperidone', '伊潘立酮', 'Iloperidone · Fanapt', 'sga', {
    action: '拮抗 D2、5-HT2A 和 α1 受体，改善精神病性阳性症状。',
    kinetics: '经 CYP2D6、CYP3A4 代谢，需逐步滴定以减少体位性低血压。',
    interactions: 'CYP2D6/3A4 抑制剂和延长 QT 药会增加暴露与心律风险。',
    contraindications: '基线 QT 延长、心血管病、低钾低镁和体位性低血压患者需谨慎。'
  }),
  drug('ziprasidone', '齐拉西酮', 'Ziprasidone · Geodon', 'sga', {
    indication: '用于精神分裂症、双相躁狂/混合发作及急性激越的特定制剂方案。',
    action: '拮抗 D2、5-HT2A，兼有 5-HT1A 激动和 5-HT/去甲肾上腺素再摄取抑制。',
    kinetics: '需随餐服用以提高吸收，经 CYP3A4 和醛氧化酶代谢。',
    interactions: '与其他延长 QT 药、低钾低镁因素和中枢抑制剂合用风险增加。',
    contraindications: '先天性 QT 延长、近期心梗、失代偿心衰和明显心律失常者通常避免。'
  }),
  drug('asenapine', '阿塞那平', 'Asenapine · Saphris', 'sga', {
    indication: '用于精神分裂症和双相障碍躁狂/混合发作，舌下制剂起效较快。',
    action: '拮抗 D2、5-HT2A、5-HT2C、α2 和 H1 等受体。',
    kinetics: '舌下吸收可避免明显首过效应，主要经 CYP1A2、UGT 代谢。',
    interactions: '氟伏沙明等 CYP1A2 抑制剂、酒精和其他镇静药可增加暴露或嗜睡。',
    contraindications: '口腔感觉减退、嗜睡、体位性低血压和代谢异常需监测。'
  }),
  drug('haloperidol', '氟哌啶醇', 'Haloperidol · Haldol', 'fga'),
  drug('loxapine', '洛沙平', 'Loxapine · Loxitane', 'fga'),
  drug('pimozide', '匹莫齐特', 'Pimozide · Orap', 'fga', {
    contraindications: 'QT 延长和药物相互作用风险突出；需避免与延长 QT 或强 CYP3A4 抑制剂合用。'
  }),
  drug('chlorpromazine', '氯丙嗪', 'Chlorpromazine · Thorazine', 'fga'),
  drug('levomepromazine', '左美丙嗪', 'Levomepromazine · Methotrimeprazine', 'fga'),
  drug('fluphenazine', '氟奋乃静', 'Fluphenazine · Prolixin', 'fga'),
  drug('perphenazine', '奋乃静', 'Perphenazine · Trilafon', 'fga'),
  drug('promazine', '普拉嗪', 'Promazine', 'fga'),
  drug('trifluoperazine', '三氟拉嗪', 'Trifluoperazine · Stelazine', 'fga'),
  drug('pipotiazine', '哌泊噻嗪', 'Pipotiazine · Piportil', 'fga'),
  drug('thioridazine', '甲硫哒嗪', 'Thioridazine · Mellaril', 'fga', {
    contraindications: 'QT 延长和致命性心律失常风险高，手册提示仅限严格适应证和监测。'
  }),
  drug('flupentixol', '氟哌噻吨', 'Flupentixol · Fluanxol', 'fga'),
  drug('thiothixene', '替沃噻吨', 'Thiothixene · Navane', 'fga'),
  drug('zuclopenthixol', '珠氯噻吨', 'Zuclopenthixol · Clopixol', 'fga'),

  drug('alprazolam', '阿普唑仑', 'Alprazolam · Xanax', 'benzodiazepine'),
  drug('bromazepam', '溴西泮', 'Bromazepam', 'benzodiazepine'),
  drug('chlordiazepoxide', '氯氮䓬', 'Chlordiazepoxide · Librium', 'benzodiazepine'),
  drug('clorazepate', '氯拉䓬酸', 'Clorazepate · Tranxene', 'benzodiazepine'),
  drug('diazepam', '地西泮', 'Diazepam · Valium', 'benzodiazepine'),
  drug('estazolam', '艾司唑仑', 'Estazolam · ProSom', 'benzodiazepine'),
  drug('flurazepam', '氟西泮', 'Flurazepam · Dalmane', 'benzodiazepine'),
  drug('midazolam', '咪达唑仑', 'Midazolam · Versed', 'benzodiazepine'),
  drug('nitrazepam', '硝西泮', 'Nitrazepam · Mogadon', 'benzodiazepine'),
  drug('oxazepam', '奥沙西泮', 'Oxazepam · Serax', 'benzodiazepine'),
  drug('quazepam', '夸西泮', 'Quazepam · Doral', 'benzodiazepine'),
  drug('temazepam', '替马西泮', 'Temazepam · Restoril', 'benzodiazepine'),
  drug('triazolam', '三唑仑', 'Triazolam · Halcion', 'benzodiazepine'),
  drug('pregabalin', '普瑞巴林', 'Pregabalin · Lyrica', 'gabapentinoid'),

  drug('diphenhydramine', '苯海拉明', 'Diphenhydramine · Benadryl', 'antihistamine'),
  drug('doxylamine', '多西拉敏', 'Doxylamine · Unisom', 'antihistamine'),
  drug('hydroxyzine', '羟嗪', 'Hydroxyzine · Atarax / Vistaril', 'antihistamine'),
  drug('promethazine', '异丙嗪', 'Promethazine · Phenergan', 'antihistamine'),
  drug('phenobarbital', '苯巴比妥', 'Phenobarbital', 'barbiturate'),
  drug('secobarbital', '司可巴比妥', 'Secobarbital · Seconal', 'barbiturate'),
  drug('chloral-hydrate', '水合氯醛', 'Chloral hydrate', 'hypnotic'),
  drug('eszopiclone', '艾司佐匹克隆', 'Eszopiclone · Lunesta', 'zdrug'),
  drug('zopiclone', '佐匹克隆', 'Zopiclone · Imovane', 'zdrug'),
  drug('zolpidem', '唑吡坦', 'Zolpidem · Ambien', 'zdrug'),
  drug('zaleplon', '扎来普隆', 'Zaleplon · Sonata', 'zdrug'),
  drug('ramelteon', '雷美替胺', 'Ramelteon · Rozerem', 'melatonin'),
  drug('tasimelteon', '他司美琼', 'Tasimelteon · Hetlioz', 'melatonin'),

  drug('oxcarbazepine', '奥卡西平', 'Oxcarbazepine · Trileptal', 'antiepileptic'),
  drug('topiramate', '托吡酯', 'Topiramate · Topamax', 'antiepileptic'),
  drug('gabapentin', '加巴喷丁', 'Gabapentin · Neurontin', 'antiepileptic', {
    indication: '手册将其列入情感稳定剂抗癫痫药物，也列为社交焦虑和广泛性焦虑的二线 GABA 类似物。',
    action: '结合电压门控钙通道 α2δ 亚基，降低兴奋性递质释放。',
    kinetics: '几乎不经肝脏代谢，主要以原型经肾脏排泄；肾功能决定给药间隔。'
  }),
  drug('lithium-fluoxetine', '奥氮平 / 氟西汀合剂', 'Olanzapine / Fluoxetine · Symbyax', 'mood', {
    className: '抗精神病药物 / 抗抑郁药物组合',
    section: '情感稳定剂',
    classOrder: 260,
    indication: '用于双相Ⅰ型抑郁发作或难治性抑郁的特定组合方案，需专科评估。',
    action: '联合奥氮平的多受体拮抗与氟西汀的 5-HT 再摄取抑制，兼顾精神病性和情绪症状。',
    kinetics: '两种成分分别经 CYP1A2/2D6/3A4 等途径代谢，吸烟和合并用药会改变暴露。',
    interactions: '与 MAOI、其他 5-HT 能药、酒精、中枢抑制剂和代谢诱导/抑制剂合用需严格核对。',
    contraindications: '需同时监测代谢综合征、躁狂、自伤风险、QT 和肝功能；不能自行拆分或调整组合剂量。'
  }),

  drug('dextroamphetamine', '右苯丙胺', 'Dextroamphetamine · Dexedrine', 'stimulant'),
  drug('lisdexamfetamine', '二甲磺酸赖右苯丙胺', 'Lisdexamfetamine · Vyvanse', 'stimulant', {
    action: '为右苯丙胺前体药，释放去甲肾上腺素和多巴胺以改善 ADHD 注意和冲动。',
    kinetics: '经红细胞水解为右苯丙胺，作用持续时间通常长于速释安非他明。'
  }),
  drug('methamphetamine', '甲基苯丙胺', 'Methamphetamine · Desoxyn', 'stimulant'),
  drug('mixed-amphetamine-salts', '右旋苯异丙胺 / 苯丙胺盐', 'Mixed amphetamine salts · Adderall', 'stimulant'),
  drug('dexmethylphenidate', '右哌甲酯', 'Dexmethylphenidate · Focalin', 'stimulant'),
  drug('modafinil', '莫达非尼', 'Modafinil · Provigil', 'dopaminergic'),
  drug('clonidine', '可乐定', 'Clonidine · Catapres / Kapvay', 'alpha2', {
    indication: '手册将其列入 ADHD α2 激动剂，也列为阿片类和烟草戒断的辅助药物。',
    action: '激动中枢 α2 受体，降低去甲肾上腺素释放，改善过度唤醒、冲动和戒断自主神经症状。'
  }),

  drug('disulfiram', '戒酒硫', 'Disulfiram · Antabuse', 'disulfiram'),
  drug('buprenorphine-naloxone', '丁丙诺啡 / 纳洛酮', 'Buprenorphine / Naloxone · Suboxone', 'opioidMaintenance'),
  drug('varenicline', '酒石酸伐尼克兰', 'Varenicline · Chantix / Champix', 'smokingCessation'),
  drug('nicotine-replacement', '尼古丁替代治疗', 'Nicotine patch / gum / lozenge / inhaler', 'smokingCessation', {
    indication: '手册将尼古丁贴片、口香糖、润喉糖和吸入剂列为烟草依赖的一线替代治疗。',
    action: '以受控、逐步减量的尼古丁暴露缓解戒断和渴求，避免燃烧烟草产生的有害物质。',
    kinetics: '不同剂型的吸收速度与峰浓度差异明显；吸烟、咖啡因和合并贴片会改变暴露。',
    interactions: '戒烟后 CYP1A2 诱导消失，氯氮平、奥氮平和茶碱浓度可能上升；不可叠加过量尼古丁制剂。',
    contraindications: '近期心梗、严重心律失常、妊娠和儿童使用需个体化评估；出现胸痛、心悸或中毒症状应就医。'
  })
];
