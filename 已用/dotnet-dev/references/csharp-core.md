# C# 核心：专家路由 + 文件级 C# 应用

蒸馏自源技能 `csharp-expert` 与 `csharp-scripts`。

## 一、C#/.NET 请求路由（csharp-expert）

作为 C#/.NET 工作的"前门"：先分类意图，再按工程证据判定归属，选最窄的负责人；没有更窄专家时才走 C# 语言兜底。

### 1. 按意图分类

| 提示意图 | 归属 |
|---|---|
| 创建/脚手架 | 对应解决方案类型的项目创建 |
| 添加应用行为 | 行为所在的框架/组件 |
| 修编译器/运行时缺陷 | 最窄的语言/框架/数据/互操作负责人 |
| 构建或还原失败 | MSBuild/SDK/workload/项目引用/NuGet 诊断 |
| 写/跑/审/迁移测试 | 所请求的精确测试生命周期或迁移 |
| 升级/迁移 | 源版本、目标版本与被迁移工件 |
| 诊断慢/崩/挂/内存增长 | 运行时诊断（除非证据指向构建性能或本地热点） |
| 不改行为的重构 | 重构而非特性/修 bug |
| 打包/发布/信任源 | NuGet 发布工作流 |
| C# 语法/类型/可空性/async/API | 语言兜底 |

把用户名词当线索而非证据："性能"可能是运行时追踪、微基准、EF 查询形状、SIMD 或 MSBuild；"API"可能是 ASP.NET Core、库契约或外部服务客户端。

### 2. 按证据检测解决方案类型（只查最小 manifest 集）

| 证据 | 解决方案 |
|---|---|
| `Microsoft.NET.Sdk.Web`、controllers、middleware、OpenAPI | ASP.NET Core |
| `.razor`、`AddRazorComponents` | Blazor |
| `<UseMaui>true</UseMaui>`、`MauiProgram`、XAML | .NET MAUI |
| `<UseWindowsForms>true</UseWindowsForms>`、`Form` | Windows Forms |
| EF 包引用、`DbContext`、迁移 | EF Core |
| `<IsTestProject>true</IsTestProject>` | .NET 测试 |
| `Directory.Build.*`、`.binlog` | MSBuild |
| `Directory.Packages.props`、还原冲突 | NuGet |
| 新旧 TFM、版本迁移请求 | .NET 升级 |
| `PublishAot`、裁剪警告、native 调用 | AOT/互操作 |
| 无项目 + 明确单文件 C# 程序 | 文件级 C#（见下） |
| 以上皆非，正确性取决于 C# 语义 | C# 语言兜底 |

多项目时从提示所指文件追溯到其所属项目，不要用第一个 `.csproj` 路由整个解决方案。

### 3. 候选排序（精确优先）

1. 精确转换/生命周期技能（测试迁移、框架转换、查询优化等）
2. 匹配 owning 项目与所请求行为的框架/组件技能
3. 匹配失败子系统的工具技能（MSBuild、NuGet、测试执行、诊断）
4. 跨切面机制专家（互操作、向量化、序列化、AOT）
5. 触及仓库外契约（`PublicAPI.*.txt`、`InternalsVisibleTo`、多 TFM、生成分部类）→ breaking-changes 检查
6. 行为保持结构变更 → 重构（见 `csharp-refactoring.md`）
7. 都没有 → C# 语言兜底

歧义时按"决定成败的判断"路由，例如："让它更快"→ 构建时长/SQL 形状/进程 CPU/隔离热点分别对应构建性能/数据/诊断/微基准或 SIMD。

### 4. 缺失专家时的获取（dotnet/skills 市场）

```text
/plugin marketplace add dotnet/skills
/plugin install <plugin>@dotnet-agent-skills
```

- 市场名 `dotnet-agent-skills`，源仓库 `dotnet/skills`；安装目标是插件名而非技能名。
- 装完须：重启宿主 → `/skills` 确认 → 重跑请求。
- 已安装但 `/skills` 不可见：先重启/重载并查 `/skills`，不要重装。
- 缺专家不阻止任务：能安全完成就继续，把可选安装建议放在结果之后。

### 5. C# 语言兜底流程（无更窄专家时）

1. 复现精确的编译器诊断/失败测试/异常；无仓库时给最小代码模式。
2. 检查 owning 项目的 TFM、语言版本、nullable 策略、分析器、现有测试。
3. 除非明确要求，保留公共签名、序列化形状、所有权、取消、处置、多目标行为。
4. 沿受影响调用路径实现最小完整修复。
5. 查 LSP 诊断 → 最窄构建 → 聚焦测试证明症状消失。

