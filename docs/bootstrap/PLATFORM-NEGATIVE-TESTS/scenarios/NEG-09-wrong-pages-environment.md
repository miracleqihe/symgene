# NEG-09 — 错误 Pages environment / ref 必须失败

- 威胁:从非 main ref 触发发布,或让 deploy job 指到不受保护的环境。
- **R1 修正**:旧版把"dispatch 请求被拒绝"当验证目标 —— 但 dispatch 返回 204 只表示 run 已排队,不能证明任何保护。正确验证目标:
  1. 该 dispatch 对应的 **Workflow Run** 必须以 `failure` 结束(github-pages 环境 branch_policy 拒绝非 main ref);
  2. run 内的**失败 Job** 可见(定位到环境门);
  3. 该 SHA 的 **Deployment 记录为空**(`GET /deployments?sha=<head>&environment=github-pages`)。
- PASS = 三者同时成立;run 成功或存在部署 = FAIL;dispatch/查 run 遇到 401/403/404/网络问题 = BLOCKED。
- **安全边界:本用例只能在 `*-sec-lab` 测试仓执行(脚本守卫强制),严禁对生产仓运行 deploy-pages。**
- 前置:测试仓配置与生产同构的 `github-pages` environment + custom branch policy(仅 main)。
- 执行:`scripts/neg-09-wrong-pages-environment.sh`
- 生产侧只读对照:GET /repos/miracleqihe/symgene/environments/github-pages/deployment-branch-policies 应仍只有 main(2026-10-24 盘点值)。
- 状态:**PENDING(lab only)**。
