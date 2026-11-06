# MSBuild 诊断：binlog、路径冲突、复制、反模式

蒸馏自源技能：binlog-generation、binlog-failure-analysis、troubleshoot-binlog-mcp、check-bin-obj-clash、copy-to-output-directory、resolve-project-references、msbuild-antipatterns。

## 1. 生成 binlog（源：binlog-generation）

任何 MSBuild 命令（`dotnet build/test/pack/publish/restore`、`msbuild`）都应带 `/bl:{}` 采集——这是硬性要求。`{}` 占位符自动替换为唯一标识（需 MSBuild 17.8+/.NET 8 SDK+），两次构建永不互相覆盖。

```bash
dotnet build /bl:{}
dotnet test /bl:{}
```
PowerShell 必须整体加引号：`dotnet build '-bl:{}'`。

规则：
- 一次构建 = 一个 binlog：多配置、多工程、重试失败构建，每条命令各自 `/bl:{}`；禁止裸 `/bl`（固定覆盖 msbuild.binlog）。
- 构建后确认 `.binlog` 真的产生（MSBuild 启动前就失败的构建不会写日志），记下路径供分析。
- 需预知文件名（CI 工件上传）或旧版无 `{}`：先查目录已有 `*.binlog`，取不冲突的新名。
- `git clean` 必须排除 binlog 保留历史：`git clean -fdx -e "*.binlog"`。
- 二进制与回放日志默认留在本地，未经授权不共享。

## 2. 分析失败构建（源：binlog-failure-analysis）

前提：已有 `.binlog`。`.binlog` 是二进制格式——**禁止** cat/head/strings/直接读取。

首选 **binlog MCP**（`Microsoft.AITools.BinlogMcp`，`binlog` 命名空间）：用结构化工具查错误/警告、属性与值、项（PackageReference/ProjectReference）、工程评估数据、目标执行细节、日志内嵌文件内容。不确定有哪些工具先 `tools/list`。约束：原始源/工程文件可能不在磁盘上——找不到的 .csproj/.props/.targets 只能从 binlog 内读取；边查边综合，证据足够即给结论，宁可给带清晰推理的部分答案也不要超时。

MCP 连不上：需要修复启动走第 3 节；修复被阻止/不必要 → 回退 **binlog 回放**：

```bash
dotnet msbuild build.binlog -noconlog \
  -fl  "-flp:v=diag;logfile=full.log;performancesummary" \
  -fl1 "-flp1:errorsonly;logfile=errors.log" \
  -fl2 "-flp2:warningsonly;logfile=warnings.log"
# PowerShell: -flp:"v=diag;logfile=full.log;performancesummary"（分号加引号）
grep -n -B2 -A2 "CS0246" full.log
grep -i "CoreCompile.*FAILED\|Build FAILED\|error MSB" full.log
```

分析目标：把错误连到负责的工程实例/目标/任务；区分根因与级联失败；回放成功与回放耗时不代表原构建的结果/耗时。修复后重跑原始失败场景并检查受影响下游；只有日志时给出带证据的建议修复并声明"未应用/未重建"。

## 3. binlog MCP 启动故障（源：troubleshoot-binlog-mcp）

诊断**服务器启动**，与日志内构建错误无关，无需 binlog。出厂命令：`dotnet dnx Microsoft.AITools.BinlogMcp --yes --prerelease`（需 .NET 10+ SDK）。

