# .NET 可测性改造：静态依赖检测、包装器与配对分析

蒸馏自源技能 `testability-obstacle`、`detect-static-dependencies`、`generate-testability-wrappers`、`migrate-static-to-wrapper`、`find-untested-sources`。覆盖：单点可测性障碍破解、静态/环境依赖审计、包装器生成、批量迁移、源-测试静态配对。不用于：普通写测试（已有可注入缝）→`test-authoring.md`；覆盖率/缺口分析→`test-analysis.md`；框架迁移→`framework-migration.md`。

## 0. 五技能分工

| 用户意图 | 技能 |
|---|---|
| 一个具体行为因环境依赖测不了，要最小生产缝+确定性测试 | testability-obstacle |
| 审计仓库里有哪些静态/隐藏依赖（找，不改） | detect-static-dependencies |
| 生成包装器/接入内置抽象与 DI 注册（建缝，不动调用点） | generate-testability-wrappers |
| 把既有静态调用点批量替换为用户点名的抽象（迁移，含受影响测试） | migrate-static-to-wrapper |
| 哪些源文件没有配对测试（静态解析，秒级） | find-untested-sources |

激活前提（detect-static-dependencies）：请求或目标必须显式含 C#/.NET/`.cs`/`.csproj` 信号，否则休眠。已有可注入缝的代码直接用 fake 走 code-testing，不再动这些技能。

## 1. testability-obstacle：最小缝 + 确定性测试

适用：目标测试需要真实时钟/延迟/文件/环境/Guid/Random 等环境依赖，且缝的选择还未定。生产编辑是完成测试请求的手段，不是重构邻接代码的邀请。

**流程**：
1. **证明障碍**：读目标生产路径与既有测试，指出确切环境操作；已有足够缝就停下直接用（本技能不加价值）。单类请求不做全库扫描。
2. **选最小安全缝**：

| 依赖 | 首选缝 |
|---|---|
| 时间/定时器 | 注入 `TimeProvider`，测试用 `FakeTimeProvider` |
| 文件系统 | 仓库既有抽象优先；单一读/写操作可用注入委托；否则单成员接口或已接受的 `System.IO.Abstractions` |
| HTTP | 既有 typed HttpClient/handler 或 `IHttpClientFactory` |
| 随机 | 单个最终值→注入 `Func<int>`（范围选择留在真实默认）；范围参数本身是被测行为→`Func<int,int,int>`；多操作/状态→注入 `Random` 或最小生成器接口 |
| 环境/控制台/进程 | 只含目标实际用到成员的最小接口 |

   实例类默认构造注入；**不为满足流程给类库加 DI 容器**。保持既有公共构造面：公共无参构造继续用真实依赖，测试专用构造放最窄可见性（确切测试程序集已知时 `InternalsVisibleTo` 正当；已有公共缝可注入时绝不加）。
3. **静态 API 必须保持静态形状时→作用域 ambient 缝**（时钟/文件系统/环境查找/身份生成/随机通用规则）：
   - 用 `AsyncLocal<T>`（跨 `await` 流动），**绝不 `[ThreadStatic]`**；
   - 槽里存**提供者/值本身**，绝不存可变 `Stack<T>`/列表等共享集合（子执行上下文继承同一对象会互相破坏嵌套）；提供者可变（内存 store、fake time）时每个并行流**新建实例**，不改继承来的父实例；
   - `Override(...)` 捕获 previous 并返回 `IDisposable` 还原，嵌套作用域 LIFO 释放，**绝不无条件置 null**：`var previous = s_provider.Value; s_provider.Value = provider; return new RestoreScope(() => s_provider.Value = previous);`
   - 默认落到真实生产依赖；绝不进程级可变 fake 破坏并行。
   - 延迟行为用内置 fake-time 重载，**不要自造 IDelay**：`Task.Delay(delay, timeProvider, token)`、`new CancellationTokenSource(delay, timeProvider)`、`new PeriodicTimer(period, timeProvider)`（TFM 支持时）。测试法：启动→证明未完成→`FakeTimeProvider.Advance`→await。测边界要先推进到截止前一刻证明仍未完成，再跨过截止；绝不等墙钟。
