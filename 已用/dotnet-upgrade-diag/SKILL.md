---
name: "dotnet-upgrade-diag"
description: ".NET 升级与诊断技能：TFM 版本升级 8→9→10→11 与公共 API 兼容性门禁、Native AOT/裁剪警告消除、可空引用迁移、Thread.Abort 协作式取消、.NET 11 Process/STJ 新 API、性能反模式扫描、生产 trace/dump 采集选型、CLR 激活日志诊断、BenchmarkDotNet 微基准、Android/Apple 崩溃符号化、mock 审计与测试重复度分析。当用户要求 .NET 升级、TargetFramework 升版、AOT 兼容、nullable 启用、Thread.Abort 迁移、dotnet-trace、PerfView、dump、崩溃符号化、microbenchmark、性能审查、breaking change 评审，或提到 upgrade/AOT/nullable/symbolication/benchmark 时触发。边界：不用于构建性能与 binlog 分析→dotnet-build；测试框架/运行器迁移与测试编写→dotnet-test；语言无关架构评估→code-quality；C# 语言开发与 Web API→dotnet-dev。"
---

# dotnet-upgrade-diag — .NET 升级、兼容性与运行时诊断

蒸馏自微软 dotnet/skills 仓库 18 个技能（dotnet-diag 7 个 + dotnet-upgrade 6 个 + dotnet-breaking-changes + dotnet11 2 个 + dotnet-experimental 2 个）。本文件只做路由，执行前必须 `Read` 对应主题文件。

## 触发词路由表（源技能 → 主题文件 → 何时用）

| 源技能 | 主题文件 | 何时用 |
|--------|----------|--------|
| analyzing-dotnet-performance | `references/performance-diag.md` | 扫描 C# 代码约 50 个性能反模式（async/内存/字符串/LINQ/正则/序列化/IO），分级出修复 |
| dotnet-trace-collect | `references/performance-diag.md` | 生产高 CPU/内存泄漏/慢请求/挂起/网络/程序集加载——按环境矩阵选 trace 工具与采集命令 |
| dump-collect | `references/performance-diag.md` | CoreCLR/NativeAOT 崩溃自动 dump 配置或运行中进程抓 dump（含容器）；采完即止不分析 |
| microbenchmarking | `references/performance-diag.md` | 任何 BenchmarkDotNet 任务：对比轴、成本预设、项目搭建、运行与评审 |
| clr-activation-debugging | `references/performance-diag.md` | .NET Framework mscoree 激活失败/选错 CLR 版本/意外 FOD 弹窗/v2+v4 同进程 |
| android-tombstone-symbolication | `references/crash-symbolication.md` | MAUI/Mono Android tombstone 原生帧解析到运行时源码行（BuildId+llvm-symbolizer） |
| apple-crash-symbolication | `references/crash-symbolication.md` | Apple 平台 .ips 崩溃日志 .NET 帧符号化（UUID+dSYM+atos），含从设备取日志 |
| migrate-dotnet8-to-dotnet9 | `references/version-upgrade.md` | net8.0→net9.0 升级并解决 C#13/runtime/ASP.NET/EF9 全部破坏性变更 |
| migrate-dotnet9-to-dotnet10 | `references/version-upgrade.md` | net9.0→net10.0 升级（SIGTERM、Sqlite 时区、OpenApi v2、Linq.Async、Debian→Ubuntu） |
| migrate-dotnet10-to-dotnet11 | `references/version-upgrade.md` | net10.0→net11.0 升级（C#15、硬件基线、BackgroundService 停 host、OpenApi v3；预览期） |
| dotnet-breaking-changes | `references/version-upgrade.md` | 改 NuGet 库/多目标/IVT/生成 partial 等调用方不受控的代码；"is this PR breaking?" |
| dotnet-aot-compat | `references/aot-nullable.md` | 让项目 AOT/裁剪兼容：系统性消除 IL2026/2067/2070/2072/3050 警告 |
| migrate-nullable-references | `references/aot-nullable.md` | 项目级或逐文件启用可空引用并零行为变更地解决 CS86xx |
| thread-abort-migration | `references/aot-nullable.md` | Framework→modern 后 Thread.Abort/Interrupt/Response.End → 协作式取消 |
| process-api-net11 | `references/new-runtime-apis.md` | net11.0+ 进程编排：Run/RunAndCaptureText/StartAndForget/KillOnParentExit/InheritedHandles |
| system-text-json-net11 | `references/new-runtime-apis.md` | net11.0+ JsonNamingPolicy.PascalCase、泛型 GetTypeInfo\<T\>、TryGetTypeInfo |
| exp-mock-usage-analysis | `references/new-runtime-apis.md` | 审计 mock 配置：沿生产路径找死/不可达/冗余/可替换 mock（Moq/NSubstitute/FakeItEasy） |
| exp-test-maintainability | `references/new-runtime-apis.md` | 找测试套件重复：copy-paste 方法转数据驱动、共享 setup/断言/基础设施候选 |

## 全局门禁

- **升级六步不可跳**：当前 TFM 先建干净基线；每步边界各提交一次；破坏变更信息从分域参考来不搜网页（CVE 例外）；一次迁移一件事（TFM/框架/runner 不混）。
- **API 兼容**：动手前先勘察隐藏面（PublicAPI 门、多目标、生成物、IVT）；绿色构建≠不破坏；偏离字面请求必须输出 Compatibility 因果声明；`EnablePackageValidation` 要 `dotnet pack` 才验证。
- **AOT**：IL 警告绝不 `#pragma`/`UnconditionalSuppressMessage` 抑制；警告驱动流程，不先探索代码库；调用方注解 ⊇ 被调方。
- **可空**：零运行时行为变更——只动注解/属性/`!`/指令；绝不 `return null!`；行为修复不进注解提交。
- **诊断采集**：按环境矩阵选工具；dump-collect 采完即停不分析；符号化停在解析出的回栈——不装 LLVM/Xcode、404 每 BuildId 一次即止。
- **BDN**：写代码前必读参考（训练数据大量过时）；输出重定向到文件；`--job Dry` 先行；加包不写版本号。
- **边界**：构建性能与 binlog → `dotnet-build`；测试框架/运行器迁移与测试编写 → `dotnet-test`；语言无关架构评估 → `code-quality`；C# 语言开发与 Web API → `dotnet-dev`。
