---
name: "dotnet-build"
description: ".NET 构建、打包与 SDK/模板技能：MSBuild 工程编写（target/item/属性/扩展点/Directory.Build）、构建性能优化与基线、binlog 采集与故障分析、bin/obj 路径冲突、复制与 RAR 诊断、反模式评审、工程现代化迁移、NuGet CPM 中央包管理转换、trusted publishing OIDC 发布、本地 SDK 安装、dotnet new 模板全生命周期（发现/对比/实例化/智能默认/创作/校验）。当用户提到 MSBuild/csproj/Directory.Build/binlog/构建性能/增量构建/并行构建/NuGet/CPM/PackageReference/可信发布/trusted publishing/dotnet new 模板/template.json/安装 SDK/global.json 时触发。边界：不用于 .NET 语言与后端开发（C#/ASP.NET Core/EF Core）→dotnet-dev；不用于 .NET 测试→dotnet-test；不用于框架升级与运行时诊断→dotnet-upgrade-diag；不用于 Blazor/MAUI/WinForms 等 UI 框架→dotnet-ui。"
---

# dotnet-build — .NET 构建、打包与 SDK/模板

蒸馏自微软 dotnet/skills 仓库 30 个构建/打包/SDK 类技能（dotnet-msbuild 20 个、dotnet-template-engine 6 个、dotnet 2 个、dotnet-nuget 1 个、dotnet-advanced 1 个）。本文件只做路由，执行前必须 `Read` 对应主题文件。

## 触发词路由表（30 个源技能 → 主题文件 → 何时用）

| 源技能 | 主题文件 | 何时用 |
|--------|----------|--------|
| msbuild | `references/msbuild-authoring.md` | MSBuild 工作总入口：先分流到故障排查/性能/编写评审三类，证据先行原则 |
| target-authoring | `references/msbuild-authoring.md` | 写/改自定义 Target：Before-Core-After 链、DependsOnTargets vs BeforeTargets、Returns vs Outputs |
| item-management | `references/msbuild-authoring.md` | Include/Remove/Update、%(Metadata) 批处理、项变换、PrivateAssets、FileWrites |
| property-patterns | `references/msbuild-authoring.md` | 条件默认值、分号组合、路径函数、TFM/OS 检测、守卫属性与兜底链 |
| extension-points | `references/msbuild-authoring.md` | 包内 build/buildTransitive 布局、CustomBefore/After 钩子、通配符导入、MSB4019、源码树 vs 打包布局 |
| including-generated-files | `references/msbuild-authoring.md` | 代码生成器产物没被编译：求值 vs 执行时机、Compile+FileWrites 注册、BeforeTargets 选择 |
| directory-build-organization | `references/msbuild-authoring.md` | 建/整理 Directory.Build.props/.targets/.rsp/Directory.Packages.props，多仓库层级、-pp 诊断 |
| msbuild-modernization | `references/msbuild-authoring.md` | 旧式 csproj→SDK 风格迁移、packages.config→PackageReference、AssemblyInfo 删除、try-convert |
| build-perf-baseline | `references/msbuild-perf.md` | 构建慢的第一步：冷/热/no-op 三基线、artifacts 布局、确定性构建、依赖图修剪、/graph |
| build-perf-diagnostics | `references/msbuild-perf.md` | 有基线后定位瓶颈：分析器/RAR/Copy/串行/评估各分支的系统性修法 |
| eval-performance | `references/msbuild-perf.md` | 编译未开始就慢：glob 扫描、深导入链、多次评估、求值期副作用 |
| incremental-build | `references/msbuild-perf.md` | no-op 重编/增量失效：Inputs-Outputs 诊断 grep、FileWrites、VS FastUpToDateCheck |
| build-parallelism | `references/msbuild-perf.md` | -m 并行度、关键路径依赖链、节点利用率、BuildInParallel |
| eliminate-redundant-restores | `references/msbuild-perf.md` | 流水线多次 "Determining projects to restore..."：四项覆盖判定后加 --no-restore |
| binlog-generation | `references/msbuild-diagnosis.md` | 任何 MSBuild 命令都要带 /bl:{}：唯一命名、每构建一文件、git clean 排除 |
| binlog-failure-analysis | `references/msbuild-diagnosis.md` | 分析已有 .binlog 找根因：binlog MCP 优先、msbuild 回放文本回退 |
| troubleshoot-binlog-mcp | `references/msbuild-diagnosis.md` | binlog MCP 服务器本身连不上/启动失败：dnx、NuGet 源、global.json、策略安全恢复 |
| check-bin-obj-clash | `references/msbuild-diagnosis.md` | 并发构建写同一 bin/obj：多 TFM/多 RID/多解决方案、SetTargetFramework 冗余、MSBuild 任务 fork |
| copy-to-output-directory | `references/msbuild-diagnosis.md` | PreserveNewest/Always/IfDifferent 选择、SkipUnchangedFilesOnCopyAlways、no-op 复制开销 |
| resolve-project-references | `references/msbuild-diagnosis.md` | 目标摘要里 ResolveProjectReferences 最贵：识破等待假象，改看 Task 摘要 |
| msbuild-antipatterns | `references/msbuild-diagnosis.md` | 评审/审计 csproj/props/targets：AP-01~AP-23 目录按严重级扫描 |
| convert-to-cpm | `references/nuget.md` | 启用中央包管理：guard/包维护/转换三模式、前后包清单对比、版本冲突先问策略 |
| nuget-trusted-publishing | `references/nuget.md` | GitHub Actions 用 OIDC 发布 nuget.org：策略配置、NuGet/login、id-token: write、排障 |
| setup-local-sdk | `references/sdk-setup.md` | 项目本地 .NET 预览版 SDK：.dotnet/ 目录+global.json paths、团队安装脚本、工作负载 |
| template-discovery | `references/template-engine.md` | "有什么模板/该用哪个"：意图→shortName 映射、list/search、--help 检查、dry-run 预览 |
| template-comparison | `references/template-engine.md` | 两个以上模板逐项对比：证据来自 --help、以一行 Recommendation 收尾 |
| template-instantiation | `references/template-engine.md` | 实际创建工程：匹配工作区 CPM/TFM、多工程组解决方案、创建后 build 验证 |
| template-smart-defaults | `references/template-engine.md` | 创建时跨参数默认：--aot→最新 TFM、auth→不关 HTTPS、controllers 与 minimal 互斥 |
| template-authoring | `references/template-engine.md` | 从现有工程造 dotnet new 模板：约定携带清单、XML 注释指令、pack 工程、本地 install+build 测试 |
| template-validation | `references/template-engine.md` | 发布前查 template.json：8 类校验规则、shortName 冲突、symbols/constraints/post-actions、判决表 |

