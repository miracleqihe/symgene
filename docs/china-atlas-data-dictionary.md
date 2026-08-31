# 信息可视化 · 中国资源地图：数据字典与评分模型说明

对应项目计划《心理治疗资源地图与综合评分系统》的交付物要求。数据版本见
`src/atlas/chinaMeta.js` 的 `DATA_VERSION`（全局）与页面底部标注。

## 1. 机构主数据库（`src/atlas/institutions.json`）

生成命令：`node scripts/atlas/build-china-data.mjs`
原始来源（本地 `raw/atlas-public/`，不入库）：
OpenStreetMap Overpass 两次查询 + 人工核校知名专科机构名录（Nominatim 地理编码）。

发布数据使用 `schemaVersion: 1`，并按国家命名空间组织：

```json
{
  "schemaVersion": 1,
  "country": {
    "china": {
      "sources": ["amap", "curated", "nominatim", "osm"],
      "institutions": []
    }
  }
}
```

高德检索脚本只负责 provider 数据采集，写入本地
`raw/atlas-public/institutions.json` 的
`country.china.providers.amap.results`；分类、坐标转换、跨来源去重和省份归属仍由
`scripts/atlas/build-china-data.mjs` 完成。前端和机构级口碑聚合都只读取发布数据的
`country.china.institutions`，不直接依赖高德原始响应。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | `amap-*` / `curated-*` / `nominatim-*` / `osm-*`，目录内唯一 |
| name | string | 机构名称（公开名称，未脱敏处理个人字段——本表不涉及个人） |
| lat / lng | number | WGS-84 坐标；高德 GCJ-02 数据在构建阶段转换，示意用途 |
| province | string | 通过省级边界射线法命中归属，兼容飞地 |
| adcode | string | 6 位省级行政区划码 |
| city | string \| null | 城市（人工名录自带；OSM 条目为 addr:city，常为空） |
| category / categoryLabel | string | `specialized` 精神专科医院 / `health-center` 心理·精神卫生中心 / `counseling` 心理咨询机构 / `education` 心理健康教育机构 / `related` 精神卫生相关机构 |
| precision | string \| null | `address`（名称编码且城市校验通过或人工核校）／`city`（市级质心兜底）——地图上逐条可查 |
| source | string | `amap`（高德开放平台）／`osm`（© OpenStreetMap 贡献者，ODbL）／`nominatim`（OpenStreetMap 检索）／`curated`（人工核校） |
| note | string \| null | 人工核校备注 |

收录范围声明：**本表是公开地图数据的部分收录，不是全国注册机构全集**。
截至数据版本日 1,426 家、覆盖 32 个省级地区（逐城抓取分批进行，未覆盖城市持续补充）。扩充路径：接入高德/百度地图开放平台
POI 接口（需 API Key）并与卫健委医疗机构登记信息公开查询对齐。

### 1.1 高德 POI 批次（2026-08-30 起，逐城抓取）

高德开放平台 Web 服务 API（place/text，组合关键词"精神卫生中心|精神病院|心理医院|
心理咨询|精神科|心理科|睡眠医学"），坐标 GCJ-02 已转换为 WGS-84（误差约 1-2 米）。
免费个人 Key 日配额有限，按城市分批抓取（进度见 `raw/atlas-public/amap-progress.json`，
Key 本地存放不入库）。数据使用需遵守高德开放平台服务条款并注明来源。

## 2. 分省公开资源统计（`src/atlas/chinaProvinceStats.js`）

当前基线：**2024 年**（精神科床位数，医院分科口径）——（史晨辉等《中国精神卫生资源状况分析》，中国卫生政策
研究 2019——国家精神卫生项目办全国调查）。字段：

| 字段 | 说明 |
| --- | --- |
| name | 省级行政区名称 |
| institutions2010 / institutions2015 | 精神卫生机构数（2010 / 2015 年底） |
| institutionsGrowth | 2010→2015 增幅（%） |
| openBeds2015 | 开放床位数（2015 年底） |
| blankCountyTotal / blankCounty2015 / blankCountyRate | 区县总数 / 无精神卫生资源区县数 / 空白率（%） |
| national | 是否为全国合计行（仅 2015 原始表含） |

2024 年数值提取自《2025中国卫生健康统计年鉴》表 3-1-6《2024年各地区医院分科
床位数》精神科列（31 省求和与全国合计 991,751 张精确吻合；四川 109,030 张最高、
西藏 620 张最低）。2015 年版（机构数/编制与开放床位/空白区县率，史晨辉等）保留
于 git 历史，需要时可将 `china-province-resources-latest.json` 移除并重跑构建回退。

**升级到更新年份**：替换 `raw/atlas-public/china-province-resources-latest.json`：

