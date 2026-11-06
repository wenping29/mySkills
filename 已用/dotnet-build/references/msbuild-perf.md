# MSBuild 构建性能

蒸馏自源技能：build-perf-baseline、build-perf-diagnostics、eval-performance、incremental-build、build-parallelism、eliminate-redundant-restores。

总流程：先用 baseline 建立可信测量 → 用 diagnostics 定位瓶颈 → 按测量结果走对应分支（评估/增量/并行/复制/restore）。没有测量不优化；孤立的一次快跑不构成证据。

## 1. 基线测量（源：build-perf-baseline）

三种场景各至少跑 3 次，报告中位数与波动范围，binlog 唯一命名且存放到生成目录之外：

| 场景 | 每次采样前的设置 | 期望表现 |
|---|---|---|
| 冷构建 | 恢复同一源码状态，`dotnet clean` + 删除已确认、可丢弃的输出目录（含自定义 artifacts 路径，需批准），验证输出不存在后再计时；`dotnet build /bl:cold-build-1.binlog -m` | 全量编译，绝对基线 |
| 热构建 | 先非计时构建成功，再对同一文件施加同一处小编辑后计时；编辑不累积 | 仅变更工程重编，耗时与改动范围成比例 |
| No-op | 非计时设置构建后，不做任何改动立即再构建 | 编译与正确增量的目标应跳过 |

注意：这是"输出冷"构建，不等于 NuGet/OS/编译器服务器缓存冷；缓存策略全程一致，不清共享缓存；测无缓存 restore 用独立空包缓存。失败构建的计时不能当成功基线。

红旗：no-op 时间反复接近热/冷，或编译目标重跑 → 查增量（第 5 节）；热构建全量重编 → 依赖链强制全量；restore 主导冷构建 → 分开测 `dotnet restore` 与 `dotnet build --no-restore`。不要用通用阈值宣布瓶颈，与自家受控样本和 target/task 计时对比排序。

分析器证据：`dotnet build /bl:analyzers.binlog /p:ReportAnalyzer=true`（Structured Log Viewer 看 Csc 下分析器汇总）；不支持时以 `/p:RunAnalyzers=false` 的同构样本做归因实验——禁用分析器不是修复，CI 必须保留分析器强制。

### 系统性优化手段

- **Artifacts 布局（.NET 8+）**：`<UseArtifactsOutput>true</UseArtifactsOutput>`（Directory.Build.props），输出集中到 `artifacts/bin/<proj>/<cfg>`、`artifacts/obj/...`；无 bin/obj 冲突、CI 只缓存一个目录、多 TFM 各自子目录。
- **确定性构建**：`Deterministic=true`（SDK 2.0+ 默认开）+ `<ContinuousIntegrationBuild Condition="'$(CI)'=='true'">true</ContinuousIntegrationBuild>`；同输入字节级同输出，是构建缓存/分布式复用的前提。
- **依赖图修剪**：删冗余传递 ProjectReference（Core 已含 Utils 就不再直引）；仅构建顺序依赖用 `ReferenceOutputAssembly="false"`；内部实现细节不外泄用 `PrivateAssets="all"`；超大仓库极端手段 `DisableTransitiveProjectReferences=true`（要求全部显式声明）。
- **静态图构建 `/graph`**：先构建完整依赖图再编译，调度更优、构建隔离、可缓存。适用 20+ 工程大解决方案与 CI；<5 工程不值得。要求所有 ProjectReference 静态可声明（不在 target 内动态生成），否则 `MSB4260`。
- **并行度调节**：`-m` / `-m:N`（见第 6 节）。
- 快速开关：CI 中 restore 与 build 分离（`dotnet restore` → `dotnet build --no-restore -m` → `dotnet test --no-build`）；`/p:GenerateDocumentationFile=false`；只构建当前工程而非整个解决方案。

### 决策树

no-op 异常接近热/冷或编译重跑？→ 增量（第 5 节）。冷构建慢：restore 慢→NuGet 缓存/lock 文件；编译慢→分析器慢→diagnostics，否则并行/关键路径；再查自定义目标。热构建慢→增量。都健康→仅在有测量需求时采纳 graph/artifacts。

## 2. 瓶颈诊断（源：build-perf-diagnostics）

