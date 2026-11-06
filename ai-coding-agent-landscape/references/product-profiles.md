# 产品档案

核验日期：2026-11。价格、模型版本、功能开关变化很快，引用前先查官网。

证据等级：A = 官方文档或产品页；B = 官方定价页；C = 第三方评测或媒体；D = 待核验。本文件中的判断默认是 B/C 级，具体能力以 A 级为准。

## 1. Qoder（别名 qorder）

- 厂商：阿里云 / 通义系
- 定位：Agentic coding platform，覆盖 IDE、CLI、移动端与云 Agent
- 形态：独立 IDE（Windows / macOS / Linux）、JetBrains 插件、CLI、移动端、Cloud Agents、Agent SDK
- 模型：闭源产品，通义 / Qoder 自研模型为主，按版本和地区提供不同模型选项
- 核心能力：大仓库上下文、Repo Wiki、Experts 多 Agent 协作、Agentic Chat、NEXT 补全、Memories、Rules、MCP、Skills、Checkpoints
- 差异点：上下文工程 + 多 Agent + 云 / 移动全场景 + 企业版，是国产产品里产品面最全的一类
- 局限：功能面多，部分能力依赖订阅和地区；闭源；Credits 计费；国内版与国际版能力、价格不一致
- 价格量级：Free；Lite 约 $10/月；Pro 约 $20/月；Pro+ 约 $60/月；Ultra 约 $200/月；国内促销价另计；Teams 约 300 元/席/月
- 适合：需要国产 IDE、中文体验、企业云与上下文工程的团队
- 核验点：Experts 是否全量开放、Cloud Agents 地区限制、Credits 消耗规则、国内版与国际版差异

## 2. WorkBuddy

- 厂商：腾讯云
- 定位：通用办公 Agent / 企业智能体工作台，不是编程专用 Agent
- 形态：桌面端、企业微信 / IM、小程序、云端托管
- 模型：混元 + 第三方多模型
- 核心能力：100+ 专家角色、多专家并行、项目协作、MCP、自定义 Skills、WMA 云托管、企业权限、审计与可观测
- 差异点：IM / 办公入口 + 专家团编排 + 企业治理，卖的是“数字员工”而不是“代码助手”
- 局限：不是编程专用；深度任务和长任务不如专用 coding harness；积分消耗不透明；能力依赖企业套件
- 价格量级：个人免费额度；标准版约 70 元/月、进阶版约 140 元/月、旗舰版约 700 元/月；企业版约 198 元/人/月；促销和年付会变化
- 适合：办公自动化、企业知识工作、IM 协作、需要私有化和审计的组织
- 核验点：专家角色数量、Credits 规则、私有化门槛、与企业微信 / 腾讯文档的绑定程度
- 注意：腾讯的 CodeBuddy 才是编程产品，WorkBuddy 不要混入编程 Agent 横评

## 3. ZCode

- 厂商：智谱 / z.ai
- 定位：Agentic Development Environment（ADE），围绕 GLM 做长任务编码
- 形态：桌面工作区为主，配套 Remote、Bot Channel
- 模型：GLM-5.2 / GLM-5.3，GLM-5.3 支持长上下文（官方口径 1M）
- 核心能力：自研 ZCode Agent、Goal 模式、Subagents、长任务执行、权限 / 上下文 / 工具 / Review 一体化、飞书 / 微信 Bot、兼容 Claude / Codex / Gemini / OpenCode 插件
- 差异点：模型与 harness 联合调优，长任务和远程触发是重点；对 Claude Code 风格工作流做了国产化兼容
- 局限：最佳效果绑定 GLM；生态较新；桌面为主；第三方模型体验不保证
- 价格量级：工具免费；模型 BYO API 或 GLM Coding Plan；新用户有试用额度
- 适合：GLM 用户、长任务、远程 / IM 触发、想要 Claude Code 风格但使用国产模型的团队
- 核验点：1M 上下文是否全量、Goal 模式稳定性、插件兼容范围、Bot Channel 支持平台

## 4. Claude Code

- 厂商：Anthropic
- 定位：terminal-first 的 agentic coding tool，同时提供 IDE、桌面与 Web 入口
- 形态：终端、IDE 扩展、桌面、Web / 移动、Cloud / Background
- 模型：Claude 系列，闭源
- 核心能力：CLAUDE.md、Skills、Subagents、Hooks、MCP、Plugins、Agent Teams、权限模型、后台任务、检查点与恢复
- 差异点：内容层最完整，Hooks 提供确定性控制，Skills / Subagents / Plugins 已成为事实标准；生态和最佳实践最成熟
- 局限：闭源；价格高；国内接入与合规需单独评估；强绑定 Claude 模型
- 价格量级：随 Claude 订阅或 API 计费，Pro / Max / Team / Enterprise 不同
- 适合：追求最强通用编程、愿意接受闭源、需要成熟内容层和权限控制的开发者与团队
- 核验点：Agent Teams 可用范围、Cloud 任务地区、Hooks 事件覆盖、企业合规选项

## 5. opencode

