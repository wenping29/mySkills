---
name: "code-quality"
description: "六段串联代码质量工作流：深度代码分析（DDD 模式识别）、git 历史技术债与反模式审计、SOLID/Clean Code 评审、重构模式选型、模块化架构设计、行为等价代码简化；另含两个轻量入口：流程内快速审计、小步安全重构。当用户要求重构、简化、清理代码、代码评审、DDD 分析、架构设计、技术债评估、快速审计、快审、小步重构，或提到 refactor/clean code/SOLID/DDD/technical debt/quick audit/quick refactor 时触发。"
---

# Code Quality — 代码质量六步工作流

整合代码分析、技术债审计、整洁代码原则、重构手法、架构设计与行为等价简化，按
**分析 → 技术债 → SOLID 评审 → 重构模式 → 架构设计 → 简化执行** 六步串联。
可根据用户诉求从任意单步切入，不强制全跑。

## 按需加载规则（重要）

本文件只是路由入口，**每个步骤的执行细则放在独立 reference 文件中**。
进入某步骤前必须先 `Read` 对应文件（未读 = 该步细则未生效）：

| 步骤 | 目的 | 执行前必读 |
|------|------|-----------|
| 1 深度代码结构分析 | 架构/流程/数据流/DDD 识别，复杂度热力图 | `references/step1-code-analysis.md` |
| 2 技术债与反模式审计 | git 热点、上帝类、循环依赖，重构优先级 | `references/step2-tech-debt.md` |
| 3 SOLID/Clean Code 评审 | 原则合规报告、坏味道红旗、评审顺序 | `references/step3-solid-review.md` |
| 4 重构模式选型 | 坏味道→手法对照、遗留策略、安全流程 | `references/step4-refactoring-patterns.md` |
| 5 架构与模块化设计 | 模块边界、语言标准、脚手架、安全检查 | `references/step5-architecture-design.md` |
| 6 行为等价简化 | 不改行为前提下的简化执行与等价验证 | `references/step6-simplify.md` |

**轻量入口**（不走六步主线，直接读对应文件执行）：

| 入口 | 分流规则 | 执行前必读 |
|------|---------|-----------|
| 流程内快速审计 | 开发流程中穿插的轻量体检、PR 合并前快审 → quick-audit | `references/quick-audit.md` |
| 小步安全重构 | 批量重命名、替换废弃模式、更新 API 调用等机械式改动 → quick-refactor | `references/quick-refactor.md` |

**分流原则**：用户要"快速审计/快审"用 quick-audit；要"小步重构/重命名/批量替换"用 quick-refactor；需要**深度分析**（全库审计、技术债量化、架构评审）或**系统性重构**（坏味道选型、行为等价简化）时回到上表六步主线。

**二级深入**（细则文件中按需再读）：`references/best-practices.md`、`references/solid.md`、`references/clean-architecture.md`、`references/python-standards.md`、`references/js-ts-standards.md`、`references/scaffolding.md`、`references/security-checklist.md`、`assets/templates/`、`scripts/`。

## 全局门禁

- **行为等价红线**：步骤 4/6 的任何改动不得改变外部行为、输出、副作用或公共接口，除非用户明确要求。
- **测试安全网**：无测试覆盖时先补测试再重构（见步骤 4 安全流程）；改完必须跑测试验证。
- **单步切入也要读细则**：即使用户只要"评审一下这段代码"，也必须先读步骤 3 细则再执行。
- **交付附变更说明**：重构/简化后输出变更清单，说明每处改动对应的坏味道或原则依据。

## 最终交付物

完整六步串联后整合为代码重构包：
1. 代码结构分析报告（复杂度热力图、依赖图、重复代码清单）
2. 技术债务评估报告（债务分布、风险等级、优先级排序）
3. SOLID 合规报告（原则违反清单与修正方向）
4. 重构操作计划（分步清单、模式匹配、风险评估）
5. 目标架构设计（架构图、接口契约、迁移路径）
6. 重构后代码（简化实现与变更日志）

## 使用示例（触发语句）

- "重构这个模块，先评估技术债再给方案"
- "这段代码有 code smell 吗？按 SOLID 评审一下"
- "分析这个代码库，识别 DDD 聚合根和限界上下文"
- "simplify 这个文件，不要改变行为"
- "clean up 这个遗留函数：提取方法、加卫语句"
- "帮我设计新服务的架构，输出目录结构和 ARCHITECTURE.md"
- "用 git 历史找出这个项目腐化最严重的文件"

## 边界说明

- **端到端交付类编程任务**（需求 → 实现 → 测试 → 部署的完整开发流程）请使用 **dev-expert**
- **二进制/发布产物逆向分析**（反编译、协议还原、资源提取）请使用 **reverse-engineer-anything**
- **自动化测试专项**（E2E/API/QA 计划）请使用 **tech-test-automation**
- 本 skill 聚焦代码质量：分析、审计、评审、重构、架构设计与简化，不负责构建/部署/发布流水线
