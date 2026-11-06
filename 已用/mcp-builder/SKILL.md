---
name: mcp-builder
description: 创建高质量 MCP（Model Context Protocol）server 的指南，使 LLM 能够通过设计良好的 tool 与外部服务交互。当需要构建 MCP server 以集成外部 API 或服务时使用，无论是 Python（FastMCP）还是 Node/TypeScript（MCP SDK）。
license: Complete terms in LICENSE.txt
---

# MCP Server 开发指南

## 概述

创建 MCP（Model Context Protocol）server，使 LLM 能够通过设计良好的 tool 与外部服务交互。一个 MCP server 的质量，以它在多大程度上帮助 LLM 完成真实世界任务来衡量。

---

# 流程

## 🚀 高层工作流

创建一个高质量的 MCP server 包含四个主要阶段：

### 阶段 1：深入研究与规划

#### 1.1 理解现代 MCP 设计

**API 覆盖 vs. 工作流工具：**
在全面的 API 端点覆盖与专门的工作流工具之间取得平衡。工作流工具在执行特定任务时可能更方便，而全面的覆盖则让 agent 可以自由组合操作。表现因 client 而异——有些 client 受益于通过代码执行来组合基础 tool，另一些则更适合高层工作流。不确定时，优先保证全面的 API 覆盖。

**Tool 命名与可发现性：**
清晰、描述性的 tool 名称能帮助 agent 快速找到正确的工具。使用一致的前缀（例如 `github_create_issue`、`github_list_repos`）和面向动作的命名。

**上下文管理：**
agent 受益于简洁的 tool 描述以及对结果进行过滤/分页的能力。设计返回聚焦、相关数据的工具。某些 client 支持代码执行，可以帮助 agent 高效地过滤和处理数据。

**可操作的错误消息：**
错误消息应引导 agent 走向解决方案，给出具体的建议和下一步操作。

#### 1.2 研读 MCP 协议文档

**浏览 MCP 规范：**

先从 sitemap 开始找到相关页面：`https://modelcontextprotocol.io/sitemap.xml`

然后在具体页面 URL 后加 `.md` 后缀以获取 markdown 格式（例如 `https://modelcontextprotocol.io/specification/draft.md`）。

需要重点阅读的页面：
- 规范概览与架构
- 传输机制（streamable HTTP、stdio）
- tool、resource 和 prompt 的定义

#### 1.3 研读框架文档

**推荐技术栈：**
- **语言**：TypeScript（SDK 支持质量高，且在许多执行环境中兼容性好，例如 MCPB。此外 AI 模型擅长生成 TypeScript 代码，受益于其广泛的使用、静态类型和良好的 lint 工具）
- **传输**：远程 server 使用 Streamable HTTP，采用无状态 JSON（相比有状态会话和流式响应，更易于扩展和维护）。本地 server 使用 stdio。

**加载框架文档：**

- **MCP 最佳实践**：[📋 查看最佳实践](./reference/mcp_best_practices.md) - 核心准则

**对于 TypeScript（推荐）：**

TypeScript SDK 有两个大版本。写代码之前先选定一个：
- **v2**（`@modelcontextprotocol/server`）：当前稳定版本。新建 server 时使用它。
- **v1**（`@modelcontextprotocol/sdk`）：仅接收 bug 和安全修复。仅当项目的 `package.json` 已经依赖 `@modelcontextprotocol/sdk` 时使用它，或用 `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` 迁移该项目

如果项目已经使用 v1，向用户说明一次（一两句话即可）：v2（`@modelcontextprotocol/server`）是当前稳定版本，v1 仅提供 bug 和安全修复，`npx @modelcontextprotocol/codemod@latest v1-to-v2 .` 可以迁移项目。除非用户要求迁移，否则继续使用 v1。

不要在同一个项目中混用两者：v1 代码示例（从 `@modelcontextprotocol/sdk/...` 导入）不适用于 v2。

- **TypeScript SDK (v2)**：使用 WebFetch 加载 `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`；完整文档索引位于 `https://ts.sdk.modelcontextprotocol.io/v2/llms.txt`
- [⚡ TypeScript 指南 (v2)](./reference/node_mcp_server_v2.md) - TypeScript 模式与示例
- 仅用于 v1 项目：`https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md` 以及 [TypeScript 指南 (v1)](./reference/node_mcp_server.md)

