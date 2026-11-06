---
name: "project-toolkit"
description: "项目工具三模式工作流：仓库文档化（为代码库生成架构/关键组件/数据流/开发指南文档，输出 docs/ Markdown 体系）、对话历史分析（本地解析对话历史 jsonl，识别使用模式、重复错误与自动化机会，附 scripts/analyze_history.py 分析脚本）、新项目脚手架（从零搭建或改进项目结构、Git 配置、文档、测试、代码质量工具、CI/CD）。当用户要求仓库文档、代码库文档化、document this codebase、上手文档、对话分析、conversation analysis、分析我的历史、项目脚手架、bootstrap、初始化项目时触发。边界：技术教程撰写用 tech-tutorial-writer；HTML 可视化文档/图表用 visual-documentation。"
---

# Project Toolkit — 项目工具三模式工作流

整合仓库文档化（codebase-documenter）、对话历史分析（conversation-analyzer）、新项目脚手架（project-bootstrapper）三条工作流，按用户意图路由到对应模式。

## 模式路由（重要）

本文件只是路由入口，**每个模式的执行细则在独立 reference 文件中**。进入某模式前必须先 `Read` 对应文件（未读 = 该模式细则未生效）：

| 模式 | 触发场景 | 执行前必读 | 配套资产 |
|------|----------|-----------|----------|
| 1 仓库文档化 | "explain this codebase"、生成架构/上手/开发文档 | `references/codebase-documenter.md` | — |
| 2 对话历史分析 | "analyze my conversations"、复盘使用模式与低效点 | `references/conversation-analyzer.md` | `scripts/analyze_history.py`（本地分析脚本） |
| 3 新项目脚手架 | "set up a new project"、补全最佳实践/工具链/CI | `references/project-bootstrapper.md` | — |

## 模式判定规则

- 对象是**已有代码仓库**且诉求是"读懂/写文档" → 模式 1。
- 对象是**对话/使用历史**（`~/.claude/history.jsonl` 等本地记录）→ 模式 2，优先跑 `scripts/analyze_history.py` 再解读。
- 对象是**新项目或项目工程化缺失**（无 gitignore/测试/CI/文档）→ 模式 3。
- 模式 3 完成后可衔接模式 1 为脚手架产物生成交付文档。
- 意图模糊时先问用户，不擅自路由。

## 脚本用法（模式 2）

```bash
# 在本技能根目录（project-toolkit/）执行
python3 scripts/analyze_history.py
```

- 读取 `~/.claude/history.jsonl`，默认分析最近 200 条对话。
- 输出 `conversation_analysis.txt`（模式明细）与 `recommendations.txt`（改进建议）到当前目录。
- 全部分析在本地完成，对话历史不出用户机器。

## 全局门禁

- **只读优先**：模式 1/2 不修改目标仓库代码；文档与报告只写入 `docs/` 或用户指定位置。
- **先勘察后落笔**：模式 1 必须先 Explore/Glob/Grep/Read 实际代码再写文档，文档须含具体 file:line 引用，禁止臆造未验证的结构。
- **脚手架先方案后执行**：模式 3 必须先问清项目类型/语言/协作方式/范围，展示计划经用户批准后再逐区实施；已有项目改动前必读原文件，最小局部 diff。
- **隐私红线**：模式 2 报告不落敏感内容（凭证、隐私数据）；脚本失败时降级为人工抽样分析并向用户说明。
- **交付自验**：文档须可让新开发者仅凭文档完成上手；脚手架交付附文件清单与验证结果。

## 使用示例（触发语句）

- "给这个仓库写一套架构文档和 onboarding 指南"
- "document this codebase，标准深度就行"
- "分析一下我最近的对话历史，找出重复踩的坑"
- "analyze my conversations，给我改进工作流的建议"
- "帮我初始化一个新 Python CLI 项目，带测试、lint 和 CI"
- "bootstrap 这个仓库，补齐 .gitignore 和 CONTRIBUTING"

## 边界说明

- **技术教程撰写**（面向学习的教程/讲解文章）请使用 **tech-tutorial-writer**
- **HTML 可视化文档/图表交付**（架构图、流程图、仪表盘网页）请使用 **visual-documentation**
- 本 skill 聚焦工程配套三件事：仓库文档化、对话历史分析、项目脚手架；不负责功能规划与实施（用 plan-workflow）、代码质量重构专项（用 code-quality）
