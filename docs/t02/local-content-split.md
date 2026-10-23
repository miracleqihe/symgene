# 本机内容分仓接入

网站在最新已合入的 T02 代码上，保留本机药物、疾病、案例及独立 Prompt 的更新。当前原始 seed 的 ID、顺序、文本、搜索输入、存储 schema v4、明确清空值和用户覆盖规则保持。

`legacy-content.lock` 记录来自独立数据工作区的本机迁移快照。`npm run check:legacy-content` 校验当前副本；`npm run build` 在生成材料前执行该门禁。源文件在数据工作区修改，通过受限文件集、完整 SHA-256 和预检导入，不能在网站中另行维护一份内容源。

这不是正式 T02 内容批准。`content-pack.lock` 继续 adoption=legacy，候选 sim-4 仅为合成演练；原认证与撤稿协议、vendor 和既有安全断言不因本机迁移而放宽。

## 本地验证

使用 Node22 执行 `npm ci`、`npm run verify`、`npm run audit:knowledge-coverage -- --require-complete` 和 `git diff --check`。知识覆盖检查只证明规定结构通过，不能证明医学正确或资料充分。

在网站没有同级数据目录的干净临时副本中，再运行构建和材料生成；通过后才算网站独立。页面、Markdown、Prompt、Skill 均使用相同内容与共用准则，禁止回退到旧交接包或把最新内容压平到搜索 seed。

## 旧工具位置

原 `scripts/atlas/` 的35项文件在新数据工作区的同名目录隔离保留。旧网站目录和未提交的机构资料保持原状。网站中的地图展示及既有公开数据不在本轮重写；第三方地图权属仍须审核，旧 Git 历史含资产不能因删除最新文件而认定可以新仓再发布。

## Windows 校验

上游七处测试使用 URL.pathname 作为本地路径，已改为 fileURLToPath。路径安全测试在 Windows 使用实际 junction 重解析点，POSIX 使用普通符号链接；各拒绝断言保留。未改变系统 Developer Mode、提权或放松消费者路径规则。

旧 `scripts/t02/check-repository.mjs` 的路径清单针对原 T02 专项分支，本分支还包括本机内容整合，不能直接将其拒绝范围外路径判成内容损坏，也不能放宽原门禁冒称通过。新分支由独立的本地分仓检查与原合同测试共同验证；未来新 PR 若启用该专项工作流，应明确使用对应范围的门禁。