**对于 Python：**
- **Python SDK**：使用 WebFetch 加载 `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- [🐍 Python 指南](./reference/python_mcp_server.md) - Python 模式与示例

#### 1.4 规划实现

**理解 API：**
审阅服务的 API 文档，识别关键端点、认证要求和数据模型。按需使用网络搜索和 WebFetch。

**工具选择：**
优先保证全面的 API 覆盖。列出要实现的端点，从最常用的操作开始。

---

### 阶段 2：实现

#### 2.1 搭建项目结构

项目设置参见对应语言的指南：
- [⚡ TypeScript 指南 (v2)](./reference/node_mcp_server_v2.md) - 项目结构、package.json、tsconfig.json（已有的 v1 项目见 [v1](./reference/node_mcp_server.md)）
- [🐍 Python 指南](./reference/python_mcp_server.md) - 模块组织、依赖

#### 2.2 实现核心基础设施

创建共享工具：
- 带认证的 API client
- 错误处理辅助函数
- 响应格式化（JSON/Markdown）
- 分页支持

#### 2.3 实现工具（Tools）

对每个 tool：

**输入 schema：**
- 使用 Zod（TypeScript）或 Pydantic（Python）
- 包含约束条件和清晰的描述
- 在字段描述中添加示例

**输出 schema：**
- 尽可能为结构化数据定义 `outputSchema`
- 在 tool 响应中使用 `structuredContent`（TypeScript SDK 特性）
- 帮助 client 理解和处理工具输出

**Tool 描述：**
- 功能的简明摘要
- 参数说明
- 返回类型 schema

**实现：**
- I/O 操作使用 async/await
- 完善的错误处理，消息可操作
- 在适用处支持分页
- 使用现代 SDK 时，同时返回文本内容和结构化数据

**注解（Annotations）：**
- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false
- `openWorldHint`: true/false

---

### 阶段 3：审查与测试

#### 3.1 代码质量

审查以下方面：
- 无重复代码（DRY 原则）
- 错误处理一致
- 完整的类型覆盖
- tool 描述清晰

#### 3.2 构建与测试

**TypeScript：**
- 运行 `npm run build` 验证编译
- v2 项目：针对构建好的 server 运行 [v2 指南](./reference/node_mcp_server_v2.md#verify-your-server)中的自检脚本
- 使用 MCP Inspector 测试：`npx @modelcontextprotocol/inspector`

**Python：**
- 验证语法：`python -m py_compile your_server.py`
- 使用 MCP Inspector 测试

详细测试方法和质量检查清单参见对应语言的指南。

---

### 阶段 4：创建评估

实现 MCP server 后，创建全面的评估以测试其有效性。

**加载 [✅ 评估指南](./reference/evaluation.md) 获取完整评估准则。**

#### 4.1 理解评估目的

使用评估来测试 LLM 能否有效利用你的 MCP server 回答真实、复杂的问题。

#### 4.2 创建 10 个评估问题

要创建有效的评估，请遵循评估指南中所述的流程：

1. **检查工具**：列出可用的 tool 并理解其能力
2. **探索内容**：使用只读（READ-ONLY）操作探索可用数据
3. **生成问题**：创建 10 个复杂、真实的问题
4. **验证答案**：自己解答每个问题以验证答案

#### 4.3 评估要求

确保每个问题满足：
- **独立**：不依赖于其他问题
- **只读**：仅需要非破坏性操作
- **复杂**：需要多次工具调用和深入探索
- **真实**：基于人类真正关心的实际使用场景
- **可验证**：有单一、明确的答案，可通过字符串比较验证
- **稳定**：答案不会随时间改变

#### 4.4 输出格式

创建具有如下结构的 XML 文件：

```xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
```

---

# 参考文件

## 📚 文档库

开发过程中按需加载以下资源：

### MCP 核心文档（优先加载）
- **MCP 协议**：先从 `https://modelcontextprotocol.io/sitemap.xml` 的 sitemap 开始，然后在具体页面 URL 后加 `.md` 后缀获取
- [📋 MCP 最佳实践](./reference/mcp_best_practices.md) - 通用 MCP 准则，包括：
  - server 与 tool 命名约定
  - 响应格式指南（JSON vs Markdown）
  - 分页最佳实践
  - 传输选择（streamable HTTP vs stdio）
  - 安全与错误处理标准

### SDK 文档（阶段 1/2 加载）
- **Python SDK**：从 `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md` 获取
- **TypeScript SDK (v2)**：从 `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md` 获取；完整文档索引位于 `https://ts.sdk.modelcontextprotocol.io/v2/llms.txt`
- **TypeScript SDK (v1，仅用于已有 v1 项目)**：从 `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md` 获取

### 各语言实现指南（阶段 2 加载）
- [🐍 Python 实现指南](./reference/python_mcp_server.md) - 完整的 Python/FastMCP 指南，包括：
  - server 初始化模式
  - Pydantic 模型示例
  - 使用 `@mcp.tool` 注册工具
  - 完整可用示例
  - 质量检查清单

- [⚡ TypeScript 实现指南 (SDK v2)](./reference/node_mcp_server_v2.md) - 针对 `@modelcontextprotocol/server` 的完整 TypeScript 指南，包括：
  - 项目搭建与 server factory
  - 工具设计：Zod 4 schema、输出格式、分页、错误
  - 同时提供 stdio 和 Streamable HTTP 并带 bearer 认证的完整示例
  - Resources、prompts 与通知
  - 用于验证构建后 server 的自检脚本
  - 高级特性对应的 SDK 示例链接
  - v1 → v2 对照表、迁移步骤与质量检查清单

- [⚡ TypeScript 实现指南 (SDK v1)](./reference/node_mcp_server.md) - 针对已有 `@modelcontextprotocol/sdk` 项目的同等指南

### 评估指南（阶段 4 加载）
- [✅ 评估指南](./reference/evaluation.md) - 完整的评估创建指南，包括：
  - 问题创建准则
  - 答案验证策略
  - XML 格式规范
  - 问答示例
  - 使用提供的脚本运行评估
