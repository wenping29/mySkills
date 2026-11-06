# 性能反模式扫描、生产诊断采集与微基准

蒸馏自源技能 `analyzing-dotnet-performance`、`dotnet-trace-collect`、`dump-collect`、`microbenchmarking`、`clr-activation-debugging`。覆盖：代码级性能反模式扫描、生产 trace/dump 采集工具选择与命令、BenchmarkDotNet 微基准、.NET Framework CLR 激活日志诊断。不用于：崩溃日志符号化→`crash-symbolication.md`；构建性能/binlog→`dotnet-build`；分析已采集的 trace/dump（本文件只负责选工具与采集，分析另议）；.NET Framework 的 dump 采集不在 dump-collect 支持范围。

## 0. 症状路由

| 用户问题 | 小节 |
|---|---|
| 审代码找性能优化点/分配热点 | §1 |
| 生产高 CPU/内存泄漏/慢请求/挂起/网络错误/程序集加载失败 → 用什么工具采数据 | §2 |
| 启用崩溃自动 dump / 抓运行中进程 dump | §3 |
| BenchmarkDotNet 基准编写、运行、对比 | §4 |
| .NET Framework 启动失败/FOD 弹窗/CLR 版本选错 | §5 |

## 1. 性能反模式扫描（analyzing-dotnet-performance）

扫描约 50 个反模式（async、内存、字符串、集合、LINQ、正则、序列化、I/O），产出分级结论与具体修复。不用于：算法复杂度分析；无性能要求的非热路径代码（避免过早优化）。

**扫描深度**：`critical-only`（仅死锁、>10x 回归）/ `standard`（默认，critical + 命中信号的主题）/ `comprehensive`（全部主题）。

**信号 → 主题**：`async/Task/ValueTask`→异步；`Span</Memory</stackalloc/ArrayPool/Substring/Replace/ToLower/+=循环/params`→内存与字符串；`Regex/[GeneratedRegex]`→正则；`Dictionary</List</.ToList()/LINQ`→集合与 LINQ；`JsonSerializer/HttpClient/Stream`→I/O 与序列化。未密封类检查始终执行。

**核心 grep 配方**（主题参考不可用时兜底，报告精确计数不报估计）：`.IndexOf("`（缺 StringComparison）、`.Substring(`、`.StartsWith|.EndsWith|.Contains(`、`.ToLower()|.ToUpper()`、`.Replace(`、`params `、`.Select|.Where|.OrderBy|.GroupBy`、`new Dictionary<|new List<`、`static readonly Dictionary<`（FrozenDictionary 候选）、`RegexOptions.Compiled|new Regex(|GeneratedRegex`、`public class|internal class` vs `sealed class`。

**规则**：
- <500 行文件先整读再 grep 确认计数；输出扫描执行清单（每个配方+命中数），0 命中也是有效结论。
- **逆验证**：缺失类模式两侧都计数并报比例——0/185 是系统性问题，12/15 是一致性修复；比例决定严重度。
- **跨文件一致性**：某文件用了优化写法，检查同目录/同接口/同基类的兄弟文件是否仍用未优化等价物（🟡，以优化文件为证据）。
- **复合分配**：多分支 `.Replace()` 链按总分配数报；跨方法委托链的中间分配合并为一条；`result += $"...{Foo().ToLower()}"` 是 2+ 次分配；`string.Format` 区分资源字符串（不可修）与字面量（可改插值）。

**分级**：🔴 Critical（死锁/崩溃/安全/>10x 回归，必修）；🟡 Moderate（2-10x，热路径应修）；ℹ️ Info（可能非热路径）。用户指明热路径则其中发现升至最高严重度；热路径未知时 🔴 无条件报、🟡 加注"若在热路径才有影响"。**规模升级**：同一反模式 11-50 处 ℹ️→🟡；50+ 处标系统性问题提升优先级。

