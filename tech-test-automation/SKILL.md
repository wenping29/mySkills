---
name: tech-test-automation
description: >-
  自动化测试专家包（元 skill）。适用于 TDD 方法论指导、自动生成单元/集成测试、跨语言测试编写与运行、
  Playwright/Cypress E2E 测试编排、REST/GraphQL API 测试自动化、QA 测试计划与覆盖率矩阵生成；
  另含轻量入口：修复既有失败测试（修失败测试 / flaky test）、本地 Web 应用 Playwright 测试（Playwright 本地测试）；
  也适用于用户明确要求调用「自动化测试 / Test Automation」。
  端到端交付类编程任务请用 dev-expert；专项重构请用 code-quality。
version: 1.0.0
metadata:
  author: SkillHub
  package_type: meta-skill
  display_name: 自动化测试
  aliases:
    - 自动化测试
    - 自动化测试专家包
    - 自动化测试技能包
    - Test Automation
    - tech-test-automation
    - test-automation
orchestration:
  children:
    - superpowers-tdd
    - test-case-generator
    - test-patterns
    - e2e-testing-patterns
    - api-test-automation
    - afrexai-qa-test-plan
---

# 自动化测试专家包（元 skill 入口）

本 skill 是一个编排包，本身不承载方法细节。执行测试类任务时：

1. **读取工作流**：`Read` 本目录下 `skillsets/tech-test-automation.md`，按其中六步串联执行：
   TDD 策略 → 测试用例生成 → 跨语言编写与运行 → E2E 编排 → API 测试 → QA 计划与报告。
2. **按需启用子技能**：`skills/` 目录下是 6 个子技能 zip（superpowers-tdd、test-case-generator、
   test-patterns、e2e-testing-patterns、api-test-automation、afrexai-qa-test-plan）。
   需要某个子技能的完整方法时，将其解压到临时目录并阅读其中的 SKILL.md，不要把 zip 内容长期散落到工作区。
3. **交付物**：测试策略文档、可运行测试代码、执行报告与覆盖率数据、QA 测试计划（详见 skillsets 文档「最终输出」）。

## 轻量入口路由

不走六步主线，直接 `Read` 对应 reference 执行：

| 入口 | 分流规则 | 执行前必读 |
|------|---------|-----------|
| 修既有失败测试 | 测试套件已变红、CI 失败、"fix these tests / flaky test" → 诊断-修复循环 | `references/test-fixing.md` |
| 本地 Web 应用 Playwright 测试 | 验证本地 dev server / 静态页面的前端功能、截图、控制台日志 → 黑盒脚本 + 侦察模式 | `references/webapp-testing.md`（配套脚本在 `scripts/webapp/`） |

从零设计测试体系、生成测试用例、E2E/API 编排、QA 计划仍走 skillsets 六步主线。

## 使用示例

- "给这个模块补单元测试，用 pytest" → 步骤 1-3
- "用 Playwright 写登录流程的 E2E" → 步骤 4
- "出一份这个版本的 QA 测试计划和覆盖率矩阵" → 步骤 6
- "重构后测试挂了，帮我修失败测试" → 轻量入口 test-fixing
- "用 Playwright 测一下本地跑起来的页面" → 轻量入口 webapp-testing
