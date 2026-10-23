# PR #34评审修复与验收入口

本说明回应y4ho0在PR #34的总体意见及案例焦点逐行意见。对应数据仓PR #4修复候选材料重跑丢失人工记录和Markdown逐点来源问题，已于2026-10-23合入dev；PR #3亦已合入。这些是可供复核的工程改动，不是医学、权利或公众表达审批。

## 生产公开范围与阻断

当前本地预览会显示114药物、122疾病、122教学案例的有效正文、公众解释和关联内容。构建还会生成358份词条Markdown、358份词条Prompt、全局及六模块指南、Skill（共724份Markdown）、llms.txt和两份目录manifest；正文也在首页及详情的JavaScript包内。仅保留content-pack.lock的adoption=legacy，确实不能阻止这些内容直接公开。

本轮没有取得绑定当前输出的独立医学、公众表达和权利批准记录，不能把用户手写、来源可定位或结构通过转换成专业批准。358项接续槽及四个高风险词条的原稿／有效正文／逐点来源对照均保留具名审读空位。中国地区元数据检查同样不证明具体产品结论正确。

新增`npm run check:publication`对当前legacy页面、打包正文和全部静态讲解材料返回BLOCKED，且不能用环境变量、模板或JSON里的approved=true放行。`npm run build:release`先执行该检查。GitHub Pages的push和手动路径在验证、上传dist之前无条件执行它；main晋级另有Publication approval检查。未通过时不上传或部署新站点，原已部署站点不受本轮操作影响。普通`npm run build`仍用于隔离的本地预览和工程验收。

解除阻断须另建受审PR，为实际legacy输出建立可认证且绑定精确版本的审批路径，或移除这些待审输出。不能只改一个状态值，也不能假定T02签名包已审核就自动覆盖另一路legacy正文。当前未合并main、未部署，G3/G4/G5不因此通过。

## 工程修复

- 案例从关联链接打开非默认分类后，关闭详情先保留该分类展开，再恢复仍挂载的案例按钮焦点；本轮再修复移动端返回目标仍在屏幕外的问题，先将目标滚入可见区域，再聚焦。桌面/移动 UI 及真实 Chromium 均增加 Tab / Shift+Tab / Escape 与再次打开回归。
- 数据侧初次生成与重跑分开：人工coverage、claim_ids、冲突、审核结论、批注及旧候选裁定保留；机器命中放入retrieval_generated和candidate_selection命名空间，不作为人工决定。
- 教学Markdown把实际可归属的公开来源放在具体语义点后，兼容fieldAmendments；未获来源的邻近原稿不继承整个字段的引用。真实西酞普兰和氟西汀修订用于回归；真实包暂无非空retainedEvidence，保留点行为用明确虚构fixture验证。
- 未改医学正文、搜索权重、storage v4、签名消费和撤稿隔离逻辑。

## 跨仓和CI的精确口径

2026-10-23重新确认数据仓dev为`c8e9c57e120515d7846dff90d2127896ec6e2c20`，PR #3合并点为`4555344860228c086dbe3e51e608b928b2f9b29b`，PR #4合并点为当前dev。网站本轮开工主题基线为`868b09399e7c5417b60d96b8210d1c536338cab4`，PR #34仍为OPEN、非Draft。

19文件与已合并数据仓dev逐字节一致，共同快照digest仍为`e2c3a7dc114ec2ae063b32bc7a811d23c19840291db5c4ae4521bc7cc8090489`，版本仍为`local-e2c3a7dc114ec2ae063b`。本轮未重新导入、改写医学正文或更改两份内容锁；详细清单见[配对核验](local-data-handoff.md)。实际最新网站HEAD及检查链接以PR主题SHA和CI为准，复核记录须同时写两仓HEAD、digest、浏览器artifact源HEAD和checkout HEAD，不能把PR合成merge-ref当成主题HEAD。

此前T02 verification中的t02-engineering只匹配原三个专项分支，#34不满足条件，SKIPPED符合原触发规则，不能写作通过。原工作流不放宽，新增明确针对本分支的Content integration任务，执行分仓完整性、storage v4、签名消费、撤稿与隔离回归。普通Verify仍执行全部单元、UI、构建和私有引用检查。

## 可复现界面与内容对照

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm run review:browser
```

Linux需安装覆盖汉字的字体，例如fonts-noto-cjk；缺字环境不得据截图宣告中文通过。Windows可用REVIEW_CHROMIUM_EXECUTABLE指定已安装的Chromium，路径只写操作者环境，不写入仓库。

证据输出到被忽略的work/review-evidence：index.html、result.json、四种药物原稿与有效正文对照、截图和实际下载的Markdown。GitHub普通CI会生成并上传同样的content-review-<source HEAD> artifact，保留14天；外部评审者可下载打开index.html。原截图与运行日志不提交Git。

覆盖390、768、1366、1920宽度，西酞普兰、艾司西酞普兰、氯氮平、锂盐的五标签、警示、特殊人群、监测和长文显示；全局及词条Prompt复制调用与真实Markdown下载；疾病／虚构案例／关联跳转、案例返回焦点、搜索，以及原数据图谱和中国地图。复制调用使用浏览器Clipboard API桩记录，未把它宣称为原生系统剪贴板验收。reduced-motion、字体回退和实际浏览器版本写进报告。

2026-10-23最终依赖安全审计、最小补丁升级、负向发布测试与完整验证口径见[最终工程复核](local-final-engineering.md)；历史测试和artifact不能代替本次主题提交的验证。

对照包只复制项目原稿和有效展示文字；私有书籍段落不进入证据，私有位置保留在来源profile。四个条目仍需有资质的实际审读者逐点核对原始来源、地区/产品版本、修改理由，并填写具名决定，不能由截图或自动报告替代。

## HOLD与恢复

[35项HOLD清单](local-atlas-hold-inventory.json)记录相对文件名、字节数和SHA-256；真实保管位置由Git外资源索引将local-hold://atlas-tools映射到本机目录，不公开私人路径。清单不携带代码、坐标或裁定内容。35项均已在本机与至少一个保留原目录核对，另复制到新临时目录重新逐文件核验；这属于本机操作者证据，未声称外部评审者已经核过原件。

数据仓scripts/reference/verify_hold.py支持先校验全部文件再恢复到不存在的新目录，拒绝篡改、符号链接和覆盖已有目标；不执行HOLD工具，不赋予采集或再发布资格。需原件复核时单独授予保管目录访问，不能将整个workspace上传。

`npm run review:recovery`在一次性目录真实终止第4次写入后的子进程，确认混合版本被拒绝、普通导入拒绝覆盖；保留中断目录后，在新目录从已验证快照重建，逐字节恢复19文件、版本锁及原T02采用锁。浏览器验收另用虚构v4数据验证本地覆盖、自定义条目、tombstone、备份与隔离命名空间在重载后保留。该演练不等于断电持久性或多文件原子性承诺。

## 工程集成与正式发布分开

工程修复、实际CI/界面artifact、恢复证据齐备后重新请y4ho0评估dev合并；COMMENTED不是APPROVED。正式公开仍缺358项绑定当前版本的医学、公众表达、权利决定及资料再发布依据。T01.2 A2、G2真实两报告、G3/G4/G5维持各自状态，不借工程合并签收。