**输出格式**：按严重度分组（不按文件）；每条 finding 一个短块 `#### ID. 标题 (N 处)` + Impact 一行 + Files 内联逗号列表 `File.cs:L42` + Fix 一行 + Caveat（仅版本要求/正确性风险等非显而易见时）。平凡修复不写 ❌/✅ 代码块；同一修复的 finding 合并；正向发现用 `✅ 模式 — 证据` 列表。结尾严重度汇总表 + 免责声明（AI 生成非确定性，须经基准与人工复核再应用）。

**误判门禁**：只在构造后不再变更时建议 FrozenDictionary；async 方法用 `Memory<T>` 不用 `Span<T>`；LINQ 只在热路径/紧循环报（.NET 7 起 Min/Max/Sum/Average 已向量化，禁止一刀切）；`ConfigureAwait(false)` 仅对库代码有意义且不是主要性能手段；`ValueTask` 仅热路径高同步完成率；报 `new HttpClient()` 前先查是否已用 `IHttpClientFactory`；`[GeneratedRegex]` 仅编译期常量模式；`CollectionsMarshal.AsSpan` 与 `unsafe` 仅在有基准证据的超热路径。

## 2. 生产诊断采集（dotnet-trace-collect）

只推荐工具与给出采集命令，不做代码审查、不做分析、不做开发期基准。

**输入**：症状、运行时（Framework vs modern，是否 .NET 10+）、OS、部署形态（主机/容器/K8s）、管理员权限、复现特征。若 agent 就在工作负载上下文内可直接代跑命令，否则给命令让用户执行。

**决策矩阵**：

| 环境 | 首选 | 回退/备注 |
|---|---|---|
| Windows + modern + admin | PerfView（慢请求加 `/ThreadTime`） | 无 admin 用 dotnet-trace |
| Windows + .NET Framework + admin | PerfView | 无 admin 无 trace 回退；挂起/泄漏直接给 `procdump -ma <PID>` 或任务管理器（dump-collect 不支持 Framework）；高 CPU/慢请求/过度 GC 无解，建议取得 admin |
| Linux + .NET 10+ + root | `dotnet-trace collect-linux`（perf_events，含原生栈与内核事件，默认机器级无需 PID，内核≥6.4） | 不满足用 dotnet-trace |
| Linux + pre-10 | dotnet-trace | 需原生栈加 perfcollect（root） |
| 容器/K8s 有控制台 | 容器内 dotnet-trace（镜像已装或 kubectl cp） | dump 走 §3 |
| 容器/K8s 无控制台 | dotnet-monitor sidecar | 需认证配置与共享诊断套接字 |

**长复现（Windows/PerfView）**：`/StopOn` 触发器必须**命中症状本身**（`/StopOnPerfCounter`/`/StopOnGCEvent`/`/StopOnException`）+ 环形缓冲 `/CircularMB`+`/BufferSizeMB`；**绝不在恢复时触发**（环形缓冲已覆盖有趣行为）。`/StartOn` 仅当确定先于 stop。慢请求默认不设 stop 触发器。