禁止：为让本地编辑编译而升 SDK/TFM/包版本；编辑生成文件（`*.g.cs`）；宽泛 cast、`!` 压制、catch-all、fire-and-forget 掩盖证据；框架有保留所有权的重载（如 `leaveOpen: true`）时只给该规范修复，不建议泄漏/跳过处置。

## 二、文件级 C# 应用（csharp-scripts）

用户明确要"不建项目"的 C# 单文件/小多文件应用时使用。语言无关脚本、通用计算、Python/PowerShell 式自动化、完整项目不在此列。

### 前提与基本流程

1. `dotnet --version`：文件级应用要求 .NET 10+；`#:include`/`#:exclude`/传递性指令要求 SDK 10.0.300+（10.0.100/200 只能跑单文件）。
2. 写入口 `.cs`（顶级语句，`using` 在前、类型声明在所有语句之后），放在任何项目目录之外。
3. 运行：`dotnet hello.cs`（自动构建+缓存）；传参 `dotnet hello.cs -- arg1 arg2`。
4. 清理：`dotnet clean hello.cs`。

```csharp
#!/usr/bin/env dotnet
// hello.cs
Console.WriteLine("Hello from a file-based app!");
```

### `#:` 指令（全部置于文件顶部、shebang 之后、using 之前）

| 指令 | 作用 | 示例 |
|---|---|---|
| `#:package` | NuGet 引用（写版本；`@*` 取最新） | `#:package Humanizer@2.14.1` |
| `#:property` | MSBuild 属性，`名=值` 无空格 | `#:property AllowUnsafeBlocks=true` |
| `#:project` | 引用 csproj | `#:project ../MyLibrary/MyLibrary.csproj` |
| `#:ref` | 把另一 `.cs` 编成独立程序集（项目引用式边界；需 `#:property ExperimentalFileBasedProgramEnableRefDirective=true`，被引文件无入口时设 `OutputType=Library`） | `#:ref ../Shared/Formatter.cs` |
| `#:sdk` | 覆盖 SDK | `#:sdk Microsoft.NET.Sdk.Web` |
| `#:include` / `#:exclude` | 多文件同程序集（SDK 10.0.300+）；优先窄 glob | `#:include Models/*.cs` |

要点：`#:include` 的辅助文件共享入口程序集；`#:ref` 建立 assembly 边界（跨边界成员须 public）；非入口文件里的指令也会被处理；同一指令类型不要在包含文件间重复；Unix 上 shebang 文件用 LF 无 BOM 并 `chmod +x`。

常用属性：`AllowUnsafeBlocks=true`、`PublishAot=false`（默认开 AOT）、`NoWarn=CS0162;CS0219`、`LangVersion=preview`、`InvariantGlobalization=false`。

### AOT 下的 JSON

文件级应用默认 native AOT，反射式 `JsonSerializer.Serialize<T>` 运行时失败，必须用源生成：

```csharp
[JsonSerializable(typeof(Person))]
partial class AppJsonContext : JsonSerializerContext;
var json = JsonSerializer.Serialize(person, AppJsonContext.Default.Person);
```

### 升级与回退

- 长大转正式项目：`dotnet project convert hello.cs`。
- SDK < 10 回退：临时 console 项目 `dotnet new console` + `dotnet run`，加包用 `dotnet add package`，用完删目录。

### 常见坑

| 坑 | 解法 |
|---|---|
| `.cs` 位于含 `.csproj` 目录 | 移出目录，或 `dotnet run --file file.cs` |
| `#:package` 无版本 | 指定版本或 `@*` |
| 指令放在 C# 代码之后 | 所有 `#:` 必须在 shebang 后、using/语句前 |
| 辅助文件未编译 | 入口加 `#:include Helper.cs` |
| 共享文件需程序集边界 | 用 `#:ref` 并设 `OutputType=Library` |
| 反射 JSON 失败 | 源生成 `JsonSerializerContext` |
| 意外继承 `global.json`/`Directory.Build.*`/`nuget.config` | 移到隔离目录 |

验证清单：版本达标 → 编译通过（`dotnet build <file>.cs`）→ `dotnet <file>.cs` 输出符合预期 → 多文件包含/排除正确 → 会话后清理工件。
