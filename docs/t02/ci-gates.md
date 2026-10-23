# T02 只读工程门禁

运行 `node scripts/t02/check-repository.mjs`。该脚本要求 Node 22，复用实际 `verifyVendorProvenance`、`readContentLock` 和 `checkContentPack`：核对四份 vendor 文件及其来源摘要、唯一数据仓规范版本、完整候选包、数量下限和地图消费兼容性。生产采用必须保持 `legacy`，候选必须保留本地 simulation 范围。这里没有第二份领域 schema，也不会修改锁、包、审批或生产配置。

依赖门禁核对 lockfile v3、根依赖与 package.json 一致、直接依赖精确版本，以及所有非根包的 npm registry HTTPS 地址、规范 SHA-512/SHA-256 SRI 和非空许可声明。地址不接受凭据、端口、查询串或片段。许可字段存在仅是声明完整性；Remotion 等自定义许可明确标为 `HUMAN_REVIEW_REQUIRED_NOT_APPROVED`，不代表项目已具备许可资格。

Git 检查以已核定基线 `20ec83d9b0bed138299010da6d2cf9c4418f1cfc` 为祖先，限定 T02 内容消费、测试、文档、vendor、锁和本工作流路径。它检查本分支各提交路径、HEAD 快照、暂存 blob、基线后的全部新 blob 版本及当前改动文件。删除或覆盖最新文件不能隐藏本分支早期 blob。二进制/NUL、非法 UTF-8、过大文件、符号链接/子模块、冲突索引、敏感文本和范围外生产路径均拒绝。扫描仅返回安全错误码，不输出原文、凭据值或私人路径；规则扫描并不证明完整匿名化或版权许可。

用户已有的未跟踪 `content-packs/sim-1`、`sim-2` 不读取、不暂存、不删除、不新增忽略规则；一旦被跟踪或暂存，它们会因超出 T02 包路径名单被拒绝。仅有本地 `.git` 标记才使用 Git；损坏标记和浅历史拒绝。无标记归档只扫描固定 T02 目录，绝不继承上级仓历史，历史与推送资格保持未验证。

默认成功结果是 `engineering: PASS`、`pushReady: false`、`PUSH_BLOCKED_AUTHORIZATION`。`--require-push-ready` 始终安全拒绝。本轮没有 Push、PR、合并、部署或生产采用授权；依赖许可声明、离线模拟及 CI 通过都不能补足这些授权，数据仓权属 HOLD 也不会由网站门禁清除。

新增 `T02 verification` 工作流只有 `contents: read`，完整拉取历史并关闭 checkout 凭据留存，依次运行 Node 22、`npm ci`、`npm run verify`、diff 检查和本门禁。Push 仅匹配 `codex/t02-content-contract`；PR 目标为 dev/main 且 job 仅运行于该 T02 head；手动运行仍只验证。没有部署、写权限、密钥输入或生产采用变量。现有 CI 和 Pages 工作流未修改；是否具备远端运行/推送资格须由独立远端只读审计和负责人决定。