**按症状配方**：
- **内存泄漏**：增长期采**两个 dump** 在 PerfView diff（最有效）；modern .NET 的 dump 一律走 §3，Framework 直接给 procdump。pre-10 Linux 另加 dotnet-trace（分配跟踪），10+ 加 collect-linux；无需触发器，别等 OOM。
- **过度 GC**：dump 不够，必须 trace——Windows `PerfView collect /GCCollectOnly`；Linux `dotnet-trace collect -p <PID> --profile gc-verbose`；10+ root `collect-linux --profile gc-verbose`；容器 dotnet-monitor `/trace?profile=gc-verbose`。
- **慢请求**：线程时间 trace + 更大缓冲。`PerfView /ThreadTime collect /BufferSizeMB:1024 /CircularMB:2048`；ASP.NET Core 加 `*Microsoft.AspNetCore.Hosting,*Microsoft-AspNetCore-Server-Kestrel`。Linux dotnet-trace 默认含线程时间；10+ `--profile thread-time`。
- **挂起**：先线程时间 trace 区分活锁/线程池饥饿/是否真有进展；解释不了再（§3）采 dump 查死锁环——Windows 用 VS/WinDbg+SOS，Linux 用 lldb+SOS。
- **网络问题**：线程时间 + 四个 provider 都要：`System.Net.Http`（RequestStart/RequestStop(statusCode -1=无响应)/RequestFailed/RequestLeftQueue(池耗尽)/ConnectionEstablished/Closed）、`System.Net.NameResolution`、`System.Net.Security`、`System.Net.Sockets`。Framework 的 `PerfView /ThreadTime` 已含无需加。Linux dotnet-trace 注意 `--providers` 会覆盖默认须同时给 `--profile dotnet-common,dotnet-sampled-thread-time`。
- **程序集加载**：`Microsoft-Windows-DotNETRuntime:0x4:4`（Loader keyword）。PerfView 默认 trace 已含 binder 事件（省文件用 `/ClrEvents:Default-Profile`）；`dotnet-trace collect --clrevents assemblyloader`；启动即退的短命进程用启动形式 `-- <exe路径>` 而非 attach PID。Framework 另可用 fuslogvw.exe。

**Windows 容器**：进程隔离下从主机 `PerfView /EnableEventsInContainers` 采集；容器运行中可直接本机分析（PerfView 能进活容器解析符号）；跨机分析须在容器关闭前把 `.etl.zip` 拷进去跑 `PerfViewCollect merge /ImageIDsOnly` 内嵌符号信息。Hyper-V 容器在容器内直接采。

**采集守则**：推荐多个工具时每个都给安装+用法（如 `dotnet tool install -g dotnet-trace`）；任何 `-p <PID>` 前先验证进程（`dotnet-trace ps`、monitor `/processes`、容器内 `ps`）；容器 dotnet-monitor 挂 `/tmp` 共享卷放诊断 Unix 套接字；产物交接清单含运行时版本、OS/内核、镜像 tag 或 build SHA、PID、UTC 起止时间、确切命令、最终路径。

**分析指向**（不代做）：`.nettrace`→PerfView/Speedscope；`.etl(.zip)`→PerfView；perfcollect 的 `perf.data.nl`→拷到 Windows 用 PerfView。

**陷阱**：dotnet-trace 不支持 Framework；PerfView 需 admin；perfcollect 容器需 `--privileged`/SYS_ADMIN；容器镜像忘装工具（Dockerfile 加 tool install 或用 monitor sidecar）；生产暴露 `--no-auth` 禁止——保持认证、绑 localhost、`kubectl port-forward` 访问；只采 CPU trace 查网络问题不够；按需只开必需的 networking provider。

## 3. 崩溃 dump 采集（dump-collect）

**停止信号（先读）**：dump 启用或采集完成即停——不打开/不分析/不 triage；用户已有 dump 文件即告知超出范围；只装采集工具（`dotnet-dump collect`），不装分析工具（analyze/windbg）；不追崩溃根因，报告文件路径即止；不改应用代码（仅环境变量/OS 设置/容器 spec）。支持 modern .NET（CoreCLR 3.0+ 与 NativeAOT）的 Linux/macOS/Windows 含容器；**检测不到 CoreCLR 也检测不到 NativeAOT 就停**。

**判定 CoreCLR vs NativeAOT**：
```bash
# Linux/macOS 文件：CoreCLR 有 CorExeMain；NativeAOT 有 Rhp（Redhawk）符号
strings <binary> | grep -q "CorExeMain" && echo CoreCLR
strings <binary> | grep -q "Rhp" && echo NativeAOT
BINARY=$(readlink /proc/<pid>/exe)   # 运行中进程（macOS 用 ps -o comm= -p <pid>）
```
```powershell
# Windows：CoreCLR 有 CLI header / 加载 coreclr.dll；AOT 无 CLI header 有 Rhp；加载 clr.dll=Framework，停
dumpbin /clrheader <binary.exe> | Select-String "CLI Header" -Quiet
(Get-Process -Id <pid>).Modules.ModuleName -contains "coreclr.dll"
```

