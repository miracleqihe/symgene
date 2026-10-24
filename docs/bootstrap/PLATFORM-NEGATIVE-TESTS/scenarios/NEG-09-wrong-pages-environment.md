# NEG-09 — 错误 Pages environment / ref 必须被拒绝

- 威胁:从非 main ref 触发发布,或让 deploy job 指到不受保护的环境。
- **安全边界:本用例只能在 `*-sec-lab` 测试仓执行(脚本守卫强制),严禁对生产仓运行 deploy-pages。**
- 前置:测试仓配置与生产同构的 `github-pages` environment + custom branch policy(仅 main)。
- 执行:`scripts/neg-09-wrong-pages-environment.sh`
- 步骤:dispatch deploy-pages.yml 并指定 ref=<非 main 分支>。
- 预期平台响应:运行在环境门处失败:"Branch '<ref>' is not allowed to deploy to github-pages due to environment protection rules."(HTTP 422 或 run conclusion=failure,以实测为准)。
- 生产侧只读对照:GET /repos/miracleqihe/symgene/environments/github-pages/deployment-branch-policies 应仍只有 main(2026-10-24 盘点值)。
- 状态:**PENDING(lab only)**。