4. **保持行为与 API 形状**：只包目标用到的成员；默认实现直接委托原 API；保留异常、路径处理、时区、`DateTime.Kind`；不把业务逻辑移入包装器；不顺手修无关 bug。时间替换：`DateTime.UtcNow→timeProvider.GetUtcNow().UtcDateTime`、`DateTime.Now→GetLocalNow().LocalDateTime`、`DateTimeOffset.UtcNow→GetUtcNow()`、`DateTimeOffset.Now→GetLocalNow()`。确定性序列化文本是刻意例外：用户要跨平台可复现输出就用显式分隔符（未指定就字面 `\n`）；平台原生换行只在它是既有契约时保留。
5. **保持生产默认接线**：更新每个受影响的组合根/构造点，生产仍默认真实依赖（`new ExpirationPolicy(TimeProvider.System)`）；不把责任移进可选构造参数或给工厂加可选 provider。先构建受影响生产工程——此处编译失败是缝的问题不是测试的问题。
6. **写确定性测试**：固定/推进时间、内存 fake 文件系统、零环境变异/外部进程/网络。跟随测试工程既有框架与断言约定，绝不手写 `FactAttribute` 替身框架。断言业务结果+至少一个证明 fake 驱动了路径的交互/状态观测；生产默认测试仅在可确定性时保留（绝不为证明委托而碰真实文件）。静态 ambient 缝的完成要求**执行过**替换、嵌套还原、（应要求）异常展开还原、重叠异步流隔离的测试——仅编译通过从不充分。
7. **验证完整路径**：受影响生产构建+最窄目标测试命令；检查测试摘要而非退出码，0 发现=未完成。输出 `Requirement | Evidence` 表。

**常见坑**：没证明障碍就重构；包装整个静态 API（只包用到的）；`UtcNow` 转 `.DateTime`（丢 Kind，用 `.UtcDateTime`）；可变静态 fake 共享（改构造注入或 scoped AsyncLocal）；无容器库加 DI（显式组合）；临时文件偷懒（内存 fake）；重构编译过就收工（补上行为测试）；0 测试的运行报成功。

## 2. detect-static-dependencies：静态依赖审计（只报告）

**执行契约**：点名相对路径就发现并立即扫，不要求用户重传；从递归带行号内容搜索开始，**不只搜 `static` 关键字**（LINQ/lambda/插值串里的环境调用没有 static 修饰符）；同一响应交付完成审计，不停在计划。范围=用户给定的文件/目录/.csproj/.sln，绝不擅自扩到全解决方案；始终排除 `obj/`、`bin/`、生成代码、测试工程。

**类别与替换**（模式匹配只是候选，先追接收者来源：构造/参数/属性/DI 注入的协作者已是缝，注入的具体 `HttpClient` 可用受控 handler 测——不计数不建议替换）：

| 类别 | 模式 | 推荐替换 |
|---|---|---|
| Time | `DateTime.Now/UtcNow/Today`、`DateTimeOffset.Now/UtcNow`、`Task.Delay(`、`new CancellationTokenSource(TimeSpan` | `TimeProvider`（.NET 8+；<8 用 `NodaTime.IClock` 或自定义 `ISystemClock`） |
| File System | `File.*`、`Directory.*`、`Path.GetTempPath(`、及触盘实例成员（`new FileInfo`、`.LastWriteTimeUtc`、`new StreamReader(path)`） | `System.IO.Abstractions` |
| Random/identity | `new Random(`、`Random.Shared`、`Guid.NewGuid(` | 注入 `Random`/`IGuidProvider` |
| Culture/serialization | `CultureInfo.CurrentCulture/CurrentUICulture`、`JsonSerializer.*` | 显式传 culture/options 或注入序列化抽象 |
| Environment | `Environment.Get/SetEnvironmentVariable`、`MachineName`、`UserName`、`CurrentDirectory`、`Exit(` | 自定义 `IEnvironmentProvider` |
| Network | `new HttpClient(`、`.GetAsync/.PostAsync/.SendAsync`（确认接收者；排除注入/工厂产出的） | 注入 `HttpClient`（`IHttpClientFactory`） |
| Console | `Console.Write/Read*` | `IConsole` 或 `ILogger` |
| Process | `Process.Start/GetCurrentProcess/GetProcessesByName` | 自定义 `IProcessRunner` |

