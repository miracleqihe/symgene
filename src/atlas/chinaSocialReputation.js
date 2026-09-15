// 由 scripts/atlas/publish-reviewed-aggregate.mjs 生成，请勿手改。
// 数据口径：仅包含通过人工核对（aggregationDecision=include 且 privacyDecision=clear）的证据；
// snippets 仅在隐私核对通过后发布匿名评论文本，不含账号、链接、时间、点赞数、作者哈希等可溯源字段；
// 样本不足不发布维度分布与评分；不产出机构综合口碑分。
// serviceScore 是「已核对亲历叙述的正负面构成」，样本非随机，不代表机构总体服务水平。
export const SOCIAL_REPUTATION_META = {
  "platforms": [
    "小红书",
    "抖音",
    "知乎"
  ],
  "aspectLabels": {
    "access_and_wait": "挂号与等待",
    "cost_and_billing": "费用与结算",
    "staff_interaction": "医患沟通",
    "process_and_information": "流程与告知",
    "environment_and_facilities": "环境与设施",
    "continuity_and_follow_up": "复诊与连续性",
    "self_reported_outcome": "自述结果",
    "other": "其他"
  },
  "updatedAt": "2026-09-15",
  "noteCount": 0,
  "commentCount": 0,
  "hasDimensions": false,
  "publicationGate": "HUMAN_ADJUDICATED_ONLY",
  "scorePolicy": {
    "producesCompositeScore": false,
    "producesServiceScore": true,
    "scoreName": "服务体验倾向分",
    "formula": "单个维度 =（正面条数 + 0.5 × 中性条数）÷ 该维度总条数 × 100；总分为各达标维度的简单平均，不加权。",
    "minSampleForScore": 20,
    "minAspectSample": 3,
    "minDimensionsForScore": 3,
    "strictOnly": false,
    "reason": "队列是「亲历信号 + 服务维度数」降序抽样，不是就诊者的随机样本——愿意在网上写长文的人本就更可能是来吐槽的。因此这里给出的是「已审阅亲历叙述里的正负面构成」，不是机构总体口碑，也不能当作就医推荐依据。页面同时列出正/负/中性原始条数，读者可以自行判断。"
  },
  "review": {
    "queueId": "merged:social-evidence-1a1003462b13bd3b+social-evidence-batch2-target-experience+social-evidence-batch3-expanded-alias",
    "adjudicatedAt": "2026-09-15T12:55:38.704Z",
    "total": 231,
    "included": 35,
    "pending": 3,
    "excluded": 193,
    "publishable": {
      "total": 35,
      "strictDirectText": 12,
      "relaxedContext": 23
    },
    "duplicates": 5,
    "minSampleForScore": 20
  },
  "statusNote": "本页不展示原帖链接、账号或任何可溯源字段；仅展示经人工逐条核对后的匿名计数与通过隐私核对的匿名评论内容。样本不足的机构不发布维度分布，也不计算综合评分。"
};