- 厂商：开源社区（anomalyco / SST）
- 定位：开源、模型无关的终端编码 Agent
- 形态：终端 TUI、桌面、IDE
- 模型：75+ provider，支持本地模型和自定义 endpoint
- 核心能力：AGENTS.md、Build / Plan 模式、Subagents、Permissions、LSP、Sessions、分享、GitHub / GitLab 集成
- 差异点：MIT 开源、模型中立、可完全本地化，适合自己掌控 harness
- 局限：配置门槛高；稳定性依赖所选模型；长上下文和复杂任务弱于头部闭源产品；企业治理弱
- 价格量级：工具免费开源，成本主要是模型 API 或本地算力
- 适合：隐私敏感、本地模型、多模型切换、想改 harness 的开发者
- 核验点：Provider 兼容性、权限模型、桌面端成熟度、企业部署方式

## 6. GitHub Copilot

- 厂商：GitHub / Microsoft
- 定位：覆盖 IDE、CLI、GitHub 与云端的编程 Agent 平台
- 形态：IDE 扩展、CLI、GitHub、Cloud Agent
- 模型：多模型（OpenAI / Anthropic / Google 等，按计划开放）
- 核心能力：Agent Mode、MCP、自定义指令与自定义 Agent、Code Review、Issue → PR、Cloud Agent、企业治理
- 差异点：GitHub 分发与企业采购优势，Issue 到 PR 的闭环最顺；企业治理成熟
- 局限：深度绑定 GitHub 生态；额度和 AI Credits 规则复杂；深度任务能力受计划限制
- 价格量级：Free；Pro 约 $10/月；Pro+ 约 $39/月；Max 约 $100/月；Business 约 $19/人/月；Enterprise 约 $39/人/月；AI Credits 另计
- 适合：GitHub 团队、企业采购、希望低迁移成本接入 Agent 的组织
- 核验点：Cloud Agent 可用地区、模型白名单、AI Credits 消耗、企业策略限制

## 7. Cline

- 厂商：开源社区 / Cline
- 定位：开源自主编码 Agent，覆盖 IDE、CLI、SDK、桌面
- 形态：VS Code / JetBrains 扩展、CLI、SDK、Desktop
- 模型：BYO，多 provider，支持本地模型
- 核心能力：Plan / Act 模式、MCP、Checkpoints、Rules、Skills、CI 非交互调用
- 差异点：计划与执行分离、过程透明、可审计，适合把 Agent 嵌入现有工程流程
- 局限：需要自备模型；企业治理和托管能力弱于大厂；配置项多；长任务稳定性依赖模型
- 价格量级：开源免费，成本主要是模型 API
- 适合：想审计每一步、在 IDE 内使用、做 CI 自动化的开发者
- 核验点：CLI / SDK 成熟度、Checkpoint 恢复、JetBrains 支持程度、许可证义务

## 8. Qwen Code

- 厂商：阿里通义实验室
- 定位：开源终端编码 Agent，功能上对齐 Claude Code
- 形态：终端、IDE、桌面、Web、IM / 聊天渠道
- 模型：Qwen3-Coder 为主，支持多协议与多模型接入
- 核心能力：Subagents、Agent Teams、Skills、Hooks、MCP、Plan 模式、LSP、多协议
- 差异点：Apache-2.0 开源 + Claude Code 功能对齐 + 国产模型与中文生态
- 局限：模型需自备或订阅，免费 OAuth 额度已调整；生态成熟度和稳定性仍在追赶；企业治理较弱
- 价格量级：工具免费开源；模型按 Token Plan、API 或自建算力计费
- 适合：国产开源、Claude Code 替代、私有化、Qwen 模型用户
- 核验点：当前模型接入方式、Agent Teams 稳定性、IDE 扩展成熟度、协议兼容范围

## 9. Trae（别名 trea）

- 厂商：字节跳动
- 定位：AI IDE，主打低门槛和中文体验
- 形态：IDE、SOLO Agent、云端任务、多平台
- 模型：多模型；国内版与国际版模型池不同
- 核心能力：Builder / SOLO、云端任务、中文界面、国内直连、低门槛上手
- 差异点：免费 / 低价起步、国内网络友好、上手成本低，是 Cursor 的国产平替路线
- 局限：长任务稳定性、企业治理、前沿模型接入相对弱；国内外版本差异大；复杂工程能力待验证
- 价格量级：免费起步；国际版 Pro 约 $20/月、Pro+ 约 $60/月、Ultra 约 $200/月；国内价格另计
- 适合：入门、学生、预算敏感、国内网络环境、轻中度开发
- 核验点：国内版模型池、云端任务并发、SOLO 稳定性、企业版能力

## 横向提醒

- WorkBuddy 是办公 Agent，不应和 coding Agent 放在同一张能力表里直接打分。
- Qoder、Trae、Copilot 都有 IDE 入口，但 Qoder 更重上下文与多 Agent，Trae 更重低门槛，Copilot 更重 GitHub 闭环。
- Claude Code、opencode、Qwen Code、Cline 都能在终端工作，但内容层完整度、权限模型和模型自由度不同。
- 所有“支持 MCP / Skills / Subagents”只说明有接口，不代表质量和稳定性一致。
