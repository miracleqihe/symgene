# T02 原生浏览器存储 smoke

本轮已运行真实 Chromium，并在全新 headless context 的原生 `localStorage` 中执行合成消费演练。未使用 MemoryStorage、个人 profile、既有个人 cookie 或个人浏览器存储。生产仍为 legacy；此结果是消费 harness 验证，不是生产 UI、医学内容或正式 T02 人工验收。

## 源码与执行环境

消费源码来自已提交的 `72fb9300aabf3bd3aa446322987bd030c5f0f504`。驱动只读调用 `git archive`，提取到自建 Git 外临时目录；其中没有 `.git` 或未提交的 sim-1/2，包含锁定 sim-3/4。已有 node_modules 通过临时链接只读使用，没有安装依赖或修改包锁。

Node 22 预检在该 archive 中执行真实完整包核验与本地采用门禁，网站 `validateData` 校验通过后，才把合成夹具传入浏览器。额外 rights-expiry 包由 archive 中实际 vendor 构建器生成，使用该 vendor provenance 的 producer `codeDigest` / `pipelineCommit`，不继承旧包的构建器摘要。producer commit 原标记为 `uncommitted`，报告如实保留；网站消费源码 commit 与逐文件 SHA-256 另行记录，不能把导出摘要或模拟 trust 当成真实身份认证。

实际环境为 Node `22.23.3`、bundled Playwright `1.62.1`、Chromium `151.0.7922.34`、Darwin `27.0.0` / arm64。浏览器的 MacIntel / Intel UA 是实际兼容字符串，宿主架构以系统记录为准。未下载浏览器或新测试依赖。

静态服务仅绑定 `127.0.0.1` 临时端口，固定子路径 `/symgene/t02-smoke/`，只允许七个真实 browser-safe adapter / storage / validation / search 模块与合成 harness 页面。生产 `src/data.js` 和机构数据请求返回 404。`browser-smoke.json` 记录本次真实端口、浏览器版本、驱动摘要、archive 摘要、源码摘要及断言结果。

## 实际断言

1. 新 context 的 localStorage / cookie 为空，Storage 对象为浏览器原生实现；本地 override、自定义案例、资源墓碑和真实备份建立后，疾病与两个案例可见。
2. 显式注入模拟可信 emergency sequence 10 后，疾病及其案例在搜索与详情边界隐藏；合并对象、用户覆盖、墓碑和备份原字节保留。
3. 页面真实 reload 后全部 localStorage 摘要保持；撤稿仍隐藏，sequence 9 被 `RETRACTION_DOWNGRADE` 拒绝。
4. 通过原 storage API 恢复确实含已撤稿疾病的备份，原始数据可恢复，但显示与搜索仍隐藏，安全 ledger 未被覆盖。
5. 切换到精确核验过的 sim-3 并再次 reload，sequence 10 和撤稿过滤继续有效。
6. rights 有效期到期前仍有未撤稿药物可见；到期后，即使 emergency 尚在有效期内，全部高风险知识隐藏。旧包的 rights 仍有效而 emergency 过期或不可信时，也全部隐藏。
7. 所有页面请求均受本机 origin / 子路径白名单约束，service workers 被禁用；本次没有外部页面请求、page error 或 console error。第二个全新 context 再次确认 localStorage 为空。

共 48 项驱动断言通过。报告结果只含聚合状态、计数和摘要；截图 `rights-expiry.png` 只显示合成 harness 的零可见条目结果，位于工作区外层 `.t02-evidence/overnight-stage4-browser/`。没有把 screenshot 或浏览器个人数据加入仓库。

## 重放

在授权的网站 Git 工作树、Node 22 和现有 bundled Playwright 下运行：

```sh
node scripts/t02/browser-smoke.mjs \
  --source-commit 72fb9300aabf3bd3aa446322987bd030c5f0f504 \
  --evidence-dir ../../.t02-evidence/overnight-stage4-browser
```

默认复用 Codex bundled Playwright；如其位置不同，可通过 `SYM_T02_PLAYWRIGHT_MODULE` 指向已存在的 `playwright/index.mjs`。不安装依赖。驱动在 finally 中关闭浏览器和 loopback 服务，并且仅清理自己创建的临时 archive 与合成包；指定的外层证据保留。CLI 输出可保存为 `docs/t02/browser-smoke.json`。

## 验证边界

这是合成 consumer harness，不加载生产 React UI，也不声称浏览器执行 Node 发布器。Node 负责核验整包、批准的本地模拟采用步骤及历史 sidecar；浏览器实际执行来自提交树的 adapter、storage、validation 与 search 模块。

时钟固定为 `2026-10-14T12:00:00Z`，trust 仅由受控脚本注入。服务使用 no-store，并阻断 service workers 和外部页面请求；因此没有验证生产 CDN / 缓存 / 离线传播时效、真实紧急撤稿渠道、人工权限或跨独立重启的防篡改可信存储。原生 localStorage 的同 origin reload 保留已验证，真实持久可信 sequence 与生产发布仍需独立配置和签收。