方法：`dotnet build /bl:{} -m` 生成 binlog → 首选 binlog MCP 服务器（`Microsoft.AITools.BinlogMcp`，`binlog` 命名空间）查 expensive_projects/expensive_targets；MCP 不可用时回退文本回放：

```bash
dotnet msbuild build.binlog -noconlog -fl "-flp:v=diag;logfile=full.log;performancesummary"
grep "Target Performance Summary\|Task Performance Summary" -A 50 full.log
grep -i "node.*assigned\|building with\|scheduler" full.log | head -30      # 节点利用率
grep -i "analyzer.*elapsed\|Total analyzer execution time\|CompilerAnalyzerDriver" full.log
```

### 关键指标

- 单目标 >50% 构建时间 → 深查；节点利用率理想 >80%。
- 分析器应 <30% Csc 时间；RAR >5s 可疑、>15s 病态。
- 报告时按影响分级：>10% 或单目标>50% = 高；2–10% = 中；属性开关类 = 快赢。

### 常见瓶颈与修法

1. **RAR 慢**：引用过多/网络搜索路径。减引用数、`ResolveAssemblyWarnOrErrorOnTargetArchitectureMismatch` 等；RAR 即使增量也无条件运行（可能装了 targeting pack/GAC）。减传递引用（`DisableTransitiveProjectReferences`、`ReferenceOutputAssembly="false"`）、裁剪无用 PackageReference。
2. **Roslyn 分析器/源生成器**：Csc 超预期（>2× 干净编译）。条件禁用：`<RunAnalyzers Condition="'$(ContinuousIntegrationBuild)' != 'true'">false</RunAnalyzers>` 或按 Debug 配置；`EnforceCodeStyleInBuild` 条件于 CI；`GlobalPackageReference` 分析器会作用于全部工程（测试工程是否需要？）；原则：CI 保留强制，永不"直接删除"分析器。
3. **串行化**：时间集中单工程、节点闲置 → 拆大工程、优化关键路径、`BuildInParallel`。
4. **文件 I/O（Copy 过多）**：硬链接 `<CreateHardLinksForCopyFilesToOutputDirectoryIfPossible>true</...>`、`SkipCopyUnchangedFiles`、减少 CopyToOutputDirectory 项、`UseCommonOutputDirectory`、`--artifacts-path`；Copy 意外逐项批处理而非单批（dotnet/msbuild#12884）；Windows Dev Drive（ReFS 写时复制+少扫描）对开发机与自托管 CI 均有效。复制模式选择见 `msbuild-diagnosis.md` 第 5 节。
5. **评估开销**：编译未开始就慢——复杂 Directory.Build.props、glob 扫大目录、NuGetSdkResolver 每工程 +180–400ms。见第 3 节。
6. **构建内 restore**：分离 restore/build；大构建开 `<RestoreUseStaticGraphEvaluation>true</RestoreUseStaticGraphEvaluation>`。多步骤重复 restore → 第 7 节。
7. **工程数量与图形状**：宽图快于深图；合并小叶子工程或拆瓶颈工程，`/graph` 改善调度。

## 3. 评估阶段性能（源：eval-performance）

评估发生在任何 target 运行前，5 个阶段：初始属性 → 导入与属性求值 → ItemDefinition → Item 求值（glob 展开）→ UsingTask。评估慢 = 构建启动慢，即使无事可编译。

**先确认再动手**：无 binlog/计时摘要证明评估是瓶颈就不要改；模式存在但评估已经快 → 只作为观察报告，不重写可用配置。

诊断：
- binlog MCP：evaluations / evaluation_global_properties / imports 工具。
- 回退：回放 diag 日志 grep `Evaluation started|finished`；同一工程多次评估=过度构建。
- `dotnet msbuild -pp:full.xml MyProject.csproj`：预处理输出 >10K 行 = 求值很重；搜 `<!-- Importing` 看导入树。
- `/clp:PerformanceSummary`：评估耗时与执行分列。

