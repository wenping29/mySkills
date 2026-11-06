---
name: "plan-workflow"
description: "规划到实施的三模式工作流：功能规划→实施（把需求拆解为离散任务并经 plan-implementer agent 逐任务执行）、PR 审查意见落地（解析评审反馈、TodoWrite 逐项实现验证、落地后经 pr 命令建 PR）、多方案 ensemble 求解（3 个差异化子代理并行出方案、加权评分选最优）。当用户要求功能规划、feature plan、规划实施方案、落地审查意见、PR 审查落地、address review comments、ensemble、多方案求解、给我几个方案时触发。边界：端到端全栈交付（需求→实现→测试→部署闭环）用 dev-expert；通用 PRD 文档撰写用 prd-writer。"
---

# Plan Workflow — 规划到实施三模式工作流

整合功能规划（plan→implement）、评审意见落地（parse→track→implement→verify）、多方案 ensemble 求解（diversify→parallel→evaluate→select）三条工作流，按用户意图路由到对应模式；一次会话可串联模式（如先 ensemble 定架构，再进入规划→实施）。

## 模式路由（重要）

本文件只是路由入口，**每个模式的执行细则在独立 reference 文件中**。进入某模式前必须先 `Read` 对应文件（未读 = 该模式细则未生效）：

| 模式 | 触发场景 | 执行前必读 | 配套资产 |
|------|----------|-----------|----------|
| 1 功能规划→实施 | 提出新功能/增强/复杂变更，要求先规划再实现 | `references/feature-planning.md` | `agents/plan-implementer.md`（逐任务实施 agent） |
| 2 PR 审查意见落地 | 贴出 reviewer comments / PR 反馈 / "address these comments" | `references/review-implementing.md` | `commands/pr.md`（落地后创建 PR） |
| 3 多方案 ensemble 求解 | 要求给多个方案、比较做法、"best way to..."、多方案求解 | `references/ensemble-solving.md` | `agents/ensemble-orchestrator/AGENT.md`（编排 agent） |

**二级深入**（细则文件中按需再读）：`references/planning-best-practices.md`（任务粒度/描述具体性/完整计划示例与反模式）、`references/diversification-strategies.md`（3 类提示差异化模板）、`references/evaluation-rubrics.md`（评分权重、加权计算与并列处理）。

## 模式判定规则

- 需求是"实现某功能"且规模复杂（多文件/多模块）→ 模式 1；架构选型存在多个合理方案时，可先走模式 3 定方案，再回到模式 1 拆解执行。
- 输入是评审/PR 反馈清单 → 模式 2；不重新规划，直接逐项解析→实现→验证。
- 输入是开放式问题且非确定性操作 → 模式 3；简单查询、单因 bug 修复、文件/git 操作、单一明显解的任务**跳过 ensemble**。
- 意图模糊时先问用户选哪种模式，不擅自路由。

## 全局门禁

- **计划确认门**：模式 1 的计划必须先经用户 review 批准，再派发 plan-implementer；逐任务顺序实施、验证通过才进下一任务。
- **todo 实时跟踪**：模式 2 必须用 TodoWrite；同一时刻只允许一个 `in_progress`；完成一项立即标 `completed`，不批量更新。
- **ensemble 硬约束**：模式 3 必须在单条消息内 spawn 恰好 3 个并行子代理；编排者只调度不亲自解题；输出必须含完整胜出方案、评分表、备选适用场景。
- **歧义先澄清**：反馈项或需求含糊 → 问用户，不臆测；冲突反馈、破坏性变更必须先向用户说明并确认。
- **验证后才交付**：任何模式改完代码须跑相关测试/lint，测试失败修复前不得标记完成；提交走 git-pushing 技能。

## 使用示例（触发语句）

- "帮我规划用户认证功能的实现，然后逐任务实施"
- "feature plan：给现有系统加导出 dashboard"
- "把这些 PR 审查意见逐条落地，然后建一个 PR"
- "address these review comments"
- "这个限流器给我 3 个方案比较一下，选最优"
- "用 ensemble 方式设计这个 API"

## 边界说明

- **端到端全栈交付**（需求→实现→测试→部署→复盘闭环，Java/PHP/C# 等领域开发）请使用 **dev-expert**
- **通用 PRD 撰写**（产品需求文档创作与评审）请使用 **prd-writer**
- 本 skill 聚焦工程规划与落地工作流；不负责提交/推送流水线（用 git-pushing）、代码质量重构专项（用 code-quality）