## 四类工作摘要

**MSBuild**（authoring/perf/diagnosis 三个主题文件）：编写走三层目标链+追加式 DependsOn+props/targets 分工；性能必须先冷/热/no-op 基线再按测量走评估/增量/并行/复制/restore 分支；诊断一律先 `/bl:{}` 采集 binlog（禁止把 .binlog 当文本读），binlog MCP 优先、`dotnet msbuild xxx.binlog` 回放回退；评审按 AP-01~23 目录，未授权不改文件，破坏性操作须批准。

**NuGet**：CPM 转换须 guard 模式拦 packages.config、基线/转换后包清单逐工程对比、冲突策略未定不动手；trusted publishing 只适用 GitHub Actions+nuget.org，删 API key/改包 ID 前必须确认（包 ID 永久不可改）。

**SDK 安装**：本地 `.dotnet/` + `global.json` `paths`（需宿主 .NET 10+），不碰系统安装；工作负载必须用本地 dotnet 二进制安装。

**模板引擎**：所有 dotnet new 调用串行执行（全局互斥）、参数名只认当前模板 `--help` 输出、"不创建文件"则命令带 `--dry-run`；创建工程先镜像工作区 CPM 与 TFM；创作模板的核心是逐项携带源工程约定并跑 install→dry-run→instantiate→build 全链验证。

## 全局门禁

- **证据先行**：性能改动无前后基线对比不得声称有效；模式存在但无实测影响→只作观察报告。
- **未授权不改**：诊断/评审类任务默认只报告发现；删文件、清缓存、杀进程、升级 SDK 均属破坏性操作，须用户批准且限定范围。
- **边界**：C#/ASP.NET Core/EF Core 开发→`dotnet-dev`；.NET 测试→`dotnet-test`；框架升级与运行时诊断→`dotnet-upgrade-diag`；Blazor/MAUI/WinForms UI→`dotnet-ui`。