**计数纪律**（总数不准是报告失败主因）：
- 先建**一份出现台账**（每调用点一行：类别、确切模式、`file:line`、建议缝），所有聚合从同一台账分组推导，绝不边写边重数。
- 三个计数域分开：`Files scanned`（全部合格文件）≠`affected files`（有台账行的）≠`call sites`（台账行数）。
- 按成员碰什么分类而非是否 static——实例触盘成员计入 File System，措辞用"hidden dependency"。
- 确定性纯工具（`Path.Combine/GetExtension`、`Math.*`、`string.*`）不占环境输入，**不是可测性障碍**，最多单列"无需处理"。
- 类别全覆盖（漏一个在的类别=少算）；每处给 `file:line`；类别合计、Top 模式、按文件表必须对账到同一总数；排除项是范围决定不是类别；top-N 子集要标注是子集。
- 时间调用看用法不只看数：一个逻辑操作两次 `DateTime.UtcNow`（如 CreatedAt+ExpiresAt）是 2 个调用点+一致性缺陷，建议捕获单一瞬间——但这是行为级可选后续，机械包装迁移默认一比一保留原读取。

**报告**：范围/扫描数/总调用点 → 类别汇总表 → Top 10 模式 → 受影响最大文件 → 迁移优先级（数量×替换难度，Time 通常第一）。下一步只在用户行动明确需要时提一句 generate/migrate 技能，不做推销。

## 3. generate-testability-wrappers：建缝与内置抽象接入

前提：目标确实调用环境/静态依赖且**没有**可注入缝；已有 `IFileSystem`/`TimeProvider` 就停——绝不加第二层包装。缺 DI 包不等于必须 ambient：可实例化类一律构造注入+显式组合；Step 5 只留给签名不能动的静态 API 或用户明令禁改调用点。

**策略表**（选哪个抽象）：Time→.NET 8+ `TimeProvider` 内置 / 6-7 `Microsoft.Bcl.TimeProvider` / Framework 自定义 `ISystemClock`；File→`System.IO.Abstractions`；HTTP→`IHttpClientFactory`；Env/Console/Process→自定义最小 `IEnvironmentProvider`/`IConsole`/`IProcessRunner`。送达方式另一轴：可实例化类→构造注入；有容器→按约定加注册；静态且签名不可改→ambient 缝。