export const SOCIAL_REPUTATION = {
  "上海市精神卫生中心": {
    "mentions": 24,
    "strict": 10,
    "relaxed": 14,
    "aspects": {
      "staff_interaction": 16,
      "cost_and_billing": 6,
      "environment_and_facilities": 4,
      "access_and_wait": 12,
      "process_and_information": 12,
      "continuity_and_follow_up": 3
    },
    "byPlatform": {
      "抖音": 1,
      "小红书": 23
    },
    "experiences": {
      "firsthand": 19,
      "accompanied": 5
    },
    "polarity": {
      "positive": 2,
      "negative": 17,
      "neutral": 5
    },
    "snippets": [
      {
        "text": "得运动 我的医生都在催我运动 我已经尽力了[尬笑]",
        "platform": "抖音",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction"
        ],
        "overall": "neutral"
      },
      {
        "text": "我觉得上海精卫 至少是我去过的徐汇区的 儿童特需真的很屎[笑哭R]同济特需就比上精卫贵两百块钱态度不知道好了多少倍 环境又安静 医生又有耐心听你说话[笑哭R]换医院之后再也没去上精卫看过",
        "platform": "小红书",
        "experience": "家属陪诊",
        "aspects": [
          "cost_and_billing",
          "staff_interaction",
          "environment_and_facilities"
        ],
        "overall": "negative"
      },
      {
        "text": "不在网上冲浪不知道上海的好,宛平南路600号,我带大女儿去看过,做了一系列检查,开了药没吃,心理咨询也没排上,就感受一般,我爸爸每个月定期去开药也没啥特别的,原来在这普普通通的日常操作中竟然有这么大的差距",
        "platform": "小红书",
        "experience": "家属陪诊",
        "aspects": [
          "access_and_wait",
          "process_and_information",
          "continuity_and_follow_up"
        ],
        "overall": "negative"
      },
      {
        "text": "女儿上海精卫住院的21天,真的有这么可怕? 女儿因焦虑抑郁住院,封闭病房让她不适应,但科学管理帮助她康复。我接纳她的感受,调整心态,最终顺利出院。这次经历让我明白,住院不仅是治疗,更是心态的升级。#上海精卫[话题]# #精神科住院[话题]# #孩子抑郁[话题]# #惊恐发作[话题]# #家庭治疗[话题]# #抗焦虑[话题]# #真实经历[话题]##宛平南路600号[话题]#",
        "platform": "小红书",
        "experience": "家属陪诊",
        "aspects": [
          "environment_and_facilities",
          "process_and_information"
        ],
        "overall": "positive"
      },
      {
        "text": "[哭惹R]在上海精卫看过的宝宝们能不能有推荐的医生呀,我真的已经不想再碰到不好的医生了,那对我伤害实在太大",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction"
        ],
        "overall": "negative"
      },
      {
        "text": "我孩子16,住成人病房,全封闭,护工医生还可以,毕竟他们不是亲人,不能要求他们怎样?",
        "platform": "小红书",
        "experience": "家属陪诊",
        "aspects": [
          "staff_interaction",
          "environment_and_facilities"
        ],
        "overall": "neutral"
      },
      {
        "text": "请问宝宝 我也挂了心理咨询科 这里的医生负责开药吗...?ಥ_ಥ 我只是为了开药才来的,600号人太多了抢不到号",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "600号真的体验感很差，可能是患者太多了，医生和护士都有点没有质量了你懂我意思吧，我第一次去的时候不知道要网上预约挂号，我一个人去的，那个时候我刚好犯病了，整个人都不太好，我去导诊台的时候，人家根本就不理你，我已经是肉眼可见的那种不太好了，人家也没有就是问一句怎么了，或者是需要什么帮助，然后我去咨询挂号事情的时候也是很冷漠，让我自己看旁边的图，那个图正常人可能看了都有点懵的那种，我那时候很难受就拍了照片走了",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "今晚睡不着，说一说那天去的过程吧。首先是刚进院门口，扫码进去之后，我就问医生，“请问一下，这里挂号是哪儿挂”，医生随手一指，我就直接去了那边排队的地方了。大概二十分钟到我了，窗口里的年轻医生说，这儿不是挂号的，去那边前台。我又屁颠屁颠的去前台挂。这里结束后，就排队看医生，过了两小时到我了，因为是初诊，医生问了几句，就直接跟我说，“给你开药”。我满脑子疑惑，我说“不需要做别的项目确诊一下吗？”，那医生说，你不是自己都说了这样的情况，那不管是不是先治疗。最后我看了桌子上有心理测试，我就自己说去，这医生说那你直接去那边就行了。我就顺着那个位置找去后，又等了好一会，那边的医生说，你得去交费啊，不交费怎么测试呢，我就问在哪儿交费。跑去一楼交费，那个医生很凶的说，“你在哪边找的医生就去那边，到这边交什么费”。我就又去了刚进门的那栋楼交费，那边的交费口医生也是很凶的，“扫码”“你这什么码！”“让扫付款码你给我这个码干嘛”，我以为是医保的码，就又一顿凶，交了费，就去做心理测试，结果就是几篇测试题就三百块，就挺不能理解的。做完后，拿了结果找医生，他就看了一下，就直接说给我开药，我说我现在还能自己控制，不想开药，我就想过来确诊一下自己是不是。医生就说，你拿不拿药那是你的事，我该做的做了，最后怎么样，那是你自己的事。（其实很潦草，去了聊几句就要给你开药，这一通下来，我想着再去别的医院看看）#上海市精神卫生中心# #抑郁症#",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "cost_and_billing",
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "等了两个多小时，上次来是一楼那个女的一副事不关己高高挂起的样子，很冷漠很恶心，因为我有点赶时间问她大概要等多久，她说我怎么晓得咯，那医生叫号他怎么叫就怎么叫的，我怎么知道啦！我等了很久之后感觉快来不及想着要不退号算了，去问她她说那你想清楚没了反正别到时候来怪我，我真的想问这是正常的一个医生的态度吗？？你到底是帮助病人的还是来给病人添堵的？而且这还是精神科诶，我去六院普通科每个医生态度都还很好，甚至还有电话回访问体验感受如何。今天也是拿药的时候我忘记带包来了，开了好几盒药两只手都有点抓不过来的，口袋也根本塞不进，我问有没有小塑料袋她说不配袋子的，我说我这个实在放不下能不能给我找个小塑料袋，板着脸不说话…好像欠了她八百万一样，说实话我没有见过这么冷漠的医院，而且这还是精神科，到底是我有病还是这个世界有病？#上海精神卫生中心# #宛平南路600号#",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "我来啦，我上周二去宛平路600号，普通号挂号没得挂，只能挂专家号，我看的专家号医生说实话蛮有耐心的给我换药，然而花了我700块钱",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "cost_and_billing",
          "staff_interaction"
        ],
        "overall": "negative"
      },
      {
        "text": "好像没有看到有机器，我知道好多时候都没袋子了，之前我也是自己带包的，但这次太赶了忘记了，主要是她的态度问她直接板着脸不回答，要我去旁边，我拿着药都不知道怎么办，主要是我还要去另外一家医院，后面还是找安保那边的姐姐给了我一个奶茶袋子装走的",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "我也不执着主任医师，我看履历年轻医生学历更高，也猜想他们或许会多一点共情能力，果然年轻医生超级温柔，超级好",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction"
        ],
        "overall": "positive"
      },
      {
        "text": "精卫闵行分院，宛平南路我挂不上，而且宛平南路更贵一点。所以挂了闵行。反正我都是外地过去，也不差这十公里",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "cost_and_billing"
        ],
        "overall": "negative"
      },
      {
        "text": "我去上海宛平南路那个医生态度奇差，还问我治不治里不治就辊...老师你好在哪里看的呀我真的很需要",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction"
        ],
        "overall": "negative"
      },
      {
        "text": "我住过，我那个病区还好，现在我和我妈越来越觉得换环境会好很多，只要一回到这里脾气一点就炸",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "environment_and_facilities"
        ],
        "overall": "neutral"
      },
      {
        "text": "我挂的另一个医生的特需也是300元不到2分钟就问诊结束了",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "cost_and_billing",
          "staff_interaction"
        ],
        "overall": "negative"
      },
      {
        "text": "第一次应该是的，我妈今天特地去医院跑了一趟挂号",
        "platform": "小红书",
        "experience": "家属陪诊",
        "aspects": [
          "access_and_wait",
          "process_and_information"
        ],
        "overall": "neutral"
      },
      {
        "text": "回复我另一条评论说她 25 的给看过，你可以试试普通号属于屏幕叫到我名字 我人还没完全进去 医生就在讲开药是吧然后报药名，速度很快那种半分钟一个人，一天接待一千多个。上上次我去的时候也遇到过有个人挂错号然后一直问医生，医生也挺不耐烦说她这里不看病，然后医生一边给我开药一边😂最后我走了，那人还在，碰运气吧，看你遇到哪个医生",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "我打算去浦东那家医院试试了，反正600号真的每次去体验感都不好，我看很多人碰到的好医生都是如果没有聊很多的话就不收咨询费的，我那个医生我基本上每次去都是简单讲述近况就配药，她也次次收我咨询费",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "cost_and_billing",
          "staff_interaction",
          "continuity_and_follow_up"
        ],
        "overall": "negative"
      },
      {
        "text": "同感。我去也是，开了药然后让我去做心理咨询，推了一个外部机构，我没去。",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "continuity_and_follow_up",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "我去宛平南路体验很差，约了下个月闵行区的专家号，要是有用我可以告诉你",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "staff_interaction"
        ],
        "overall": "negative"
      },
      {
        "text": "你好，我挂的闵行初诊，为啥挂好号了没让我缴费",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "process_and_information"
        ],
        "overall": "neutral"
      },
      {
        "text": "你的医生蛮好的。我的医生直接让我去做题了",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      }
    ],
    "dimensionScores": {
      "staff_interaction": {
        "positive": 2,
        "negative": 12,
        "neutral": 2,
        "n": 16,
        "score": 18.8
      },
      "cost_and_billing": {
        "positive": 0,
        "negative": 6,
        "neutral": 0,
        "n": 6,
        "score": 0
      },
      "environment_and_facilities": {
        "positive": 0,
        "negative": 1,
        "neutral": 3,
        "n": 4,
        "score": 37.5
      },
      "access_and_wait": {
        "positive": 0,
        "negative": 8,
        "neutral": 4,
        "n": 12,
        "score": 16.7
      },
      "process_and_information": {
        "positive": 1,
        "negative": 6,
        "neutral": 5,
        "n": 12,
        "score": 29.2
      },
      "continuity_and_follow_up": {
        "positive": 0,
        "negative": 3,
        "neutral": 0,
        "n": 3,
        "score": 0
      }
    },
    "serviceScore": 17,
    "serviceScoreNote": "24 条已审阅亲历叙述中 2 条偏正面、17 条偏负面、5 条中性；取 6 个达标维度的平均分。",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [
      "staff_interaction",
      "cost_and_billing",
      "environment_and_facilities",
      "access_and_wait",
      "process_and_information",
      "continuity_and_follow_up"
    ],
    "reviewStatus": "scored",
    "scoreNote": "已发布服务维度分布（24 条通过人工审阅）",
    "attributionNote": "其中 10 条为文本自身指认机构，14 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "武汉市精神卫生中心": {
    "mentions": 3,
    "strict": 1,
    "relaxed": 2,
    "aspects": {
      "access_and_wait": 2,
      "staff_interaction": 2,
      "continuity_and_follow_up": 1,
      "process_and_information": 1,
      "environment_and_facilities": 1
    },
    "byPlatform": {
      "小红书": 3
    },
    "experiences": {
      "firsthand": 3,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 3,
      "neutral": 0
    },
    "snippets": [
      {
        "text": "我去武汉精卫看心理咨询 咨询师巴拉巴拉说我心理状态很痛苦 一定要坚持长期做心理咨询做疏导 但是你要是在医院预约咨询师 要排队很长时间 但是我可以把个人联系方式给你 你可以私下找我[微笑R]",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "staff_interaction",
          "continuity_and_follow_up"
        ],
        "overall": "negative"
      },
      {
        "text": "我今天去看了,预约心理治疗50分钟一次的那种,导医台说一个月以内的都满了,只能一个月以后了[笑哭R]。后来她说自己公众号预约也可以,我想请教一下你,挂号的话,是挂临床心理还是挂心理咨询与治疗呢?",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "你被打了他们会问你你有没有和患者对视有没有和她说话，还会问你身边的人，第一时间是怀疑你激惹了她。而且当时那个搞我的人清醒就被捆了一天然后第二天中午我看见她在走廊上游荡，我就去问护士，护士说总不能一直把人捆着，正常来说捆两个小时就够了他们把她捆了一天，然后我很生气，我就说下次我也扣面汤，他们就说我态度不好要捆我。反正别住，饭也不好吃。",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "environment_and_facilities"
        ],
        "overall": "negative"
      }
    ],
    "dimensionScores": {
      "access_and_wait": {
        "positive": 0,
        "negative": 2,
        "neutral": 0,
        "n": 2,
        "score": null,
        "suppressed": "仅 2 条，低于单维度 3 条下限"
      },
      "staff_interaction": {
        "positive": 0,
        "negative": 2,
        "neutral": 0,
        "n": 2,
        "score": null,
        "suppressed": "仅 2 条，低于单维度 3 条下限"
      },
      "continuity_and_follow_up": {
        "positive": 0,
        "negative": 1,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      },
      "process_and_information": {
        "positive": 0,
        "negative": 0,
        "neutral": 1,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      },
      "environment_and_facilities": {
        "positive": 0,
        "negative": 1,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 3 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 3 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 1 条为文本自身指认机构，2 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "北京大学第六医院": {
    "mentions": 3,
    "strict": 1,
    "relaxed": 2,
    "aspects": {
      "staff_interaction": 2,
      "environment_and_facilities": 2
    },
    "byPlatform": {
      "小红书": 3
    },
    "experiences": {
      "firsthand": 3,
      "accompanied": 0
    },
    "polarity": {
      "positive": 1,
      "negative": 0,
      "neutral": 2
    },
    "snippets": [
      {
        "text": "居然是北医六院的病友...૮(ɵ̷ ᴗ ɵ̷̥̥᷅)ა我也在那里住过,不论是医生还是病人都是两极分化啊...医生除了特别温柔的就是特别诡异的,病人除了特别乖的就是特别混的。。",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction"
        ],
        "overall": "neutral"
      },
      {
        "text": "我住院的时候真的特别特别开心，感觉是人生中最美好的时光。认识了很多病友，他们都很好，医生护士也都很温柔，现在都还想回去。",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "environment_and_facilities"
        ],
        "overall": "positive"
      },
      {
        "text": "我住在这个临床心理科相对松一点",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "environment_and_facilities"
        ],
        "overall": "neutral"
      }
    ],
    "dimensionScores": {
      "staff_interaction": {
        "positive": 1,
        "negative": 0,
        "neutral": 1,
        "n": 2,
        "score": null,
        "suppressed": "仅 2 条，低于单维度 3 条下限"
      },
      "environment_and_facilities": {
        "positive": 1,
        "negative": 0,
        "neutral": 1,
        "n": 2,
        "score": null,
        "suppressed": "仅 2 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 3 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 3 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 1 条为文本自身指认机构，2 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "山东省精神卫生中心": {
    "mentions": 2,
    "strict": 0,
    "relaxed": 2,
    "aspects": {
      "staff_interaction": 1,
      "process_and_information": 1,
      "cost_and_billing": 1
    },
    "byPlatform": {
      "小红书": 2
    },
    "experiences": {
      "firsthand": 2,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 2,
      "neutral": 0
    },
    "snippets": [
      {
        "text": "天，我可是看到吐槽他的了，我周一去看的时候就是挂着他的号，我跟我哥一块去的，我哥找他看了两年，进去就撸我袖子，然后就问我受没受刺激什么的，然后我就是不想说我的经历，因为我脑子一片空白，我也说不清，然后他就说你不说我怎么能知道呢？然后他看我不说就让我去做试题，抽了个血，做了个红脑什么的还有眼动",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "process_and_information"
        ],
        "overall": "negative"
      },
      {
        "text": "之前他让我去外边药店 就在想是不是有利益关系",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "cost_and_billing"
        ],
        "overall": "negative"
      }
    ],
    "dimensionScores": {
      "staff_interaction": {
        "positive": 0,
        "negative": 1,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      },
      "process_and_information": {
        "positive": 0,
        "negative": 0,
        "neutral": 1,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      },
      "cost_and_billing": {
        "positive": 0,
        "negative": 1,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 2 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 2 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 0 条为文本自身指认机构，2 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "西安市精神卫生中心": {
    "mentions": 1,
    "strict": 0,
    "relaxed": 1,
    "aspects": {
      "process_and_information": 1
    },
    "byPlatform": {
      "小红书": 1
    },
    "experiences": {
      "firsthand": 1,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 1
    },
    "snippets": [
      {
        "text": "宝你还在吗，我是看过一次开了药，第二次看另一个医生又让我挂心理科没给我开药了。心理科是心理咨询师吗",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "process_and_information"
        ],
        "overall": "neutral"
      }
    ],
    "dimensionScores": {
      "process_and_information": {
        "positive": 0,
        "negative": 0,
        "neutral": 1,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 0 条为文本自身指认机构，1 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "重庆市精神卫生中心": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "深圳市精神卫生中心": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "深圳市康宁医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "南京脑科医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "北京回龙观医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "北京安定医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "广州白云心理医院": {
    "mentions": 1,
    "strict": 0,
    "relaxed": 1,
    "aspects": {
      "staff_interaction": 1,
      "self_reported_outcome": 1
    },
    "byPlatform": {
      "小红书": 1
    },
    "experiences": {
      "firsthand": 1,
      "accompanied": 0
    },
    "polarity": {
      "positive": 1,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [
      {
        "text": "感觉看医生吧，不过治疗我的那个医生也没在那里干了，不知道现在如何了，之前是17年我去那里看医生，医生超级无敌好，只让我吃了帮助睡眠且没副作用的药，一直说一般不要随便吃药控制，当时高中的我想退学，厌学就是被那里的医生治好的。不过可能也只是那个医生好，那个医生现在我看朋友圈也是没在那干了",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "staff_interaction",
          "self_reported_outcome"
        ],
        "overall": "positive"
      }
    ],
    "dimensionScores": {
      "staff_interaction": {
        "positive": 1,
        "negative": 0,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      },
      "self_reported_outcome": {
        "positive": 1,
        "negative": 0,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 0 条为文本自身指认机构，1 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "中南大学湘雅二医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "杭州市第七人民医院": {
    "mentions": 1,
    "strict": 0,
    "relaxed": 1,
    "aspects": {
      "access_and_wait": 1
    },
    "byPlatform": {
      "小红书": 1
    },
    "experiences": {
      "firsthand": 1,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 1,
      "neutral": 0
    },
    "snippets": [
      {
        "text": "我住不进去再排位置",
        "platform": "小红书",
        "experience": "本人就诊",
        "aspects": [
          "access_and_wait"
        ],
        "overall": "negative"
      }
    ],
    "dimensionScores": {
      "access_and_wait": {
        "positive": 0,
        "negative": 1,
        "neutral": 0,
        "n": 1,
        "score": null,
        "suppressed": "仅 1 条，低于单维度 3 条下限"
      }
    },
    "serviceScore": null,
    "serviceScoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 1 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "其中 0 条为文本自身指认机构，1 条为父内容上下文归因（R1 放宽）",
    "attributionConfidence": "medium"
  },
  "合肥市第四人民医院": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "天门市精神卫生中心": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  },
  "永川区精神卫生中心": {
    "mentions": 0,
    "strict": 0,
    "relaxed": 0,
    "aspects": {},
    "byPlatform": {},
    "experiences": {
      "firsthand": 0,
      "accompanied": 0
    },
    "polarity": {
      "positive": 0,
      "negative": 0,
      "neutral": 0
    },
    "snippets": [],
    "dimensionScores": {},
    "serviceScore": null,
    "serviceScoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足",
    "reputationScore": null,
    "dimensions": null,
    "scoredDimensions": [],
    "reviewStatus": "insufficient_sample",
    "scoreNote": "仅 0 条通过人工审阅（阈值 20 条），样本不足，暂不发布维度分布与评分",
    "attributionNote": "暂无可用样本",
    "attributionConfidence": null
  }
};
