> 2026-10-23策略更新：项目负责人已撤销legacy网站三类审读前置及固定失败发布阻断，当前规则见[现有网站的正常发布流程](local-standard-release.md)。本文的旧阻断、旧授权和旧验证结果保留为历史快照，不作为当前发布规则。

# PR #34 最终工程复核（2026-10-23）

本次仅在 `codex/t02-local-split-20261016` 更新依赖、回归测试和工程交接。
修复基线是 `868b09399e7c5417b60d96b8210d1c536338cab4`，不是修复后的 HEAD；
最终提交及其 CI 以 [PR #34](https://github.com/miracleqihe/symgene/pull/34) 的当前 head 为准。
`origin/dev` 为 `42c4b5968e5423a8de22d4308b05660ae15e95fe`，已经是该分支祖先；
`origin/main` 为 `22eb347edf3056955d6437c7eb951b63c28f76e0`。
没有批准、解决 Reviewer 讨论、合并、生产部署或伪造内容审批。

## 依赖安全审计

原始 `npm audit --json` 为 3 个受影响包（1 high、2 moderate），
对应 7 项公告；Vitest 本身的 moderate 来自传递依赖 mocker，不是第八项漏洞。
逐项读取 GitHub 公告及实际清单和锁文件后，采用同分支最低补丁版本：
Vite `8.1.5 → 8.1.6`、Vitest `4.1.11 → 4.1.12`，后者精确带入
`@vitest/mocker` 和同版本 Vitest 内部模块。没有使用 overrides、审计忽略、
`audit fix --force` 或大版本迁移。npm 建议的 Vite `8.3.5` 不是当前分支所需的最低修复。

依赖分类按实际用途与清单位置分别判断：

- React、React DOM、Remotion/player 和图标是浏览器应用运行依赖。
- Vite、React Vite 插件属于构建/开发工具，当前仍声明在 `dependencies`；
  因而 `npm audit --omit=dev` 也会包含 Vite，不能以“开发用途”排除审计。
  Pages 交付静态 `dist`，没有生产 Node/Vite 服务端。
- Vitest 是直接 `devDependency`，mocker 是 Vitest 的传递测试依赖。
  `vitest.config.js` 使用 jsdom 和 `vitest run`，没有 Browser Mode 或直接注册
  `mockerPlugin` / `interceptorPlugin`。
- Vite 的编辑器组件在发行包内打包；锁文件不会出现独立的 launch-editor 项，
  因此必须升级 Vite 本体，不能仅检查同名传递包是否存在。

| 公告 / 漏洞 | 影响与本项目触发条件复核 | 最低兼容修复及结果 | 剩余风险 / 依据 |
| --- | --- | --- | --- |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) / CVE-2026-112943（Moderate） | Windows 编辑器调用的 `%` 转义不足；需要恶意文件及环境变量/ADS 等条件。项目未自定义编辑器调用，但 Windows 贡献者可能运行 Vite。 | Vite 8.1.6 内置修复（launch-editor 2.14.2）；FIXED | 静态生产包不执行该服务；本机 macOS 未模拟 Windows 命令执行，依据上游补丁范围及锁定版本。 |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) / CVE-2026-112944（Moderate） | 特殊文件名被 Vim/Emacs 等当作参数；Vite 场景还涉及 WSL。项目没有这类配置，不能推定所有贡献者环境均不受影响。 | Vite 8.1.6；FIXED | 没有在 WSL 重放漏洞；以官方修复版本和升级后的功能回归为依据。 |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) / CVE-2026-112942（High） | Windows 特殊路径可绕过文件存在检查，与编辑器参数注入组合。 | Vite 8.1.6；FIXED | macOS/静态 Pages 不满足 Windows 触发条件；仍升级以保护跨平台开发。 |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) / CVE-2026-112945（Low） | 自定义服务把未经修改的请求 URL 传给 `transformIndexHtml`，并包含内联模块脚本。主应用是普通 SPA；两个 T02 本地消费者传入固定路径和外链脚本，不符合公告组合条件。 | Vite 8.1.6；FIXED | 不把当前配置的低暴露度当作豁免；继续保持 loopback/显式启用限制。 |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) / CVE-2026-112946（Moderate） | 非 Windows 开发服务器对外暴露，且项目导入路径恰与宿主绝对路径重合时可越过 fs allow。未发现这类导入，T02/浏览器预览均绑定 127.0.0.1。 | Vite 8.1.6；FIXED | 未运行对宿主敏感文件的 PoC；不依赖“未发现路径碰撞”替代补丁。 |
| [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) / CVE-2026-112949（Moderate） | 非认证 WebSocket 手工 mock 注册可能注入浏览器模块；需启用公共 interceptor/mocker 插件并可访问开发端口。本项目未注册该插件。 | Vitest / mocker 4.1.12；FIXED | 未配置受影响功能；传递依赖仍精确升级，无遗留已知公告。 |
| [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) / CVE-2026-112950（Moderate） | 上述插件在 Windows 下接受反斜杠 redirect，绕过目录允许列表。jsdom 测试和本地消费者不注册该公共入口。 | Vitest / mocker 4.1.12；FIXED | 未在 Windows 重放越界读取；依据官方补丁及安装树确认。 |