- **TimeProvider 接入四件套**（缺一不算完成）：DI 注册 `AddSingleton(TimeProvider.System)`、构造注入、`FakeTimeProvider` 测试（需 `Microsoft.Extensions.TimeProvider.Testing` 包，断言必须在钉住/推进时间后时间相关结果成立——仅构造 fake 不是测试）、无容器时展示 `TimeProvider.System` 显式生产构造。
- **IHttpClientFactory**：`AddHttpClient<MyService>()`+直接注入 `HttpClient`，保留调用方 token。测试给完整 fake `HttpMessageHandler`（`SendAsync` 返回确定性响应）；生产用 typed-client 注册就测同一注册管线（ServiceCollection 配 primary handler→解析 typed client→调用），手工 new HttpClient 只证明类不证明注册。
- **自定义包装模板**：接口只含**实际检测到**的成员；偏好无状态操作化接口（只需启动/等待/取退出码就暴露一个 `Run`，不漏 `Process` 生命周期）；默认实现直接委托；注册是交付物不是总结里一句话——无状态 `AddSingleton`、有状态说明为何短生命周期。
- **文件系统 package-first**：`dotnet add package System.IO.Abstractions`+`AddSingleton<IFileSystem, FileSystem>()`+注入+测试工程 `System.IO.Abstractions.TestingHelpers` 的 `MockFileSystem`（先播种再消费，未播种的 mock 测试不证明读写）。绝不再生成第二套自定义文件系统接口。
- **Ambient 缝模板**（Clock 静态类示例）：`AsyncLocal<Func<DateTime>?>` 槽，`UtcNow => s_override.Value?.Invoke() ?? TimeProvider.System.GetUtcNow().UtcDateTime`，`internal static IDisposable Override(固定UTC)` 校验 Kind 后捕获 previous 并返回一次性还原 Scope。四性质：作用域化可还原（裸 setter 把负担推给每个测试作者）；`AsyncLocal` 不 `[ThreadStatic]`；保持被替换成员语义（`UtcNow` 配 `GetUtcNow()`，`Now` 配 `GetLocalNow()`）；证明测试程序集可达 override（internal 需确切 `InternalsVisibleTo`，否则别展示测试调用不可达成员）。ambient 路径**跳过 DI 注册**——提议容器正是用户要缝的原因。
- **文件放置**：跟随仓库约定（`Abstractions/`、`Infrastructure/` 等）。完成前核对交付含请求的每一项：注册代码真加了或给了确切语句；可测性有 fake 消费演示；console 包装要用既捕获提示又供给输入的 fake 跑通流程。

## 4. migrate-static-to-wrapper：调用点批量迁移（codemod）

前提：抽象已存在（内置抽象永远算存在）且用户点名；没有就转 generate。`static` 类、无 DI 容器**不是**跳过理由——那正是 Step 3 ambient 缝的用途。

**不可协商边界**：
- 缺抽象=停：接口/包不在而请求只授权替换调用点，就不加包、不造本地相似接口、不改生产代码；报告确切缺件与所需授权。
- **一次源读取仍是一次替换读取**：绝不提升/合并调用（共享捕获的 `now` 看起来干净也是行为变更）。
- **请求范围既穷尽又排他**：范围内每个点名调用都换，范围外一个邻接成员/文件不碰；点名保留的（注释标 intentional 的）不动并在 "Remaining (out of scope)" 列出。
- 仓库请求必须真改仓库文件，声称完成要有 diff 证明。

**替换映射**（保持目标成员类型，`DateTime` 字段不借机改 `DateTimeOffset`）：

| 原 | DI 替换 |
|---|---|
| `DateTime.Now` | `_timeProvider.GetLocalNow().LocalDateTime` |
| `DateTime.UtcNow` | `_timeProvider.GetUtcNow().UtcDateTime`（**绝不 `.DateTime`**，Kind==Unspecified 是最常见静默回归） |
| `DateTime.Today` | `_timeProvider.GetLocalNow().LocalDateTime.Date` |
| `DateTimeOffset.Now` | `_timeProvider.GetLocalNow()` |
| `DateTimeOffset.UtcNow` | `_timeProvider.GetUtcNow()` |
| `File.ReadAllText/WriteAllText/Exists(path…)` | `_fileSystem.File.*` |
| `Directory.Exists(path)` | `_fileSystem.Directory.Exists(path)` |
| `Environment.GetEnvironmentVariable(name)` | `_env.GetEnvironmentVariable(name)` |
| `Console.WriteLine(msg)` | `_console.WriteLine(msg)` |
| `Process.Start(info)` | `_processRunner.Start(info)` |

消费方本就是 `DateTimeOffset` 的直接赋 `GetUtcNow()` 结果，不绕回 `DateTime`。