优化清单：
- 昂贵 glob（`**/*.cs` 扫 node_modules/.git/bin/obj）→ `<DefaultItemExcludes>` 排除大目录；glob 路径写具体（`src/**/*.cs`）；`EnableDefaultItems=false` 是最后手段。
- 深导入链（>20 层）→ 减传递包导入、合并导入。
- 多次评估 → 归一化全局属性、用 `/graph`。
- 求值期属性函数做文件 I/O（`$([System.IO.File]::ReadAllText(...))`）、网络调用 → 移入目标；属性函数应快且无副作用。
- `TreatAsLocalProperty` 只用于真正需要覆盖继承属性的场景。

## 4. 增量构建机制（源：incremental-build）

带 `Inputs`/`Outputs` 的目标：全部输出新于全部输入则整体跳过；缺任一属性则每次都运行（最常见病因）。基于时间戳而非内容哈希——touch 即触发重建。

### 增量失效的 8 大原因

1. 自定义目标缺 Inputs/Outputs；2. 输出路径含易变值（时间戳/GUID/构建号）→ 永远找不到旧输出；3. 写了 Outputs 未跟踪的文件；4. 缺 `FileWrites` 注册（clean 不清、陈旧文件干扰检查）；5. 增删源文件改变 glob 项集（预期行为）；6. 进入 Inputs/Outputs 的属性变化（Debug↔Release 全量是设计使然）；7. NuGet 包版本变化更新 project.assets.json 与解析路径；8. VBCSCompiler 服务器回收后首次构建变慢（增量检查仍通过）。

### 诊断"为什么重编"

两次无改动构建取证：

```bash
dotnet build /bl:first.binlog
dotnet build /bl:second.binlog -fl "-flp:v=diag;logfile=second-full.log;performancesummary"
grep 'Building target\|is newer than output' second-full.log
```

关键消息：`Building target 'X' completely`（输出缺失/全不全）；`incrementally`（部分过期）；`Skipping target ... up-to-date`（正确跳过）；`is newer than output` 直接点名触发文件。

每个重跑目标必须报告的检查清单：最新输入 vs 最旧输出的实际时间戳；每个声明输出在第二次构建前存在且未被删/重写；Inputs 完整（含动态/易变输入——生产者每次重写则修生产者"内容不变不写"，如 `WriteLinesToFile Overwrite="true" WriteOnlyWhenDifferent="true"`；`Overwrite="true"` 本身不是重跑理由）；两次构建解析出的路径稳定一致；批处理时输入↔输出 1:1 映射核对；两次无改动构建的第二次跳过证据。缺 Inputs/Outputs 时报告"增量机制未启用"，而非"未验证时间戳"。未经用户要求不修改工程。

### FileWrites 与 VS FUTDC

- `FileWrites`：注册构建创建的文件供 clean 删除；跨工程共享生成文件用 `FileWritesShareable`。
- VS 的 Fast Up-to-Date Check 独立于 MSBuild 增量，只看已知项类型时间戳——"VS 里重编、命令行不重编"的根源。自定义生成/动态项会让 FUTDC 误判；`<DisableFastUpToDateCheck>true</DisableFastUpToDateCheck>` 强制走 MSBuild 检查；VS 日志：Tools→Options→SDK-Style Projects→Up-to-date Checks=Verbose。

增量目标范本：`Inputs="$(MSBuildProjectFile);@(ConfigInput)"`、`Outputs="$(IntermediateOutputPath)config.generated.cs"`、`BeforeTargets="CoreCompile"`、内部注册 `FileWrites` + `Compile`。传值而不引入增量依赖时用 `Returns` 而非 `Outputs`。

## 5. 并行度（源：build-parallelism）

模型：`/maxcpucount`(`-m`)=工作节点数；`dotnet` CLI 各命令默认多节点，`-m:1` 单节点；直接 `MSBuild.exe` 默认串行需显式 `-m`。每节点一次构建一个工程，按依赖图拓扑调度。

慢并行构建检查清单（按序）：
1. binlog 看节点时间线是否真的多节点在构建。
2. 找关键路径：总时间 ≈ 某依赖链各工程之和 → 瓶颈是链不是核数。
3. 明确点名链（`Core → Api → Web → Tests`）。
4. 找拉长链的不必要 ProjectReference（只需构建顺序、或可改 PackageReference）。
5. 建议扁平化：断伪依赖使独立工程并发，考虑 `/graph`。

宽图（多独立工程）并行好，深图差。诊断：binlog MCP expensive_projects/expensive_targets/project_target_times；回退文本回放看 Project Performance Summary，构建时间 ≈ 工程时间之和即串行过度。

