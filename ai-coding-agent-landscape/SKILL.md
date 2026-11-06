---
name: ai-coding-agent-landscape
description: '分析主流 AI 编程与办公 Agent 产品并做选型对比。覆盖 Qoder（qorder）、Trae（trea）、ZCode、Claude Code、opencode、GitHub Copilot、Cline、Qwen Code、WorkBuddy。用于竞品拆解、能力矩阵、国内 vs 海外对比、harness / 权限 / 内容层模式提炼、企业选型与产品策略。输出带核验日期和证据等级的对比报告，或更新产品档案。'
---

# AI Coding Agent Landscape

面向“产品分析 + 选型 + 模式提炼”的技能。不是安装教程，而是把主流 Agent 放到同一张可比较的图上。

## 适用场景

- 对比 Qoder、Trae、ZCode、Claude Code、opencode、GitHub Copilot、Cline、Qwen Code、WorkBuddy
- 做竞品分析、选型建议、产品策略、harness 设计参考
- 需要国内 vs 海外、开源 vs 闭源、IDE vs CLI vs 平台的分层判断
- 从产品功能反推可复用的 Agent 设计模式

## 不适用场景

- 只要某个工具的具体安装或排错步骤，优先查官方文档
- 要求实时价格承诺，价格变化快，只能给量级并标注核验日期
- 把 WorkBuddy 与编程 Agent 直接横比而不先分层

## 核心原则

1. 先分层再比较：编程 Agent、通用办公 Agent、底层框架不是同一类产品。
2. 区分事实与厂商口径：价格、上下文长度、并发数、积分规则标注来源与日期。
3. 所有结论带日期：默认 `2026-11`，过期后先更新再引用。
4. 只比四件事：入口、harness、内容层、信任（权限 / 治理）。
5. 不堆功能清单：每个产品只保留“差异点 + 局限 + 适合谁”。
6. 不把“支持”当成“做好”：功能列表和实际长任务稳定性分开评价。

## 工作流

1. 明确目标：选型、竞品分析、产品策略，还是 harness 设计。
2. 分层：Agentic IDE、CLI / 桌面、平台生态、通用办公、开源 / BYOK。
3. 读 `references/product-profiles.md`，按统一字段补全产品档案。
4. 用 `references/comparison-matrix.md` 生成矩阵、四象限、国内外差异、选型树。
5. 用 `references/extraction-patterns.md` 提炼模式、harness 清单、评估 rubric。
6. 输出：结论先行 → 矩阵 → 差异 → 选型 → 风险 → 证据与日期。

## 快速分层

| 层 | 产品 | 本质 |
|----|------|------|
| 国产 Agentic IDE / 平台 | Qoder、Trae | IDE 承载 Agent，卖开发工作台 |
| 国产 Coding Harness | ZCode | 围绕自研模型做长任务执行壳 |
| 国产通用办公 Agent | WorkBuddy | IM / 办公生态承载专家团 |
| 国际编程 Agent | Claude Code、Copilot、Cline、opencode、Qwen Code | 终端、IDE、平台、开源四条路线 |

## 一句话判断

- 要最强通用编程与内容层生态：Claude Code
- 要 GitHub 一体化与企业治理：Copilot
- 要国产 IDE、中文、企业云：Qoder
- 要国产低价与低门槛：Trae
- 要 GLM 长上下文、远程 / IM 控制：ZCode
- 要开源可控、本地模型、模型中立：opencode
- 要开源且对齐 Claude Code 能力：Qwen Code
- 要 IDE 内 Plan / Act、可审计：Cline
- 要办公全场景、IM、企业专家团：WorkBuddy

## 输出格式

默认按以下顺序，避免写成功能说明书：

1. 一句话结论
2. 分层与对比矩阵
3. 关键差异（国内 vs 海外、开源 vs 闭源、IDE vs CLI）
4. 选型建议（按角色和约束）
5. 风险与待核验项
6. 证据、日期、来源类型

## 参考文件

- `references/product-profiles.md`：9 个产品的统一档案
- `references/comparison-matrix.md`：矩阵、四象限、国内外差异、选型树
- `references/extraction-patterns.md`：7 个可复用模式、harness 清单、评估 rubric、报告模板

## 维护规则

- 价格、模型版本、功能状态每季度复核一次；过期内容标注 `stale`。
- 厂商宣传与第三方评测分开记录，不混写。
- 新增产品时先补档案，再进矩阵；不要只加一行结论。
- 不写入密钥、账号、内部地址、客户信息等敏感内容。
