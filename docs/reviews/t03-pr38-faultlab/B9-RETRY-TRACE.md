# B9-RETRY-TRACE — 删除重试机制的直接证据与边界(R1.1-B)

机器可读时序:`evidence/B9-RETRY-TRACE.json`。所有结论分级:CONFIRMED / PARTIAL / UNVERIFIED。

## 0. 错误的性质(禁止混淆声明)

每个 drill 中的 EPERM 都来自 **darwin 内核**对带 user-immutable 旗标(`chflags uchg`)的 APFS 文件拒绝 `unlink(2)`——**真实文件系统失败**,不是 JS 层模拟。受控的只是旗标时机,绝非错误本身。

## 1. 跟踪能力探测(先声明做不到什么)

| 工具 | 结果 |
| --- | --- |
| `fs_usage` | 需要 root(实测拒绝) |
| `dtrace`/`dtruss` | 需要特权(实测拒绝) |
| `sudo` | 无免密 sudo |

**结论:本环境无法逐次观测系统调用。** 按任务回退条款,机制级验证落在 Node `rm()` 公开契约层(以秒级时序余量消除歧义);产品路径的"第一次尝试顺序"保持 PARTIAL。

## 2. EXP-1:rm() 契约层的直接重试证明 —— CONFIRMED

`fs.promises.rm(dir, {recursive, force, maxRetries: 5, retryDelay: 1000})`,`deps/locked.js` 从 t=0 带 uchg,旗标 +3.5s 清除。线性退避下尝试点 ≈0/1/3/6/10/15s:

| 轮 | 判定 | 总耗时 | 旗标清除时刻 | 目录删除 |
| --- | --- | --- | --- | --- |
| 1 | RM-RETRIES-PROVEN | 6008ms | 3515ms | 是 |
| 2 | RM-RETRIES-PROVEN | 6103ms | 3515ms | 是 |
| 3 | RM-RETRIES-PROVEN | 6109ms | 3515ms | 是 |

**推理链**:rm 在 ~6s 成功,晚于清除 2.5s——0/1/3s 的前几次尝试必然在旗标仍生效时失败,清除后至少又尝试了一次。于是同时证明:(a) 第一次尝试确实触达保护并失败;(b) Node 的删除机制确实再次尝试。秒级余量排除了"drain 噪声"解释。本轮以异步 `fs.promises.rm` 执行(初版用同步 rmSync 阻塞事件循环、清除定时器永不触发,其 3 轮 THREW 证据已废弃并记录)。

## 3. EXP-2:契约层耗尽的意外观测 —— UNVERIFIED(如实记录)

旗标全程保持的同款 rm,45s 有界观测:**3/3 轮 45s 内未拒绝**(RM-EXHAUSTION-UNSETTLED-OBSERVED)。即"线性退避 ~15s 耗尽"的文档化直觉在本机(darwin/Node v22.23.4)该参数下未复现,而重试循环确实在运行(EXP-1 于窗口中段成功)。**这是平台行为观测,与 PR #38 无关,不予解释、不强行归因。** 耗尽证据改由产品路径承担(§4)。

## 4. EXP-3/EXP-4:B9R2b 的 6.7s 完全归因 —— CONFIRMED

Review 问:永久 EPERM 轮的 closeMs ≈6.7–6.9s 中,drain、Vite close、删除各占多少?是否真是重试耗尽?

| 测量 | closeMs / 耗时 | 条件 |
| --- | --- | --- |
| EXP-3 对照(无旗标,产品 close) | **3 / 3 / 4 ms** | include 触发优化,drain 无待务 |
| EXP-3 加旗标(产品 close) | 6776 / 6805 / 6730 ms | 唯一差异 = uchg 旗标 |
| EXP-4 单元 rm(5,10)(产品精确参数) | 6687 / 6721 / 6735 ms | EPERM 拒绝 |
| 实验室 B9R2b(浏览器路径) | 6730–6805 ms(此前 R1) | EPERM、cleanupIncomplete=false |
| 公开驱动 b9r2b | 6803 ms | 独立检出重跑 |

**归因:~6.7s 全部是 rm() 的重试/退避窗口**(单元测量与产品路径在 1% 内吻合;该路径下 drain + Vite close 合计 ~3ms)。窗口有界(~6.8s ≪ 15s 期限),结局是可见的 EPERM 拒绝 + 缓存保留 + cleanupIncomplete=false——不存在其他等待或超时路径。附注:按文档"线性退避"的朴素读法在 retryDelay:10 下应 ~150ms,实测 ~6.7s;这是 Node/darwin 实现行为的如实记录,不是 #38 缺陷(产品契约全部成立)。

## 5. 对 Review 五项主张的分级判定

| 主张 | 判定 | 依据 |
| --- | --- | --- |
| 1. rm 第一次实际触达受保护文件 | **CONFIRMED(rm 契约层)** | EXP-1:0/1/3s 的尝试在旗标生效期失败 |
| 2. 第一次删除真实返回 EPERM | **CONFIRMED** | 内核对 uchg 文件的真实拒绝;非模拟 |
| 3. Node 删除机制确实再次尝试 | **CONFIRMED(rm 契约层)** | EXP-1:清除后 ~2.5s 仍成功 |
| 4. 权限解除发生在首次失败后、最终成功前 | **CONFIRMED(rm 契约层)** | EXP-1 时序(3.5s 介于 0s 失败与 6s 成功之间) |
| 5. close 成功解析、缓存完全删除(产品路径) | **CONFIRMED(结局级)** | B9R2a 3/3 + 公开驱动 b9r2a(106ms、缓存全删) |
| 产品路径的首次尝试顺序 | **PARTIAL/UNVERIFIED** | 需系统调用跟踪,环境不可得;以结局级契约代替 |

## 6. 与已发布证据的关系

- 已发布的 B9R2a 证据(closeMs 107–115ms、缓存全删)保持有效,但其解释**降级**:它证明端到端结局,不再单独声称"closeMs>80ms 证明重试";重试的直接证明由 EXP-1 承担。
- B9R2b 的 6.7s 由本 TRACE 完成归因,推翻"可能是其他等待路径"的疑虑。
- 全部新实验独立于产品代码(仅调用其公开 API),驱动已公开(`repro/b9-delete-failure-drill.mjs`,预检锁定 commit + 模块 SHA-256,实测 ALL-DRILLS-PASS)。