参考项优化：`SkipGetTargetFrameworkProperties="true"` 减少额外评估；`ReferenceOutputAssembly="false"` 表构建顺序依赖；`.slnf` 构建子集；自定义 `<MSBuild Projects=... BuildInParallel="true"/>`（需 /maxcpucount>1）；实现 `IMultiThreadableTask` + `[MSBuildMultiThreadableTask]` 的任务可线程内并行。CI：`-m`、分阶段构建、NuGet lock/确定性构建缓存。只在证明依赖不必要后才删——慢但合法的依赖保留。

## 6. 消除重复 restore（源：eliminate-redundant-restores）

no-op restore 仍评估全部工程，大仓库每次多花数秒到数十秒。`--no-restore` 加到没有被先前 restore 覆盖的步骤会把慢构建变成失败构建——必须先证明覆盖。

适用：流水线多步骤都打印 `Determining projects to restore...`；`Directory.Build.rsp` 或安装级 `MSBuild.rsp` 含 `-restore`；加 `--no-restore` 后出现 NETSDK1004/NETSDK1047。不适用：首次 restore 慢（那是缓存不是冗余）、只有 1 次 restore、版本/lock 错误（修 restore 本身）、未排序的整体慢（回第 1 节）。

工作流：
1. **确认重复且值得**：日志或 binlog（restore 评估带全局属性 `MSBuildRestoreSessionId`+`ExcludeRestorePackageImports=true`；Target Performance Summary 中 Restore 调用 N 次）。重复总量约 1 秒 → 报告"无可删"并停止。
2. **按执行顺序清点调用**：`dotnet build/test/publish/pack` 隐式 restore 除非 `--no-restore`，还要查继承的 rsp 标志；`dotnet msbuild`/`msbuild.exe` 只认 `-restore:false`（无 `--no-restore`）；`--no-build` 的 test/publish 无隐式 restore 但 rsp `-restore` 仍可能生效，需 `--no-restore -restore:false`。SDK 9.0.1xx 起 `--no-restore` 会转发 `-restore:false`；更旧 SDK 不会。`dotnet run` 不暴露 `-restore:false`：旧 SDK 遇 rsp 时先 `dotnet build --no-restore -restore:false` 再 `dotnet run --no-build`。
3. **逐步判定**，保留第一次 restore；后续步骤四项检查全过才跳过：**同一工程集**（restore 覆盖其入口工程/解决方案的 ProjectReference 闭包；另一 sln/.slnf/编排 `.proj` 经 MSBuild 任务构建的子工程不被覆盖→NETSDK1004）；**同一 restore 输入**（`-r/--runtime`、`-a/--arch`、`--os`、`--use-current-runtime`、TFM、RID、PublishAot、包源、影响 PackageReference 条件的 `-p:`——publish `-r linux-x64` 需 `restore -r linux-x64`，否则 NETSDK1047）；**同一 restore 状态**（project.assets.json 位置一致：`--artifacts-path`/`UseArtifactsOutput`/`MSBuildProjectExtensionsPath` 必须对齐）；**中间无包变更**（生成器/`dotnet add package`/重写 Directory.Packages.props 之后必须重新 restore）。
4. **最小改动**：一次显式 restore 携带全部输入，后续步骤 `--no-restore`/`-restore:false`/`--no-build`。多个 `dotnet test` 同一解决方案：build 一次 + 各步 `--no-build`。rsp 里的 `-restore` 保留（服务开发者），按调用覆盖。永不删第一次 restore（若是 `--locked-mode` 门禁就留在那）。不要把静态图 restore/包缓存捆绑进此改动。

```bash
dotnet restore MyApp.sln -r linux-x64
dotnet build MyApp.sln -c Release --no-restore -restore:false
dotnet test MyApp.sln -c Release --no-build --no-restore -restore:false
dotnet msbuild Packaging.proj -t:Pack -restore:false
```

5. **验证**：干净临时副本（无 obj/、无 assets 文件）端到端跑改动后的流水线；YAML 语法/标志存在性检查不算验证。无法运行就说"未验证"并列出待确认步骤。NETSDK1004/1047 属 restore 失败，与构建失败分开报告，不得宣称成功。
