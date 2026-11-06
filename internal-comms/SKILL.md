---
name: internal-comms
description: 一组资源，用于按照我所在公司偏好的格式撰写各类内部沟通文档（internal communications）。每当被要求撰写某种内部沟通内容时——如 status reports、leadership updates、3P updates、公司 newsletter、FAQ 解答、incident reports、项目更新等——Claude 都应使用本技能。
license: Complete terms in LICENSE.txt
---

## 何时使用本技能
撰写内部沟通文档时，将本技能用于：
- 3P updates（Progress、Plans、Problems，即进展/计划/问题）
- 公司 newsletter（内部通讯）
- FAQ 解答
- status reports（状态报告）
- leadership updates（管理层更新）
- 项目更新
- incident reports（事故报告）

## 如何使用本技能

撰写任何内部沟通文档时：

1. **从请求中识别沟通类型**
2. **从 `examples/` 目录加载相应的指南文件**：
    - `examples/3p-updates.md` - 用于 Progress/Plans/Problems 团队更新
    - `examples/company-newsletter.md` - 用于全公司 newsletter
    - `examples/faq-answers.md` - 用于解答常见问题
    - `examples/general-comms.md` - 用于其他不明确匹配上述任一类型的情况
3. **遵循该文件中的具体指示**，包括格式、语气和内容收集

如果沟通类型与任何现有指南都不匹配，询问澄清或关于期望格式的更多背景。

## 关键词
3P updates, company newsletter, company comms, weekly update, faqs, common questions, updates, internal comms