**流程**：验证前提（TFM/Bcl、包引用、生产组合点：Program/Startup/工厂/手工构造——迁移到可用缝含保持范围可运行的最小构造/调用/注册改动；`TimeProvider.System` 在既有 DI 宿主注册，手工调用方更新而不是给库引容器）→ 锁定成员集并计数（用用户点名的确切成员，先全量搜出 file/line 清单，编辑中途不改集合）→ 按文件规划替换表达式与注入方式（C# 12 主构造或传统 `_camelCase` 字段跟随类内约定）→ 静态类用 ambient 缝（直接给缝作**唯一答案**，不并列"改成非静态/传参"选项；同 AsyncLocal 形状可用于 `IFileSystem` 等）→ 机械替换调用点 → **编辑后重复确切搜索要求范围内生产文件零出现**，并验证排他侧（点名不动的文件原调用仍在），报告 `N/N 已换 + M 个范围外保留` → 更新受影响测试（构造加参、fake 用 `FakeTimeProvider`/`MockFileSystem`/手写 fake；保留原静态结果驱动的每个可观测分支：`GetEnvironmentVariable(name) ?? "production"` 必须同时测配置值与 null 回落；仅让旧测试编译过不是迁移证据）→ 构建+最窄受影响测试工程，**报告真实退出码**（restore 失败就说失败并引用错误；构建成功不能替代请求的测试运行）→ 迁移总结表（模式/范围/生产文件与替换数/测试文件改动/范围外剩余）。

## 5. find-untested-sources：静态源-测试配对

回答"**哪些源文件没有任何测试文件引用其声明的类型**"——不需要构建、依赖解析或编译，秒级出确定性配对图。不是覆盖率：绝不给行/分支/Cobertura 结论，最终结果必须标注"静态配对启发式"。真实覆盖数据/CRAP/优先级转 coverage-analysis。

**两引擎**（JSON 契约兼容，跑对的那个一次，不用手工 glob 替代；"仅静态配对"禁止编译目标仓库跑其测试，不禁止启动本技能的 parse-only 分析器）：

| 引擎 | 命令 | 何时 |
|---|---|---|
| Roslyn（C#） | `dotnet run scripts/Find-UntestedSources.cs -- <repo-root> [--top N] > pairing.json` | .NET-only 仓库**首选**：命名空间严格消歧，`Settings`/`Context` 类重名噪声小 |
| tree-sitter（多语言） | `python scripts/find_untested_sources.py <repo-root> [--lang csharp …] [--limit-untested 20] [--include-tested]` | 非纯 C# 仓库或想一个工具跨 12 语言（需 Python 3.10+、`pip install tree-sitter-language-pack`） |

- Roslyn 前提：支持文件级应用的 SDK（`global.json` 钉 11 preview+），首次运行需 NuGet 恢复 `Microsoft.CodeAnalysis.CSharp`。诊断走 stderr，JSON 走 stdout。
- 机制：剪 `bin/obj/node_modules/.git` 等与生成文件（`.g.cs`/`.Designer.cs`）；向上找最近 `.csproj` 判测试工程（名字后缀 `.Tests/.UnitTests/.IntegrationTests/.E2E/.Spec…` 或内容含 `Microsoft.NET.Test.Sdk`/`MSTest.Sdk`/`Microsoft.Testing.Platform`/`xunit`/`NUnit`/`TUnit`/`<IsTestProject>`）；纯语法解析记录 `(ShortName, Namespace, File)`；测试文件收集 using+外层命名空间+标识符，**命名空间前缀严格匹配**才归属；经 `<ProjectReference>` 建生产→测试工程映射，为未测源镜像出 `suggested_test_path`。
- 消费：`untested[*].source` 按声明数降序取下一个要测文件；`suggested_test_path` 直接落进已引用该源工程的测试工程（Roslyn 版无需 `dotnet sln add`；同目录兄弟已配对时沿用其测试目录约定）；`source_to_tests`/`--include-tested` 验证新测试文件确实配对；`orphan_tests`（polyglot）找不引用任何同语言源的孤儿测试。
- 已知盲区（诚实声明）：反射/DI 按字符串解析的类型、以实例方式调用的扩展方法、`var`/目标类型 `new()`/模式匹配丢类型 token、<4 字符标识符（polyglot 丢弃）、monorepo 路径别名不解析。对已分诊的未配对候选再跑真实覆盖率。
- 分析器依赖是环境前提：失败就报告前提失败，不装包、不换错引擎、不退回手工扫描。