流程：
1. **确定失败面**：服务器已连接且工具可见 → 停止排障继续原分析。仅 `CONNECTION_CLOSED` 只说明传输关闭，不直接等于"包缺失"。插件未安装/无服务器注册 → 先处理宿主配置。无执行/日志可用 → 说明限制并给用户下一步命令，绝不谎称查过日志或修好连接。
2. **匹配工作区与 SDK**：从受影响工作区（不是插件目录/临时目录）用宿主环境跑 `dotnet --info`、`dotnet --version`、`dotnet nuget list source`；查 `global.json` 与继承的 NuGet 配置（`clear` 可能把 nuget.org 换成缺该包的私有镜像）、`packageSourceMapping`。已装 SDK ≠ 该目录选中的 SDK。凭据、私有源 URL、token 不得进入回答（脱敏报告）。
3. **抓真实启动错误**：原样复现宿主启动命令一次（stdout+stderr+退出码），初始不要加 `--source`、改配置、删 global.json、清缓存。stdio 服务器可能挂起等协议输入——保持 stdin、限时约 30 秒、只清理诊断进程树；超时/静默/进程存活**不是**初始化成功的证据。包可用性存疑才跑辅助探针：`dotnet package search Microsoft.AITools.BinlogMcp --exact-match --prerelease --format json`（退出 0 ≠ 搜索成功；查 searchResult 与 per-source problems）。
4. **证据→结论**：dnx 报无匹配版本→配置源未解析到包，查镜像是否镜像了 prerelease；搜索无果且无 problems→仅说明所查源没有，缓存工具/未列出版本仍可能可用；401/403/TLS/凭据错误→"可用性未证实"而非"包缺失"，先修访问；搜索有包但 dnx 失败→按启动错误查映射/下载权限/运行时，不宣布健康；缺 dotnet/dnx 不识别/SDK 选择错误→修宿主 PATH/global.json（别悄悄升级仓库 SDK 钉）；超时/输出畸形→报告探针不确定。
5. **政策安全恢复**（最小改动）：请源所有者镜像该包及依赖到获批源；修认证/连通/证书（永不建议关闭证书校验）；仅在组织政策允许且用户批准时加 nuget.org——不删 `clear`、不禁源映射绕过策略；获批源安装工具并注册 `binlog-mcp` 可执行（避免重复注册；装了≠连上了）。改 NuGet 设置/宿主注册/SDK 钉前必须用户批准。政策阻断恢复就明说；有现成 binlog 时提供第 2 节回放回退，不让构建诊断卡在 MCP 修复上。
6. **验证与报告**：宿主支持的方式重连后确认工具列表含 `binlog_overview` 等。结尾一行状态：`MCP status: connected|failed|unverified`——只有宿主发现工具后才写 connected。

## 4. bin/obj 路径冲突（源：check-bin-obj-clash）

症状：`Cannot create a file when that file already exists`（restore 期，强烈指向共享 IntermediateOutputPath 上写 project.assets.json）、`The process cannot access the file because it is being used by another process`、重试即过的间歇失败、多工程/多 TFM 输出丢失互覆。

检测（先按第 1 节采集 binlog）：
- MCP 路径：overview/projects 列工程 → evaluations + evaluation_global_properties 找同工程多实例与差异全局属性 → properties 工具查每个评估的 `OutputPath/IntermediateOutputPath/BaseOutputPath/BaseIntermediateOutputPath` → `double_writes` 直接找多实例写同一文件 → 规范化绝对路径、按路径分组，**排除 `BuildProjectReferences=false`**（P2P 元数据查询，不写输出）及 OutputPath 组里 `MSBuildRestoreSessionId` 的 restore 评估；组内 >1 即冲突。
- 文本回退：回放 diag 后 `grep 'Evaluation started' full.log | grep -oiE '"[^"]+\.[a-z]+proj"' | sort | uniq -c`（按完整引号路径计数，≥2 为多评估）；`grep -iE 'OutputPath\s*=|IntermediateOutputPath\s*=|Base(Output|Intermediate)OutputPath\s*=' full.log | sort -u`；或 `dotnet msbuild MyProject.csproj -getProperty:OutputPath`；佐证：`Target "CopyFilesToOutputDirectory"` + `SkipUnchangedFiles`、长 vs ~0ms 的 CoreCompile 区分真实构建与冗余实例。

