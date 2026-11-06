---
name: code-operations
description: 代码与文件批量操作技能，合并三类能力：本地 Python 批量代码执行与审计（批量重构执行、90%+ token 节省）、代码转换与行级插入（代码复制/移动/提取/按行号插入）、文件元数据与批量分析（文件操作/统计）。当用户请求批量重构执行、代码转换、文件操作、code execution、跨文件重命名、按行插入代码，或需要启动 execution runtime / 接入 FastMCP server 时使用。不用于：深度代码分析、技术债评估与架构评审（转 code-quality）。
---

# Code Operations（代码操作）

合并三类代码/文件操作能力，并内置 execution runtime（Python 包 + FastMCP server）用于大批量、低 token 开销的操作。

## 操作路由

| 用户意图 | 走哪条线 | 参考文档 |
|---|---|---|
| 批量代码执行/审计：10+ 文件重构、跨文件重命名、代码库审计、多步迭代处理、强调省 token | execution runtime 本地执行 | `references/code-execution.md` |
| 代码转换：复制/移动函数类、提取到新文件、按行号插入 | 小批量用原生工具 + `scripts/line_insert.py`；10+ 文件切执行模式 | `references/code-transfer.md` |
| 文件操作：查看大小/行数/修改时间、统计对比、模式搜索（只读，不修改） | 原生工具（stat/wc/Grep/Glob） | `references/file-operations.md` |

判定原则：操作规模 ≤10 个文件走原生工具；>10 个文件或需迭代处理时安装并使用 `runtime/` 执行模式（90-99% token 节省，只返回摘要不返回源码）。

## Runtime 启动方式

runtime 为完整 Python 包，位于 `runtime/`（含 `pyproject.toml`、`api/`、`execution_runtime/`、`mcp-server/`，内部相对路径不可改动）。

1. **安装**（需 Python ≥3.11）：
   ```bash
   pip install -e runtime/          # 或 bash runtime/setup.sh
   ```
2. **直接导入使用**：
   ```python
   from execution_runtime import fs, code, transform, git
   result = transform.rename_identifier('.', 'oldName', 'newName', '**/*.py')
   ```
3. **环境变量**：复制 `runtime/.env.example` 按需配置 `ALLOWED_DIRECTORIES`（允许读写的目录白名单）、`MASK_SECRETS`、`AGGRESSIVE_MASKING`、`EXECUTION_TIMEOUT`（默认 30s）、`MEMORY_LIMIT_MB`（默认 256）。
4. **API 清单**：filesystem / code_analysis（仅返回元数据）/ code_transform / git_operations；会话与可复用技能（Session、save_skill）。完整说明见 `runtime/README.md`。
5. **示例脚本**：`examples/bulk_refactor.py`、`examples/extract_functions.py`、`examples/codebase_audit.py`。

## FastMCP Server 接入

- 入口：`runtime/mcp-server/mcp_server.py`（server 名 `MarketplaceExecutionRuntime`，依赖 fastmcp、loguru、RestrictedPython、python-dotenv，随包安装）。
- 暴露工具：`execute_python`（沙箱执行，自动 PII/密钥脱敏）、`save_reusable_skill`、`create_refactoring_session`、`save_session_state`、`list_available_apis`。
- 启动：`python runtime/mcp-server/mcp_server.py`；或在 MCP 客户端配置中注册：
  ```json
  {"mcpServers": {"execution-runtime": {"command": "python", "args": ["<skill-root>/runtime/mcp-server/mcp_server.py"]}}}
  ```
- 注意：server 通过相对自身的路径加载 `runtime/api/` 与 `runtime/mcp-server/security/`，必须保持 `runtime/` 目录结构完整；执行环境限制为 30s 超时、256MB 内存、仅白名单导入、结果自动脱敏后返回上下文。

## 安全约定

- 代码分析只取元数据，禁止把大批量源码读回上下文。
- 大批量修改前先确认 git 状态（`git.git_status()`），重要文件用 `--backup`。
- 返回结果一律用摘要（文件数、替换数、错误数），由 runtime 自动脱敏密钥/PII。
