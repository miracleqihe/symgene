# 贡献指南

## 环境与安装

使用 Node.js 22 和仓库内的 `package-lock.json`：

```bash
npm ci
npm run dev
```

不要删除锁文件，不要把顶层依赖改为 `latest` 或 `*`。

## 验证命令

提交前运行：

```bash
npm run check:data
npm run check:links
npm run test:unit
npm run test:ui
npm test
npm run build
npm run check:build
npm run verify
```

`test:unit` 覆盖纯逻辑，`test:ui` 覆盖用户行为和 axe-core 可访问性基线。`check:links:remote` 用于人工或定时检查外部可达性，不属于普通 Pull Request 的阻断门禁。

## 数据与医学内容边界

- 不在工程重构中顺便改写疾病、药物、案例、风险词或搜索权重；
- 医学结论、适应证、禁忌、风险级别和来源变化必须单独说明并接受内容审核；
- 新增或修改数据后必须运行数据校验和搜索回归测试；
- 不删除知识条目来规避验证错误；
- 原始书籍、PDF、OCR 文本和提取中间文件不得提交。

## 本地数据与隐私

- 存储格式变化必须提供迁移、迁移前备份和失败不覆盖测试；
- 导入内容必须通过正式验证器，不执行文件内容或自动访问其中链接；
- 测试只使用虚构资料和 `example` 路径/域名；
- 不提交真实姓名、邮箱、电话、地址、患者资料、凭据、Token、Cookie 或本地私人路径；
- 不要把 `localStorage` 描述为加密或安全存储。

## 分支与 Pull Request

- 从最新 `main` 创建独立分支；
- 禁止直接向 `main` 推送；
- 禁止强制推送和改写历史；
- 使用小而清晰的逻辑提交，不混入无关格式化；
- Pull Request 应先保持 Draft，写明行为、数据结构、医学边界、隐私检查和完整验证结果；
- Pull Request 事件只验证，不部署 Pages；
- 评审通过和持续集成通过不等于自动获得合并权限。

提交前确认当前分支不是 `main`，工作区没有意外文件，并运行 `git diff --check`。