```json
{ "year": 2024, "rows": [ { "name": "北京市", "institutions": 64, "openBeds": 10560 } ] }
```

再运行构建脚本即可整体替换分省基线，页面指标标签自动切换年份。建议数据源：
《中国卫生健康统计年鉴》对应年卷“各地区精神病医院机构、床位及人员数”表
（2025 版收录至 2024 年底）；该表在公开网络无完整转载，需从年鉴 PDF/Excel 或
CNKI 年鉴平台提取后放入上述文件。

全国口径最新数据（已写入页面“中国特点”卡片，截至 2020 年底，马宁等《2020年
中国精神卫生资源状况分析》，中华精神科杂志 2022）：精神卫生医疗机构 5,936 家、
开放床位 798,191 张（5.65 张/万人）、精神科执业（助理）医师 50,124 人
（3.55 名/10 万人）、注册护士 139,642 人（9.89 名/10 万人）；12.31% 区县无机构、
31.05% 区县无床位。2025 年国家精神卫生项目办介绍：省级 100%、除三沙外所有地市、
88% 的县设有本级精神卫生医疗机构，空白区县较 2015 年减少约 85%。

## 3. 综合评分模型（v1：模型就绪，数据分维度接入）

```
综合评分 = α × 大众口碑 + β × 医疗资源设备 + γ × 专业度
默认 α = 40%，β = 30%，γ = 30%（config 可调，src/atlas/chinaMeta.js）
```

| 维度 | 归一化输入 | 当前状态 | 数据来源与接入方式 |
| --- | --- | --- | --- |
| 大众口碑 α | 经授权、脱敏、人工复核后的服务体验维度统计 | **研究中，生产停用** | 小红书/抖音/知乎样本只进入本地研究流程；完成来源授权、隐私评估、实体准确率、代表性与发布规则审查前，不生成机构评分或排名 |
| 医疗资源设备 β | 机构等级、床位/诊室规模、设备、人员数量 | 部分可用 | OSM 标签（beds 等）暂缺严重；待接入卫健委医疗机构登记信息公开字段 |
| 专业度 γ | 医师资质职称、重点专科、擅长方向覆盖度 | 待数据接入 | 卫健委登记信息 + 机构公开介绍文本的标签抽取（抑郁症/焦虑/儿童青少年/睡眠/创伤等） |

**合规与脱敏约定**：网页公开可见不等于可任意再发布。社交原始数据和带文本的
清洗结果只能位于 git 忽略的 `raw/` 或 `work/`，不得进入仓库、构建产物或网页。
研究流程只创建候选人工审阅队列；任何公开聚合仍需确认平台规则、合法基础、
最小样本、机构实体准确率、时间范围与撤回机制。不得展示作者信息、原帖链接、
个人经历文本、医学结论或基于社交样本的机构排名。

评分可解释性：v1 阶段任一维度缺失即不计算综合评分（显示“待数据接入”），
不做无依据估算；数据齐备后每个机构的三个分项与综合分都可在详情卡下钻查看。

### 3.1 社交平台研究（生产发布已暂停）

旧的 `scripts/atlas/aggregate-social.mjs` 发布流程已停用；生产模块
`src/atlas/chinaSocialReputation.js` 保持为空。旧流程存在关键词误归因、静默丢弃
损坏行、重复样本和极小词表评分等证据充分的风险，不符合心理健康资源产品的
发布标准。

新的 `scripts/research/prepare-social-data.mjs` 仅用于本地研究，执行严格解析、稳定
去重、直接标识符遮盖、敏感风险标记、机构实体匹配与服务体验候选筛选，输出到
git 忽略的 `work/`。它不输出 `reputationScore`、排名、原帖链接或可发布文案。
完整决策、审阅门槛和当前样本审计见 `docs/social-data-research-plan.md`。

## 4. 省级边界（`src/atlas/chinaGeo.js`）

阿里云 DataV GeoAtlas 公开 GeoJSON，坐标精简至约 1 公里精度，仅作科普示意；
正式使用需遵守中国地图审图号规范。

## 5. 中国特点内容（`src/atlas/chinaMeta.js` 的 CHINA_FACTS）

1. CMHS 患病率：任何精神障碍（不含老年期痴呆）终生 16.6%、12 个月 9.3%
   （Huang Y, et al. Lancet Psychiatry, 2019；31 省 157 县区 32,552 人）。
2. 求助缺口：多数符合诊断标准者从未接受专业治疗（同上）。
3. 资源分布不均：见本文档第 2 节 2015/2020/2025 三个时点。
4. 全国统一心理援助热线 12356（2025 年起），紧急情况 120/110。