Node `22.23.3`、npm `11.11.0` 下重新安装锁文件；`npm ls` 确认 Vite 8.1.6
唯一实例，Vitest/mocker 均为 4.1.12。完整审计结果为 **0 漏洞**。
这是当前注册表公告范围的工程结果，不是未来漏洞、医学或依赖许可的保证；
Remotion 等原有许可审读仍按既有权利矩阵处理。

## 两条 Reviewer 讨论

`src/main.jsx` 的 `closeCase()` 已在清除选择前保留所属分类；保留该修复。
但本轮真实 Chromium 在 390×900 复现了另一缺陷：恢复目标的上下边界为
998.125 / 1059.125，虽然仍挂载并可聚焦，却完全位于视口外。现于原有
post-render RAF 中先 `scrollIntoView({ block: 'center' })`，再恢复焦点；
没有改写分类逻辑或引入新的状态机制。
新增桌面/移动 UI 测试覆盖关联入口打开非默认分类、返回后保持挂载/可见/可操作、
分类 `aria-expanded`、键盘再次打开及 Prompt 的 Tab / Shift+Tab / Escape。
真实浏览器进一步检查焦点元素处于视口内，而不只检查 `document.activeElement`。

`src/data.js` 确实直接消费新 `knowledge.json`，profile overlay 也会进入本地预览。
`adoption=legacy` 不能证明内容已获公开批准。现有 `check:publication` 无条件拒绝
尚未绑定审批的页面与 JS、358 份 Markdown、358 份 Prompt、全局/模块指南、
Skill、llms.txt 及 manifests；`build:release` 先执行此检查。
Pages main push/manual 路径在上传前无条件执行门禁，部署依赖该验证成功；
main 晋级 PR 另有 `Publication approval`。保留现有门禁实现。

新增负向测试实际启动 CLI 和 npm release 命令，证明伪造锁内批准字段、
虚构具名审批模板、环境变量、main push/manual 事件都不能放行；内容漂移或
T02 adoption 被改也会 fail closed。隔离副本执行 release 后没有生成 dist、
Markdown、Prompt、Skill、Agent 或 llms 输出。没有通过跳过门禁使测试通过。
两条讨论继续留待 Reviewer 独立确认。

## 数据仓配对与发布边界

