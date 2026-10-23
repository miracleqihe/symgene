# Sym Gen（心鉴）

<p align="center">
  <img src="src/assets/sym-gen-mark.svg" alt="Sym Gen 标志" width="30%">
</p>

<p align="center">
  <a href="https://miracleqihe.github.io/symgene/">
    <strong>在线访问 Sym Gen（心鉴）</strong>
  </a>
</p>

Sym Gen 是一个面向公众的精神与心理健康公益知识库。项目以疾病库和教学案例库为检索核心：读者可以用日常语言描述正在经历的情况，先查看可能相关的疾病线索与相似案例，再阅读关联的治疗和药物资料。

当前版本收录：

- 114 个精神药物词条，按《精神药物手册》的章节与药理分类组织
- 122 个疾病科普词条
- 122 个教学性案例，每个疾病至少关联一个案例
- 4 项公开网络资源
- 「信息可视化」栏目：204 个国家/地区 × 2016–2023 的 12 类精神障碍患病率时空矩阵、关联分析散点图与美国族裔对比视图

## 网站与数据分仓

- [symgene](https://github.com/miracleqihe/symgene)：维护页面、交互、搜索、存储和内容消费。
- [symgene-data-pipeline](https://github.com/y4ho0/symgene-data-pipeline)：维护三库内容源、共用 Prompt、本机取材工具及 T02 数据处理核心。2026-10-23 复核：数据仓 [PR #3](https://github.com/y4ho0/symgene-data-pipeline/pull/3)、[PR #4](https://github.com/y4ho0/symgene-data-pipeline/pull/4) 已合入 `dev`，当前集成点为 `c8e9c57e120515d7846dff90d2127896ec6e2c20`；网站 [PR #34](https://github.com/miracleqihe/symgene/pull/34) 面向 `dev`、等待独立最终 Review。

修改正文或 Prompt 时先改数据仓，再导出并核对完整摘要，导入网站固定副本；网站可以独立构建。当前 19 文件与已合入数据仓 `dev` 逐字节一致，详见[双仓接续](docs/t02/local-github-sync.md)和[配对核验](docs/t02/local-data-handoff.md)。未指定的审读与运维职责保留接口，工程合并不代替医学、公众表达、来源权利审批或生产采用。

## 信息可视化的数据来源

「信息可视化」栏目（`src/atlas/`）的流行病学数据全部来自公开权威数据库，页面底部附完整来源与使用条款：

- 患病率：IHME 全球疾病负担研究 GBD 2023（204 个国家/地区 × 2016–2023 × 12 个疾病条目，含全年龄与年龄标准化口径）
- 人均 GDP：世界银行 World Development Indicators
- 精神科医生密度与心理健康支出占比：WHO Mental Health Atlas（经 GHO 发布，快照值）
- 自杀死亡率：WHO 全球卫生估计（经 GHO 发布，2000 年以来的国家 × 年份序列）
- 美国族裔患病率与治疗可及性：KFF 对 SAMHSA NSDUH 2024 与 CDC 死因数据的整理（全国快照）
- 中国资源地图：机构点位来自 OpenStreetMap（ODbL）+ 人工核校知名专科机构名录；分省资源统计来自《中国精神卫生资源状况分析》（中国卫生政策研究 2019，截至 2015 年底）；患病率事实卡来自中国精神卫生调查 CMHS（Lancet Psychiatry 2019）；数据字典与评分模型见 [docs/china-atlas-data-dictionary.md](docs/china-atlas-data-dictionary.md)

本仓保留当前 `src/atlas/` 展示数据及其回归测试。原 `scripts/atlas/` 生产脚本已移出网站，在本机作为待核权属与输入的 HOLD 材料保存；本分支不再提供原构建命令，也不自动重新采集。`src/atlas/geo.js`、`prevalence.js`、`context.js`、`ethnicity.js` 是既有生成文件，不能直接手改数据口径；数据生产工具须完成相应复核后再接入数据仓。

## 核心原则

- 检索结果按照疾病线索、相似案例、关联治疗与药物资料的顺序呈现，不提供自动诊断。
- 风险描述会按独立事件区分即时危险、待确认风险和第三人称/假设指引；已经实施、正在发生、当前计划或急性身体危险会优先显示安全提示，并抑制普通匹配结果。
- 公开构建为只读版本；新增、编辑和删除能力仅在本地开发模式出现。
- 原始书籍、PDF、OCR 文本和提取中间文件只保存在本地，不属于公开仓库或网络资源。

## 开发与验证

```bash
npm ci
npm run dev
```

完整验证：

```bash
npm run check:data
npm run check:links
npm test
npm run build
npm run check:build
```

也可以一次执行：

```bash
npm run verify
```

`verify` 会依次执行正式数据检查、静态链接检查、逻辑测试、界面与无障碍回归、生产构建和构建产物边界检查。两类测试也可以单独运行：

```bash
npm run test:unit
npm run test:ui
```

### T02 虚构内容包开发入口

```bash
node scripts/t02/dev-consumer.mjs --enable-synthetic
```

仅 Node.js 22 可启动；默认不带开关会拒绝，显式启用后仅监听 loopback，并输出 `/symgene/t02-dev/` 地址。这是独立的真实 React 开发应用，不是生产主界面。启动及加载时实读精确内容锁、vendor 来源和完整合成包，全部通过才交给浏览器 adapter，再经原存储 API 合并、撤稿投影、现有搜索和详情展示。生产入口仍使用 legacy，生产构建不包含该开发应用或启用开关；自动测试会实际构建验证此边界。

开发应用只使用 `symgene-t02-development:` 存储命名空间。原用户 schema v4 主键、字段覆盖、删除记录和备份不被替换。页面支持虚构编辑、合成包切换、备份导出/导入与恢复；导入先检查 5 MiB 字节上限和严格 UTF-8，再经正式迁移/验证/备份接口并显示摘要确认。撤稿与过期控制是明确标注的合成信任注入，未配置真人签字、生产发布者认证或持续可信撤稿通道；每秒重验新鲜度，无新鲜状态时先隐藏内容。不要录入或导入真实患者或私有资料。

T02 M4/M5 另有独立签名测试入口 `/symgene/t02-signed/`。先在独立数据仓配置本地测试网关，再运行：

```bash
node scripts/t02/signed-consumer.mjs --enable-signed-test http://127.0.0.1:PORT VERSION_A,VERSION_B VERSION_B
```

网关地址和允许版本只能由 Node 启动参数固定。每次读取都重新核验发布者、不可变制品、独立采用者、持久撤稿链与独立最新检查点；同源代理只转发通过的结果，失败返回 `503`、`Cache-Control: no-store`。签名页面没有旧入口的可信状态注入按钮。它使用 `symgene-t02-signed-test:` 命名空间和原 storage v4 接口；缓存只累积撤稿拒绝历史，不保存展示授权。离线、过期、检查点不可达或回退时，搜索和详情一起隐藏。紧急关闭在重启后仍有效；v1 不提供解除关闭的捷径。

在两个候选工作树相邻且已安装开发依赖的环境中，`node scripts/t02/signed-consumer-browser.mjs` 会启动本地测试身份服务、独立 HTTP 检查点、网关和实际 React 应用，用真实 Chromium 演练撤稿、回滚、网络故障、过期及恢复。运行证据写入 Git 外的 `.t02-evidence`。这些测试身份与模拟审核只证明本地工程行为，不代表真人签字、生产身份或正式采用。

## 开发交接

完整的视觉迭代记录、已撤回方案、待办事项和后续 AI 协作规范见
[开发历程与 AI 协作交接](docs/DEVELOPMENT_HANDOFF.md)。

## 部署行为

- 普通 Pull Request 以 `dev` 为目标分支，自动执行完整 CI，不部署。
- 只有同仓库的 `dev → main` 晋级 Pull Request 可以进入 `main`，并由 `@miracleqihe` 审核。
- 推送到 `main`：完整验证通过后，由 [GitHub Pages 工作流](.github/workflows/deploy-pages.yml)部署。
- 手动运行工作流：全部验证通过后允许部署。

## 隐私与本地数据

- 描述式检索在浏览器本地运行；项目代码本身不主动将搜索描述发送到后端。
- 风险语境识别使用可审计的本地规则，没有训练模型参与，也不能替代专业安全评估。
- 新增、编辑和删除仅在开发模式开放，编辑内容保存在浏览器 `localStorage`。
- 存储层支持导出、导入、恢复、重置和有限数量的自动备份；当前重设计界面没有恢复旧版的数据管理面板，需要接入这些操作时必须沿用现有存储接口。
- 疾病仍有关联案例时会阻止删除；恢复操作会先验证目标备份，避免无效恢复改变主数据或备份集合。
- 清除浏览器数据可能导致本地编辑内容与自动备份丢失；请勿录入真实患者身份信息。
- 原始书籍、PDF、OCR 文本和提取中间文件不会进入公开仓库。

详细格式与恢复规则见 [本地数据说明](docs/local-data.md)。

## 贡献

开始修改前请阅读 [贡献指南](CONTRIBUTING.md) 和 [前端架构说明](docs/architecture.md)。所有普通贡献先合并到 `dev`；只有审核通过的 `dev → main` 晋级 PR 会进入生产分支。

## 免责声明

本站内容仅供精神与心理健康科普参考，不构成诊断、处方或个体化医疗建议，也不能替代医生或其他合格专业人员的面对面评估。紧急情况下，请立即联系当地急救、警方或危机干预资源。