**场景参考**：CoreCLR→`references/coreclr-dumps.md`；NativeAOT→`references/nativeaot-dumps.md`；Docker/K8s→`references/container-dumps.md` 并叠加运行时参考。

**执行规则**：启用前确认输出目录存在且可写；采集成功报告 dump 路径；配置生效要回读验证（echo 环境变量/读回 OS 设置）；临时启用后提醒移除 `DOTNET_DbgEnableMiniDump` 等以免堆积文件。

## 4. 微基准 BenchmarkDotNet（microbenchmarking）

> ⚠️ LLM 训练数据里的 BDN 用法大量过时（运行时对比、job 配置、执行默认值已变）。**写任何代码前必须先读对应 reference 文件**：`comparison-strategies.md`（六种单运行对比轴的正确配置）、`project-setup-and-running.md`（入口/config/CLI）、`writing-benchmarks.md`（参数化机制与正确性模式）、`bdn-internals-and-tuning.md`（执行管线与迭代调优）、`diagnosers-and-exporters.md`（分配/硬件计数器/profiling 数据）。

**概念**：Job=怎么跑（运行时/迭代数/launch/策略）；case=方法×参数组合×job（原子计量单位）；operation=被测逻辑单元（所有输出列都是 per-operation）；invocation=一次调用（`OperationsPerInvoke=N` 时 1 invocation=N ops）；iteration=计时批次。

**基准是比较仪器**：单个数字价值有限。先定对比轴：方案 A vs B、运行时版本、包版本、构建前后（保存旧 DLL）、运行时配置（GC 模式/JIT，多 job 单运行）、规模 N、硬件/OS（须各机分别跑）、历史数据。前六轴可单运行并排。

**四种用途决定存放位置**：1) 覆盖套件（常驻、进工程基准目录、遵循其约定、按真实调用方设计）；2) 问题调查；3) 变更验证；4) 开发反馈——2-4 为任务级独立工程，用完不留进主库。

**成本**：默认每 case 15-25s；`[Params]` 笛卡尔积再乘 job 数。预设：`--job Dry`（<1s 仅验证正确性）/ `Short`（5-8s 开发期）/ 默认（15-25s 最终）/ `Medium`（33-52s）/ `Long`（3-12min 高置信）。跑前估 case 总数。

**运行**：入口 `BenchmarkSwitcher`（必须传 `args` 否则 CLI 旗标被静默忽略；始终带 `--filter` 防交互挂起）或 `BenchmarkRunner`。输出极冗长——全部重定向：`dotnet run -c Release -- --filter "*MethodName" --noOverwrite > benchmark.log 2>&1`；按 filter 一次跑一两个方法，读 `*-report-github.md` 汇总表，出错才看 benchmark.log。

**编写规则**：加包永远 `dotnet add package BenchmarkDotNet`（不写版本号，禁止手抄 `<PackageReference>` 版本）；基准方法**返回结果**防死代码消除；初始化进 `[GlobalSetup]`（方法体内即被计时；`[IterationSetup]` 仅当状态需每迭代重置）；**不手写循环**；比较时标基线（方法级 `[Benchmark(Baseline=true)]`，多 job 用 `.AsBaseline()`）；输入存字段或 `[Params]`，**不用字面量/const**（JIT 常量折叠会测到预计算结果）；生成数据用固定种子且样本量足够（4 个随机值分布太窄）。变体机制：`[Params]/[ParamsSource]`、`[Arguments]/[ArgumentsSource]`、`[ParamsAllValues]`、`[GenericTypeArguments]`。

**验证流程**：`--job Dry` 抓编译/运行时错误 → 单代表 case 默认设置核对数字量级 → 才跑全套；迭代期用 Short，定稿换默认。

## 5. CLR 激活日志诊断（clr-activation-debugging）