数据仓 dev 已重新核实为 `c8e9c57e120515d7846dff90d2127896ec6e2c20`。
[PR #3](https://github.com/y4ho0/symgene-data-pipeline/pull/3) 已合并为
`4555344860228c086dbe3e51e608b928b2f9b29b`；
[PR #4](https://github.com/y4ho0/symgene-data-pipeline/pull/4) 已合并为上述 dev 提交。
网站内容锁仍为 `local-e2c3a7dc114ec2ae063b`，共同摘要为
`e2c3a7dc114ec2ae063b32bc7a811d23c19840291db5c4ae4521bc7cc8090489`。
逐文件配对和交接状态详见 [跨仓接续](local-github-sync.md)。
工程合并不解除医学、公众表达、隐私或来源再发布审读，也不授权生产采用。

## 验证记录

使用 `.nvmrc` 指定的 Node 22.23.3 和锁文件，测试统计如下。Content integration
与全量单元有重叠，不能将两行相加作为独立用例总数。

| 检查 | 实测结果 |
| --- | --- |
| `npm ci` | PASS；精确安装锁定依赖 |
| `npm run verify` | PASS；415 单元、37 UI，0 FAIL / 0 SKIPPED；数据和链接校验、构建、产物检查通过 |
| 构建 / 内容一致性 | PASS；114 药物、122 疾病、122 案例、4 资源；358 材料/Prompt 同源生成；731 文本产物无私有/本地引用 |
| T02 Content integration | PASS；`check:split` 和 `node --test tests/storage.test.mjs tests/content-*.test.mjs`，197/197，0 FAIL / 0 SKIPPED；20 受保护路径未改变 |
| 发布负向测试 | PASS；5/5，包含真实 CLI、真实 release 入口、伪造审批和损坏内容拒绝 |
| `check:publication` / `build:release` | EXPECTED BLOCKED；实际命令均退出 1，`LEGACY_PUBLICATION_APPROVAL_NOT_BOUND` |
| 主应用 Playwright / Chromium | PASS；390 / 768 / 1366 / 1920 × 900，20 组检查、44 截图；药物、疾病、案例、关联、搜索、地图、Prompt 复制调用/Markdown 实际下载、键盘与 v4 保留；0 page errors |
| T02 合成消费者真实浏览器 | PASS；40 checks，390 / 768 / 1024 / 1366 / 1920；v4 覆盖、自定义案例、tombstone、备份保留，0 外部请求 / 页面与控制台错误 |
| T02 签名消费者真实浏览器 | PASS（顺序重跑）；30 checks、8 drills，撤稿/依赖隐藏/回滚/备份恢复、checkpoint 故障、服务重启、签名过期恢复和紧急关闭；0 页面错误 / 外部请求，全部网络响应 no-store |
| 内容恢复 | PASS；真实 SIGKILL 终止第 4 次写入，混合内容拒绝后隔离并恢复 19 文件与精确锁；不是断电/原子性保证 |
| `git diff --check` | PASS |
| `npm audit` / `npm audit --omit=dev` | PASS；两者均 0 漏洞 |

浏览器为 Chromium `151.0.7922.34`、Playwright `1.62.1`，使用全新独立上下文和
虚构 storage 数据。主应用运行 reduced motion；系统剪贴板未验证，复制测试使用
浏览器 Clipboard API 桩。已抽样目视检查 390 案例和 768 中国地图截图；本轮
没有声称完成 Safari/Firefox、真实手机、读屏器或临床内容验收。
构建保留既有 >500 kB chunk 警告，没有降低阈值或混入拆包重构。

初次失败如实保留：

1. 新增桌面键盘测试最初错误假设从索引 Enter 后会移动到返回按钮；实际桌面保持
   索引焦点。测试改为验证 Tab 可到达详情；移动端仍断言自动聚焦。最终全套 37 UI 通过。
2. 新浏览器断言发现真实移动端屏幕外焦点。首次改为 nearest 滚动后仍有 0.125 px
   下边界裁切；最终用 center 定位，保持完整视口断言，四种宽度全部通过。
3. 同时启动两个 T02 Vite 消费者时，签名消费者曾在 React 挂载和 snapshot 请求前
   超时。相同实现及断言顺序重跑通过全部 30 checks / 8 drills；共享优化缓存启动
   竞争是推测，未证明根因。并发启动可靠性未获本次验收，正常演练按顺序执行。

本次没有删除、跳过原有测试或降低断言。定向测试曾按名称过滤其他用例，最终
完整 verify 已覆盖全部用例。GitHub 普通 dev PR 的 `Branch policy`、
`Publication approval`、原 `t02-engineering` 条件不匹配时应记 SKIPPED，
不能写成生产晋级或正式 T02 门禁通过；本 PR 的 Verify / Content integration
以最终 source HEAD 的实际检查为准。

工程整改完成后建议重新请求独立 Reviewer 审核。仍须由有写权限的 Reviewer
正式批准并确认两条讨论后，维护者才能判断 dev 合并条件满足；本次不代为批准或
解决讨论。正式公开仍须绑定实际输出的医学、公众表达、隐私和来源使用/再发布
审读，及既有 A2、G2–G5 的相关正式验收与发布授权。门禁继续阻断。
