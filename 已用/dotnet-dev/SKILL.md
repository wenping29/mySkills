---
name: "dotnet-dev"
description: ".NET/C# 语言与后端开发技能：C# 专家路由与文件级 C# 应用、行为保持重构、P/Invoke 互操作、SIMD 向量化、ASP.NET Core Web API、EF Core 数据访问与脚手架、.NET AI 技术选型。当用户要求 C#/.NET 开发、写 Web API/Minimal API/Controller、EF Core 查询优化与迁移、P/Invoke/LibraryImport、SIMD 性能优化、单文件 C# 脚本、ML.NET/LLM/RAG 选型、重构/重命名/内联 C# 代码，或提到 csharp/dotnet/aspnetcore/ef-core/pinvoke/simd 时触发。边界：不用于语言无关深度重构/架构→code-quality；端到端交付→dev-expert；Blazor/MAUI/WinForms UI→dotnet-ui；.NET 测试→dotnet-test。"
---

# dotnet-dev — .NET/C# 语言与后端开发

蒸馏自微软 dotnet/skills 仓库 9 个技能（csharp-expert、csharp-refactoring、csharp-scripts、dotnet-pinvoke、vectorization、technology-selection、dotnet-webapi、create-datadriven-aspnetcore、optimizing-ef-core-queries）。本文件只做路由，执行前必须 `Read` 对应主题文件。

## 触发词路由表（源技能 → 主题文件 → 何时用）

| 源技能 | 主题文件 | 何时用 |
|--------|----------|--------|
| csharp-expert | `references/csharp-core.md` | C#/.NET 请求先分类：按意图与工程证据（TFM、SDK 类型、manifest）判定问题归属，无更窄专家时走 C# 语言兜底流程 |
| csharp-scripts | `references/csharp-core.md` | 用户明确要"不建项目"跑一段 C#：文件级应用 `dotnet hello.cs`、`#:` 指令（package/property/ref/include 等） |
| csharp-refactoring | `references/csharp-refactoring.md` | 任何"重构/重命名/移动/提取/内联/合并/去重/现代化" C# 代码且要求行为不变；先过分类门禁 |
| dotnet-pinvoke | `references/interop-perf.md` | 写/审/调试 `[DllImport]`/`[LibraryImport]`、包装 C/C++ 库、native 边界崩溃/泄漏/损坏 |
| vectorization | `references/interop-perf.md` | SIMD 向量化：TensorPrimitives、Vector128/256/512、硬件 intrinsics、审现有 SIMD 代码 |
| technology-selection | `references/tech-selection.md` | 给 .NET 8+ 应用加 AI/ML 能力：分类/回归→ML.NET、LLM→MEAI、Agent→Agent Framework、RAG→MEVD、推理→ONNX、本地→OllamaSharp |
| dotnet-webapi | `references/webapi-data.md` | 新增/修改 ASP.NET Core 端点（Controller 或 Minimal API）、OpenAPI、错误处理、.http 测试 |
| create-datadriven-aspnetcore | `references/webapi-data.md` | 不用 CLI 脚手架工具，手工生成 EF Core 支撑的 CRUD 页面/视图/端点 |
| optimizing-ef-core-queries | `references/webapi-data.md` | EF Core 查询慢/N+1/深分页/SaveChanges/索引/跟踪等性能与正确性评审 |

## 全局门禁

- **重构先分类再动手**：升级/特性/行为变更/公共契约变更不属于行为保持重构，按 `csharp-refactoring.md` 门禁分流。
- **Web API 不改既有行为**：既有 API 不擅自加严格 JSON 设置；.NET 9+ 禁止新增 Swashbuckle 包。
- **EF 迁移不自动应用**：生成 `dotnet ef migrations add` 后须经用户确认才 `database update`。
- **SIMD/互操作须有测量证据**：无基准对比不得声称性能收益；未验证的 fallback 路径要明说。
- **边界**：UI 框架（Blazor/MAUI/WinForms）→ `dotnet-ui`；语言无关深度重构与架构 → `code-quality`；端到端交付流程 → `dev-expert`；.NET 测试 → `dotnet-test`。
