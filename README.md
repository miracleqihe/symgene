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

## 核心原则

- 检索结果按照疾病线索、相似案例、关联治疗与药物资料的顺序呈现，不提供自动诊断。
- 自伤、伤人和伤害婴儿等高风险描述会优先显示安全提示，并抑制普通匹配结果。
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

`verify` 会依次执行正式数据检查、静态链接检查、自动化测试、生产构建和构建产物边界检查。纯逻辑和用户界面测试也可以分别运行：

```bash
npm run test:unit
npm run test:ui
```

## 部署行为

- Pull Request：只执行数据检查、测试和生产构建验证，不部署。
- 推送到 `main`：全部验证通过后，由 [GitHub Pages 工作流](.github/workflows/deploy-pages.yml)部署。
- 手动运行工作流：全部验证通过后允许部署。

## 隐私与本地数据

- 描述式检索在浏览器本地运行；项目代码本身不主动将搜索描述发送到后端。
- 新增、编辑、删除和本地数据管理仅在开发模式开放，编辑内容保存在浏览器 `localStorage`。
- 开发模式可以导出、导入、恢复和重置本地数据；迁移和替换前会先创建有限数量的自动备份。
- 清除浏览器数据可能导致本地编辑内容与自动备份丢失；请勿录入真实患者身份信息。
- 原始书籍、PDF、OCR 文本和提取中间文件不会进入公开仓库。

详细格式与恢复规则见 [本地数据说明](docs/local-data.md)。

## 贡献

开始修改前请阅读 [贡献指南](CONTRIBUTING.md) 和 [前端架构说明](docs/architecture.md)。Pull Request 只执行验证，不会部署公开站点。

## 免责声明

本站内容仅供精神与心理健康科普参考，不构成诊断、处方或个体化医疗建议，也不能替代医生或其他合格专业人员的面对面评估。紧急情况下，请立即联系当地急救、警方或危机干预资源。
