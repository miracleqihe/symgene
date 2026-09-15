// 由 scripts/atlas/publish-reviewed-aggregate.mjs 生成，请勿手改。
// 数据口径：仅包含通过人工审阅（aggregationDecision=include 且 privacyDecision=clear）的证据；
// 不含原文、链接、平台 ID、昵称或任何可识别字段；样本不足不发布；不产出机构综合口碑分。
// serviceScore 是「已审阅亲历叙述的正负面构成」，样本非随机，不代表机构总体服务水平。
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
    "queueId": "merged:social-evidence-1a1003462b13bd3b+social-evidence-batch2-target-experience",
    "adjudicatedAt": "2026-09-15T11:41:32.218Z",
    "total": 201,
    "included": 30,
    "pending": 2,
    "excluded": 169,
    "publishable": {
      "total": 30,
      "strictDirectText": 12,
      "relaxedContext": 18
    },
    "duplicates": 5,
    "minSampleForScore": 20
  },
  "statusNote": "本页不展示任何原帖链接、账号或原文；仅展示经人工逐条审阅后的匿名计数。样本不足的机构一律不发布维度分布，也不计算综合评分。"
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
  }
};
