# 远程社交证据审阅简明说明

状态：**LOCAL REVIEW ONLY / NOT APPROVED FOR PUBLICATION**

本说明供获得项目授权的远程成员使用。Git 分支只提供审阅工具；包含社交平台文本的
队列必须通过团队批准的加密渠道单独传递，不能提交到 GitHub。

## 1. 开始前

审阅者需要：

- 一台仅本人使用的电脑；
- Node.js 22；
- `miracleqihe/symgene` 仓库的读取权限；
- 协调人单独发送的加密审阅包和解密信息。

审阅期间不要截图、复制原文、联系原作者、上传在线 AI，或把数据放入群文件、公开
网盘和个人笔记。审阅者代号不能使用真实姓名。

## 2. 获取审阅工具

首次获取仓库：

```bash
git clone https://github.com/miracleqihe/symgene.git
cd symgene
git fetch origin
git switch --track origin/codex/social-evidence-pilot
node --version
```

`node --version` 应显示 `v22` 开头。已经有仓库且本地已有该分支的成员执行：

```bash
git fetch origin
git switch codex/social-evidence-pilot
git pull --ff-only
```

如果已有仓库但本地尚无该分支，则在 `git fetch origin` 后执行：

```bash
git switch --track origin/codex/social-evidence-pilot
```

不要修改或提交这个分支，也不要运行抓取程序。

## 3. 放置审阅包

解密后应得到：

- `review-queue-private.json`：包含遮盖后但仍然敏感的待审文本；
- `review-manifest.json`：包含队列编号、数量和校验值，不包含帖子正文。

把两个文件放入仓库内以下目录；目录不存在时可以手动创建：

```text
work/social-evidence-pilot/2026-09-01/
```

`work/` 已被 Git 忽略。不要用 `git add -f` 绕过忽略规则。开始审阅前，将队列文件的
SHA-256 与 `review-manifest.json` 中的 `queueSha256` 对照：

```bash
# macOS
shasum -a 256 work/social-evidence-pilot/2026-09-01/review-queue-private.json

# Linux
sha256sum work/social-evidence-pilot/2026-09-01/review-queue-private.json
```

校验值不一致时停止审阅并联系协调人，不要自行修复文件。

## 4. 启动页面

在仓库根目录运行：

```bash
node scripts/research/serve-review-pilot.mjs \
  --queue work/social-evidence-pilot/2026-09-01/review-queue-private.json \
  --port 43219
```

浏览器打开：

```text
http://127.0.0.1:43219/
```

该地址只在审阅者自己的电脑上可用，不会自动上传数据。终端窗口需要在审阅期间保持
运行。端口被占用时，可以把命令和网址中的 `43219` 同时改成 `43220`。

## 5. 如何标注

两名审阅者必须独立完成同一队列，不查看或讨论对方的中间标签。

1. 填写非真实姓名代号，例如 `reviewer-a`。
2. 判断医院归因是否正确。
3. 判断内容是否为本人或陪诊服务经历。
4. 选择文本实际支持的服务维度。
5. 检查是否仍含人名、账号、联系方式或精确就诊轨迹。
6. 只有机构正确、属于服务经历、未发现残留标识符且不涉及医学判断时，才选择
   “可进入候选”。

遇到不明确的内容应选择“不确定”或“待复核”，不要猜测。出现残留姓名、精确轨迹、
诊断、处方、疗效、危机披露或其他敏感内容时，应标记隐私问题并排除聚合候选。
完整字段定义见 `docs/social-evidence-pilot.md`。

## 6. 保存与返回结果

标签只保存在当前页面内存中，关闭或刷新页面前必须点击“导出当前标签”。建议每完成
一小批就导出一次；重新打开页面后，可以使用“导入标签继续”恢复进度。

导出的文件名类似：

```text
social-evidence-<queue-id>-reviewer-a-labels.json
```

标签文件不包含帖子正文，但仍不得提交到 Git。通过协调人指定的安全渠道传回，并在
协调人确认收到且校验无误后，使用系统废纸篓删除解密后的队列、标签副本和临时文件。

## 7. 完成标准

审阅者交付前确认：

- 页面显示全部记录已完成；
- 代号不是本人真实姓名；
- 导出的 `queueId` 与清单一致；
- 没有把原文复制到备注；
- 没有提交、上传或转发 `work/` 中的文件。

协调人收到两份独立标签后，才可以运行一致性分析。即使两人完全一致，结果也不代表
数据真实、有代表性或已经获得发布批准。

## 8. 协调人发送清单

协调人需要分别提供：

1. GitHub 分支地址；
2. 加密审阅包；
3. 解密信息；
4. 审阅截止时间和结果返回渠道；
5. 数据删除时间。

加密审阅包和解密信息不要通过同一个渠道发送。未经明确授权，不要把审阅页面部署到
公网，也不要为方便访问而开放本机端口。