仅 .NET Framework（mscoree.dll 垫片）；modern .NET 不适用；程序集绑定失败用 Fusion 日志（fuslogvw.exe）；CLR 已加载后的崩溃不属激活问题。

**背景**：mscoree.dll（外壳）转发到 mscoreei.dll（真正的选择/日志逻辑）。2.0/3.0/3.5 共享 CLR **v2.0.50727**；4.0–4.8.x 共享 v4.0.30319。Win11 27965+ 起 .NET 3.5 FOD 不再作为可选组件（须独立 MSI），FOD 弹窗即使触发也装不上；Win10/11≤25H2 仍可用。常见 HRESULT：`0x80131700` CLR_E_SHIM_RUNTIMELOAD（找不到运行时，最常见）、`0x80131704` LEGACYRUNTIMEALREADYBOUND 等 `0x80131xxx` 族。

**启用日志**：`set COMPLUS_CLRLoadLogDir=C:\CLRLoadLogs`（会话级，推荐）或 HKLM `SOFTWARE\Microsoft\.NETFramework\CLRLoadLogDir`（64 位系统涉 32 位进程另设 Wow6432Node）。⚠️ **目录必须预先存在**，否则静默不写。日志 `{ProcessName}.CLRLoad{NN}.log`，**进程退出前读不了**。采完删除设置。

**工作流**：
1. 概览：按进程分组，grep 结果行 `Decided on runtime:` / `ERROR:` / `Launching feature-on-demand` / `Could have launched feature-on-demand` / `V2.0 Capping is preventing consideration`，建汇总表（进程/日志/结果/选中运行时/FOD?）。
2. 逐条追踪问题日志（注意**嵌套/重入条目**：FOD 检查会重跑版本计算，别当成第二次激活；一条日志可含**多个独立激活序列**，问题常在次要的 COM 激活）：
   - 入口：`_CorExeMain`（托管 EXE）、`DllGetClassObject`（COM）、`ClrCreateInstance`（v4+ 宿主）、`CorBindToRuntimeEx`（legacy）、`ICLRMetaHostPolicy::GetRequestedRuntime`、`LoadLibraryShim`。
   - 参数：`IsLegacyBind`（legacy 单运行时视角）、**`IsCapped`**（roll-forward 封顶 v2.0.50727，v4 对 legacy 路径隐形——by design，不是 bug；显式传 v4 版本串或 `useLegacyV2RuntimeActivationPolicy` 可绕过）、SkuCheckFlags 等。
   - 配置：`Config File (Open). Result:80070002`=没找到；`UseLegacyV2RuntimeActivationPolicy is set to 1` 使 legacy 路径可见 v4（副作用：关闭与 pre-v4 的进程内 SxS）；`<supportedRuntime>` **按序取第一个已安装项**。
   - 失败/FOD：`SEM_FAILCRITICALERRORS` 值 0=允许弹窗，非零（常见 0x8001，**从父进程继承**）=抑制——FOD 出没出现取决于它，不取决于进程自身。
3. 需要时查系统状态：CLSID 注册（`HKCR\CLSID\{guid}\InprocServer32` 默认值应为 mscoree.dll，版本子键/`ImplementedInThisVersion`/`Assembly`+`Class`/`RuntimeVersion`）、已装运行时（`HKLM\...\policy`）、错误模式继承链。
4. 报告：发生了什么→为什么（垫片具体决策路径）→什么控制该行为（配置存在性/错误模式/CLSID/封顶态）→若"以前好的"指出哪个输入变了。

**典型场景**：意外 FOD=`DllGetClassObject`+IsCapped:1+无配置+(null)+SEM=0；选错运行时=supportedRuntime 顺序；v2+v4 同进程=同日志多个 `Decided on runtime` 不同版本；legacy 已绑定=激活**顺序**决定成败（并发竞态可翻转结果）。

**验证**：所有含 ERROR/FOD 的日志都分析了（不只第一个）；每条问题激活的入口/封顶态/legacy 态/配置存在性/SEM 值都记录；诊断解释决策路径而非只报结果。
