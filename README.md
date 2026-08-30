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

## 信息可视化的数据来源

「信息可视化」栏目（`src/atlas/`）的流行病学数据全部来自公开权威数据库，页面底部附完整来源与使用条款：

- 患病率：IHME 全球疾病负担研究 GBD 2023（204 个国家/地区 × 2016–2023 × 12 个疾病条目，含全年龄与年龄标准化口径）
- 人均 GDP：世界银行 World Development Indicators
- 精神科医生密度与心理健康支出占比：WHO Mental Health Atlas（经 GHO 发布，快照值）
- 自杀死亡率：WHO 全球卫生估计（经 GHO 发布，2000 年以来的国家 × 年份序列）
- 美国族裔患病率与治疗可及性：KFF 对 SAMHSA NSDUH 2024 与 CDC 死因数据的整理（全国快照）

数据由一次性构建脚本归一生成：

```bash
node scripts/atlas/build-atlas-data.mjs
```

脚本读取本地缓存的原始下载文件（不入库），产出 `src/atlas/*.js` 数据模块（入库）。`src/atlas/geo.js`、`prevalence.js`、`context.js`、`ethnicity.js` 为生成文件，请勿手改；`spectrum.js`、`sources.js`、`display.js`、`index.js` 为手写维护文件。修改数据口径时先更新构建脚本再重新生成，`tests/atlas-data.test.mjs` 会校验记录完整性、数值范围与谱系引用一致性。

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