常见成因与修复：
1. **多 TFM 但路径不含 TFM**：`OutputPath` 写死 `bin\$(Configuration)\` → 加 `$(TargetFramework)` 或靠 SDK 默认 `AppendTargetFrameworkToOutputPath`。
2. **跨工程共享 Base 输出目录**（AppendTargetFramework 救不了——project.assets.json 直接写在 IntermediateOutputPath）：每工程唯一 `BaseIntermediateOutputPath`，或干脆用 SDK 默认。
3. **多 RID 冲突**：`AppendRuntimeIdentifierToOutputPath=true`。
4. **一次构建跑多个解决方案含同一工程**：`SolutionFileName` 不同、`CurrentSolutionConfigurationContents` 条目数不同而 OutputPath 相同 → 合并解决方案/不同 Configuration/解决方案筛选排除重复工程。
5. **路径中性的额外全局属性造冗余实例**（如 `PublishReadyToRun=false` 传给 netstandard2.0 库）：来源处不传；或 ProjectReference 上 `RemoveGlobalProperties="PublishReadyToRun"`；或按工程条件设置。
6. **`<MSBuild>` 任务带路径中性全局属性 fork 实例**（AP-22）：publish-on-build 目标 `Properties="_IsPublishing=true"` 自调用，或消费者工程对生产者调 Publish——两个实例共享 bin/obj 并发写（NativeAOT `*.sourcelink` 等）。修复（同工程）：标志改静态属性 + `DependsOnTargets="Publish"` 走同一实例 + `_PublishWasInvokedDirectly` 守卫防入口循环；（跨工程）生产者自己构建内发布，消费者仅 `ReferenceOutputAssembly="false"` 排序并读输出。
7. **`SetTargetFramework` 向单 TFM 工程重注其自身 TFM**（AP-23）：路径中性 → 与 `(project, {})` 实例同路径双写。删除冗余 `SetTargetFramework` 即可。合法场景：引用多 TFM 工程选一个 TFM；覆盖为*不同* TFM（路径随之变化不冲突）；框架不兼容引用须 `SkipGetTargetFrameworkProperties="true"` + `ReferenceOutputAssembly="false"`，并防止引用方自己的 TargetFramework 全局属性漏入被引工程——`SetTargetFramework` 钉住 **或** `UndefineProperties="TargetFramework"` 剥离（二选一，不同时用）。

全局属性速查：影响 OutputPath 的 = TargetFramework、RuntimeIdentifier、Configuration、Platform；不影响但造独立实例的 = Solution* 系列、`BuildProjectReferences`（false 忽略）、`MSBuildRestoreSessionId`、`PublishReadyToRun`、`_IsPublishing`。修复后 clean+重建验证（clean 时按第 1 节保留 binlog）。

## 5. CopyToOutputDirectory 模式选择（源：copy-to-output-directory）

| 模式 | 何时复制 | 增量成本 | 用途 |
|---|---|---|---|
| `Never`（默认） | 从不 | 无 | 运行时不需要 |
| `PreserveNewest` | 源比目标新（或目标缺失） | 低（时间戳） | 常见情形 |
| `Always` | 每次构建无条件 | 高——no-op 也复制 | 遗留权宜，应避免 |
| `IfDifferent`（MSBuild 17.13+/.NET SDK 9.0.2xx+） | 源与目标任一侧更新或大小不同 | 低（时间戳+大小） | 目标文件会被构建间修改 |

- `Always` 的历史用途：目标被测试/应用改写（SQLite、状态文件、可编辑配置）后 `PreserveNewest` 不会恢复源版本。`IfDifferent` 是该场景的对症修复（内部用 `Copy SkipUnchangedFiles="true"`，启发式=时间戳+大小，非内容哈希——同大小同时间戳的改动会被判"未变"）。
- 存量大量 `Always` 想拿性能不逐条改：`<SkipUnchangedFilesOnCopyAlways>true</SkipUnchangedFilesOnCopyAlways>`（Directory.Build.props 全仓库生效；默认 false 保持旧语义）。
- 机制：`GetCopyToOutputDirectoryItems` 按值分桶，三个复制目标执行（PreserveNewest/Always/IfDifferent 各一），复制文件都注册 `FileWrites`；Always/PreserveNewest/IfDifferent 项经 `_CopyToOutputDirectoryTransitiveItems` 流向引用工程，Never 不流。
- 版本门槛：旧工具集上 `IfDifferent` 值不被识别——条件不匹配，项**静默不复制**。需兼容旧 SDK 时按工具集门控，或 `global.json` 要求最低 SDK。

## 6. ResolveProjectReferences 耗时误导（源：resolve-project-references）

Target Performance Summary 里 `ResolveProjectReferences` 常显示为最贵目标（50–80% 总时长）——**不要直接优化它**。该时间包含等待依赖工程构建的墙钟时间，期间节点已让出并可做别的工程（dotnet/msbuild#3135）；目标自身几乎不干活。

正确姿势：看 **Task** Performance Summary 的任务自时（MCP expensive_tasks，或回放后 `grep "Task Performance Summary" -A 50 full.log`），把真实瓶颈定位到 Csc（分析器）、ResolveAssemblyReference、Copy 等任务并路由到 `msbuild-perf.md` 对应小节。验证：用了 Task 摘要、没把 ResolveProjectReferences 当优化对象、点名了具体任务瓶颈。

## 7. MSBuild 反模式目录（源：msbuild-antipatterns）

评审/审计工程与构建文件时按此目录扫描。评审输出契约：未获明确要求不改文件；给按优先级排序、有证据、分"确认缺陷/条件风险/已正确"的发现。

| # | 反模式 | 要点/修复 | 级别 |
|---|---|---|---|
| AP-02 | 条件不加引号 `$(X) == Y` | 空值/空格即坏；两侧单引号 | 🔴 |
| AP-19 | 属性求值期副作用（写文件/网络） | 求值可能多次运行（设计期构建）；副作用移 Target | 🔴 |
| AP-21 | `.props` 中属性条件依赖 TargetFramework | 单 TFM 工程静默失效；移 `.targets` 或工程内。**ItemGroup/项/Target 条件不受影响**（PackageVersion/PackageReference 条件在 props 中合法，勿误报） | 🔴 |
| AP-22 | `<MSBuild>` 以路径中性全局属性 fork 工程实例 | 双实例同 bin/obj 竞争；见第 4 节修复 | 🔴 |
| AP-23 | `SetTargetFramework` 重注单 TFM 工程自身 TFM | 路径中性双构建；见第 4 节 | 🔴 |
| AP-03 | 硬编码绝对路径 | `$(MSBuildThisFileDirectory)`、`NormalizePath`、`GetDirectoryNameOfFileAbove` | 🔴 |
| AP-06 | `<Reference>` HintPath 引 NuGet 包 | 改 `PackageReference`；无 HintPath 的 `<Reference>` 用于 GAC 框架程序集仍合法 | 🟡 |
| AP-07 | 分析器/工具包缺 `PrivateAssets="all"` | 泄漏到消费者 | 🟡 |
| AP-11 | 自定义目标缺 Inputs/Outputs | 每次全跑；见 msbuild-perf.md 第 4 节 | 🟡 |
| AP-13 | Import 无 `Exists()` 守卫 | 可选导入须守卫；**例外**：必需导入应快速失败不加守卫；NuGet 包 build/buildTransitive 内导入是包契约——先按 extension-points"源码树 vs 打包布局"核对 nuspec `<file target>` 与 `PackagePath` 再判 | 🟡 |
| AP-05 | SDK 风格工程手工列 Compile | 删掉，用 Remove/Exclude 退出；例外：旧式工程必须显式列；**F# 必须按依赖顺序显式列全部源文件**（.fsi 紧跟其 .fs） | 🔵 |
| AP-04 | 复述 SDK 默认值 | 只写非默认值 | 🔵 |
| AP-08 | 多 csproj 复制粘贴属性 | 收进 Directory.Build.props | 🔵 |
| AP-09 | 包版本散落漂移 | CPM（nuget.md） | 🔵 |
| AP-01 | `<Exec>` 干内建任务的活 | mkdir→MakeDir、copy→Copy、del→Delete、move→Move、echo→WriteLinesToFile、touch→Touch | 🔵 |
| AP-14 | 跨平台路径反斜杠 | 仅"绕过 MSBuild 求值器原样交给 shell/外部消费者"的字符串是 🔴（Exec Command、CDATA、响应文件）；Import/属性/项 glob 走求值器会规范化，是 🔵 风格 | 🔵 |
| AP-10 | 巨型目标（50+ 行多职责） | 拆单职责目标各配 Inputs/Outputs | 🔵 |
| AP-12 | 默认值写在 .targets | .props 放默认（早求值），.targets 放逻辑 | 🔵 |
| AP-15 | 多作用域无条件覆盖同一属性 | 加 `Condition="'$(X)' == ''"` 使覆盖有意 | 🔵 |
| AP-16 | `<Exec>` 做字符串/路径运算 | 属性函数 `$(V.Replace(...))`、`[MSBuild]::NormalizeDirectory` | 🔵 |
| AP-17 | 同一 ItemGroup 混 Include+Update | Update 看不到同组未处理的 Include；拆两组 | 🔵 |
| AP-18 | 冗余传递 ProjectReference | 只留直接依赖；确实直接使用类型则保留 | 🔵 |
| AP-20 | 平台特定 Exec 无 OS 守卫 | `Condition="!$([MSBuild]::IsOSPlatform('Windows'))"` | 🔵 |

扫描顺序：先 🔴（AP-02/19/21/22/23/03），再 🟡，再 🔵。
