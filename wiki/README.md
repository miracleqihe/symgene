# 结构化 Wiki

当前版本将种子词条保存在 src/data.js，浏览器编辑后的副本保存在本地 localStorage（键名：symgene-wiki-data-v1）。

知识模型包含：

- drugs：名称、别名、分类、适用情境、作用、动力学、联用效果、禁忌与来源。
- disorders：名称、分类、介绍、理解方式与来源。
- cases：所属疾病、阶段、摘要、主题标签与来源。
- resources：公开网站与外部资料入口；项目内 PDF 不在此页开放。

后续如需多人协作，可将 src/data.js 的种子数据迁移为 Markdown/JSON 内容目录，再接入版本控制或后端 API；当前的本地编辑模式适合个人学习和公益团队内部整理。
