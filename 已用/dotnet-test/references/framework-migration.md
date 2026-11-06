# .NET 测试框架与运行器迁移

蒸馏自源技能 `migrate-mstest-v1v2-to-v3`、`migrate-mstest-v3-to-v4`、`migrate-nunit-to-mstest`、`migrate-xunit-to-mstest`、`migrate-xunit-to-xunit-v3`、`migrate-vstest-to-mtp`。覆盖：MSTest 版本升级、NUnit/xUnit 转 MSTest、xUnit v2→v3、VSTest→MTP 运行器迁移。不用于：版本确定后写/修测试→`test-authoring.md`；平台判定→`test-authoring.md` 第 8 节；过滤语法→`test-authoring.md` 第 7 节。

## 0. 通用契约（六技能共享）

- **先分类再动手**：打开工作区先读工程/中央包文件/`global.json`/CI，判定源版本与当前状态；已是目标状态就报告 no-op 并零改动（v1v2→v3 有边界门禁：包全 3.x 且无 `.testsettings`/`<LegacySettings>`/迁移报错才算完成，但 3.x 包版本本身不结束迁移——遗留设置与破坏性错误仍在范围内）。
- **绝不开口就要路径**：glob `*.csproj`/`*.sln`/`*.slnx`/`Directory.*.props` 后按**字面返回路径**打开；绝不把路径重建到技能目录下，绝不为"找不到工程"而脚手架替代项目。
- **区分交付物**："fix my project / convert this / then build and run"=执行（编辑+构建+跑测试）；"what should I expect / give me a plan / show me"=回答。框架升级**保持测试平台不变**（VSTest/MTP 各自保留），除非用户另行要求 runner 迁移；反之 runner 迁移不动框架。
- **一次迁移一件事**：框架转换不与 TFM 升级或 VSTest↔MTP 迁移混做；MSTest v1/v2 先走 v3 技能再到 v4。TFM 不受支持时**先停**（MSTest v4 要求 net8.0+/net462+；xUnit v3 要求 net8.0+/net472+，测试库可 netstandard2.0）。
- **基线与对账**：迁移前记录 discovered/passed/failed/skipped 基线（有 CI 结果就用），迁移后同命令同配置对比，每个差异都要调查（缺行→数据特性/字面量类型；异常变化→精确 vs 派生映射；状态失败→fixture 生命周期/顺序；并发失败→Parallelize/worker 数；跳过变化→Ignore/Retry 语义）。绝不静默接受丢测试。
- **版本解析**：绝不把文档示例版本抄进结果；从配置的包源解析当前稳定版并**全部 MSTest 包钉同一版本**；中央包管理改 `Directory.Packages.props`。包版本有效性要实证（feed 查询/解析图+成功 restore）。
- **结果证明**：结束时报告检测到的源版本、目标版本、runner 选择、每个改动文件、确切的高风险映射、真实构建/测试计数。绝不由推断声称"构建成功/VSTest 兼容/测试通过"。
- **不擅自 commit**（除非用户要求）。

## 1. migrate-mstest-v1v2-to-v3

v1=QualityTools 程序集引用；v2=NuGet 1.x/2.x。两条路在"装 v3 包+修破坏性变更"汇合。**v3 与 v1/v2 二进制不兼容**——针对 v1/v2 编译的库必须重编。

**包**：默认移除 `MSTest.TestFramework`/`MSTest.TestAdapter` 换成元包 `MSTest`；VSTest 保留 `Microsoft.NET.Test.Sdk` 并升到兼容版（如 MSTest 3.8.0 需 Test.Sdk 17.13.0+，旧显式钉版触发 `NU1605`）。`MSTest.Sdk` 只在用户要求或仓库已标准化时用（仅 SDK-style）：换 `<Project Sdk="MSTest.Sdk/3.x.x">` 并**移除** SDK 自动提供的包（MSTest*、Test.Sdk、Analyzers）与属性（`EnableMSTestRunner`/`OutputType`/`IsPackable`/`IsTestProject`）。**MSTest.Sdk 默认 MTP**——项目须留 VSTest 就 `<UseVSTest>true</UseVSTest>`；不因过渡期存在 `vstest.console` 任务就翻转 runner。绝不把可用的 v3 分包"顺手合并"成元包。

**破坏性变更表**（只修工程里实际存在且编译器/analyzer 报出的）：

| 变更 | 影响 | 修复 |
|---|---|---|
| `AreEqual(object,object)` 重载移除，只剩 `AreEqual<T>(T?,T?)` | **仅**两参数无可推断公共类型时报 CS0411/CS1503；两个 object 参数仍推断 `T=object` 照常编译 | 失败调用加显式类型参数 `AreEqual<object>(...)`（`AreNotEqual/AreSame/AreNotSame` 同）；**能编译的断言不动**——全文件放宽到 `<object>` 也编译但丢掉 v3 的类型检查 |
| `DataRow` 严格类型匹配 | **不是编译错误**：analyzer MSTEST0014 警告+运行时 "Test data doesn't match method parameters"。宽化（int→long）仍绑定；窄化/无关（`1L`→int、`1.0`→float）不绑 | 改字面量到确切参数类型（`1`/`1L`/`1.0f`）；保留方法契约；**必须跑测试**——绿色构建证明不了 |
| `DataRow` 16 参上限 | 仅 3.0.1/3.0.2 报 CS1729，3.0.3 起移除 | 3.0.3+ **原样保留长行**：不包数组、不转 object、不拆测试；钉 3.0.1/3.0.2 就升级 |
| `.testsettings`/`<LegacySettings>` 不支持 | 设置被静默忽略 | **删** `.testsettings` 建 `.runsettings`（不共存）；所有 MSTest 设置归一个 `<MSTest>` 元素，不建 `<MSTestV2>` 节；`TestTimeout`→`<MSTest><TestTimeout>`（每测试，**不是** `TestSessionTimeout`）；部署→`<DeploymentEnabled>`；assembly resolution 删；数据收集器→`<DataCollectionRunSettings>`。更新所有指向旧文件的工程/CI/IDE 选择；VSTest 工程用 `RunSettingsFilePath` 生效；MTP 用 `--settings` 路径，不假设 MSBuild 属性被认 |
| 超时行为统一 | `[Timeout]` 表现可能变 | 核对值 |
| 移除 TFM：net5.0、Fx<4.6.2、netstandard1.0、UWP<16299、WinUI<18362 | 构建错误 | net5→net8.0（或 net6+）；netfx→net462+；ns1.0→ns2.0。net6/8/9 全支持，**已支持的 TFM 不动**；netcoreapp3.1 仍被 v3 支持，本次只迁框架、运行时升级另行建议 |
| 测试 ID 生成变化 | 播放列表/过滤/CI 历史重置 | 重新基线 |
| `TargetInvocationException` 解包 | 期待包装者的代码观测到内部异常 | 更新异常处理 |
| 初始化/清理消息挂到测试结果 | 首/末测试多出生命周期消息 | 更新日志处理 |
| 部署目录行为统一 | 硬编码部署路径失败 | 用 `TestContext.DeploymentDirectory` |
| 加了可空注解 | 可空工程多警告 | 修警告不顺手抑制无关诊断 |

**"what to expect" 回答形状**：先说需要的确切包更新，再按破坏性变更表逐行给 Applies/Watch/No change 判定（覆盖全部类别含运行时类别，不省）；比较类问题简述：v1 先删程序集引用、v2 直接升版本，汇合到同一 v3 包与变更。**怀疑不支持就先用构建确认诊断再改**——能编译即此版本支持，绕限制重写有效代码是缺陷不是谨慎。

## 2. migrate-mstest-v3-to-v4

v4 与 v3 二进制不兼容。干净编译不排除本技能：发现失败、`TestContext` 生命周期异常、测试历史变化都是运行时迁移失败。

**源破坏速查**（先全项目扫所有模式再动手）：

| 错误/模式 | 变更 | 修复 |
|---|---|---|
| 自定义 `TestMethodAttribute` 覆写 `Execute` | Execute 移除（v3 同步 API 遇内部 async 死锁） | 改 `ExecuteAsync` 返回 `Task<TestResult[]>`：纯同步逻辑用 `Task.FromResult`；调 base 或其他异步就真 async |
| 继承 `TestMethodAttribute` | 基类构造加 CallerInfo | 子类构造带 `[CallerFilePath]/[CallerLineNumber]` 并**转发给 base**；带显示名的子类构造**不**把名字串传给 base——只传 caller info 并赋 `DisplayName` 属性 |
| `[TestMethod("name")]` | 位置参数没了 | `[TestMethod(DisplayName = "name")]` |
| `[ClassCleanup(ClassCleanupBehavior.EndOfClass)]` | 枚举移除，v4 恒为 end-of-class | 删参数只留 `[ClassCleanup]`；用过 `EndOfAssembly` 的把逻辑移 `[AssemblyCleanup]` |
| `TestContext.Properties.Contains("k")` | 类型变 `IDictionary<string,object>` | `ContainsKey("k")` |
| `[Timeout(TestTimeout.Infinite)]` | 枚举移除 | `[Timeout(int.MaxValue)]` |
| `TestContext.ManagedType` | 移除 | `FullyQualifiedTestClassName` |
| `AreEqual(a,b,"msg {0}",arg)` | message+params 重载移除 | 字符串插值 `$"msg {arg}"` |
| `Assert.ThrowsException<T>` | 改名 | `ThrowsExactly<T>`（精确，同旧行为）或 `Throws<T>`（含派生） |
| `IsInstanceOfType<T>(obj, out var t)` | out 参数移除 | `var t = Assert.IsInstanceOfType<T>(obj)`；逐处改写保留具体断言类型与后续使用 |
| `[ExpectedException(typeof(T))]`（MSTEST0006 早在 3.2 已警告） | 属性移除 | 断言移入体内 `Assert.ThrowsExactly<T>(() => 仅抛异常语句)`；setup 留 lambda 外；async 用 `ThrowsExactlyAsync`；`AllowDerivedTypes` 用 `Throws/ThrowsAsync`（基类型匹配） |
| net5.0/6.0/7.0 | TFM 移除 | net8.0/net9.0。v4 支持 net8+、net462+、uap10.0.16299、现代 UWP/WinUI 对应 TFM |
| `UnfoldingStrategy`（3.7 引入） | 从数据属性移到 `TestMethodAttribute` | 相应改写 |
| `ConditionBaseAttribute.ShouldRun` | 改名 | `IsConditionMet` |
| 引用 `MSTestDiscoverer`/`MSTestExecutor`/`AssemblyResolver`/`GenericParameterHelper` 等 | 转 internal/移除 | 找替代或去依赖（PlatformServices 里的 `ITestMethod` 变了，TestFramework 里的没变） |

**行为变更**（无编译错误）：`TestCase.Id` 生成变化→AzDO 历史重置（无代码修复）；`TestContext.TestName` 在 `[ClassInitialize]`/`[AssemblyInitialize]` 访问**抛异常**（移到 `[TestInitialize]` 或测试内；**不要**换成 `FullyQualifiedTestClassName`——语义不同）；`TreatDiscoveryWarningsAsErrors` 默认 true（发现警告即失败；修警告优先，过渡可在 `.runsettings` 设 false）；AppDomain 默认禁用（`DisableAppDomain=false` 于 `RunConfiguration`；Fx+testhost 自动重开）；分析器 MSTEST0001/0007/0017/0023/0024/0025/0030/0031/0032/0035/0037/0045 从 Info 升 Warning；**MSTest.Sdk v4 的 MTP 模式不再附带 `Microsoft.NET.Test.Sdk`**→`vstest.console` 发现归零，三选一：A 保留 MTP+过渡发现就显式加确切兼容版 Test.Sdk（CPM 走 `PackageVersion`，验证用真实 `vstest.console` 命令，MTP 跑绿不证明 VSTest 发现）；B `UseVSTest=true` 换工程 runner（保留 Step 2 的 SDK 钉版）；C CI 换 `dotnet test`（长期推荐）。绝不声称这行为早于 v4 就存在。

**聚焦修复请求**：只处理相关变更、用用户真实类型给完整修复代码；fixture 还钉 v3 就不拿绿色 v3 构建当 v4 兼容证据，说清验证边界。

## 3. migrate-nunit-to-mstest（NUnit 3/4 → MSTest v4）

不改 TFM 不改平台。先判状态：已无 NUnit 包/命名空间/属性/约束→停+跑一次现有命令证明健康；源用 VSTest→保留并更新自有 `Microsoft.NET.Test.Sdk` 钉版，不引入 MTP 属性；源用 MTP→首选 `MSTest.Sdk`，元包路线则 `EnableMSTestRunner=true`+`OutputType=Exe`；行为细节按 `references/mapping-cheatsheet.md` **只查用到的节**。

**机械映射**：`[TestFixture]`→`[TestClass]`；`[Test]`→`[TestMethod]`；`[TestCase(...)]`→`[TestMethod]+[DataRow(...)]`；`[TestCaseSource]`→`[DynamicData]`；`[SetUp]/[TearDown]`→`[TestInitialize]/[TestCleanup]`；`[OneTimeSetUp]/[OneTimeTearDown]`→**static** `[ClassInitialize]/[ClassCleanup]`（用到的实例状态移 static 持有者，不是只加 static）；`[Category]`→`[TestCategory]`；`[Property]`→`[TestProperty]`；`[Ignore]`/`[Timeout]`/`[Retry]` 是修饰符**必须保留 `[TestMethod]`**；`[Retry(n)]`→`[Retry(n-1)]`（NUnit 计首次尝试，MSTest 计重试；n=1 删掉；`RetryExceptions` 过滤单独审）。删 `using NUnit.Framework[.Legacy];`。不机械 seal 类、不拍平继承的 setup。

**强制语义映射**：NUnit 默认 `LifeCycle.SingleInstance`（一实例跑全部用例）≠ MSTest 每测试新实例——审计可变实例字段，需类共享的走 static+`[ClassInitialize]`，能证明每测试就留实例字段；`[FixtureLifeCycle(InstancePerTestCase)]` 本就同 MSTest，删属性即可。`Assert.Throws<T>`/`Throws.TypeOf<T>` 精确→`ThrowsExactly<T>`；`Assert.Catch<T>`/`Throws.InstanceOf<T>` 含派生→`Throws<T>`。`Is.TypeOf<T>`→`IsExactInstanceOfType<T>`；`Is.InstanceOf<T>`→`IsInstanceOfType<T>`。NUnit 相等约束逐元素比较序列→`AreSequenceEqual`（4.3+）或实体化列表 `CollectionAssert.AreEqual`，**绝不**用引用型 `AreEqual`。`TestCase(ExpectedResult=)`/`TestCaseData.Returns`→重写目标测试断言结果。行级名字/类别/忽略用 `DynamicData` 返回 `TestDataRow<T>` 保留；行属性无直接等价需自定义源或显式决定。`[Combinatorial]/[Values]/[Range]/[Random]`→MSTest 4.4 组合属性（`using ...Combinatorial;`，范围/随机边界显式翻译）；`[Sequential]` 需显式行；`[Pairwise]` 无内置——保留确切生成行或已验证的 pairwise `ITestDataSource`（全笛卡尔会改测试数与成本）。`[Theory]/[Datapoint]/[DatapointSource]`→显式 `DynamicData`/组合源，保留自动 bool/enum 值与"全部行违反假设则理论失败"规则。`[Explicit]/[Repeat]`/参数化 fixture/fixture 源/`Assert.Multiple` **无行为等价机械映射**——刻意重写或报告人工后续，绝不静默近似。`[CancelAfter(ms)]`→`[Timeout(ms, CooperativeCancellation=true)]`；VSTest 下删 NUnit 注入的 `CancellationToken` 参数改用 `TestContext.CancellationToken`（否则 VSTest 当缺数据）；fixture 级默认展开到每个受影响测试。`[Apartment(STA)]`→`[STATestClass]/[STATestMethod]`（异步续体留 STA 设 `UseSTASynchronizationContext=true`；MTA 是默认）；`[RequiresThread]/[SingleThreaded]` 的线程同一性 MSTest 不保——自定义执行器或人工后续。平台/文化门→`OSCondition`/`ArchitectureCondition`/`MemberCondition`；`SetCulture/SetUICulture`→setup/cleanup 存复原文化。`[DefaultFloatingPointTolerance]`→展开为每个受影响断言的显式 delta，保持方法>fixture>装配优先级。`[SetUpFixture]` 是命名空间作用域≠MSTest 装配级——只在本就全装配时用 `[AssemblyInitialize]`，否则移进受影响类/共享 helper 不扩范围。setup/teardown 继承顺序保持。

**并行**：两边默认都是串行——NUnit 无 `Parallelizable` 配置就**不加** `[assembly: Parallelize]`。显式开启时翻译作用域与 worker 数：装配 `Parallelizable(Fixtures)`→`[assembly: Parallelize(Workers=N, Scope=ExecutionScope.ClassLevel)]`；fixture `Children`→确认共享实例状态安全后才方法级；`[NonParallelizable]`→`[DoNotParallelize]`；`[LevelOfParallelism(N)]`→`Workers=N`；资源级串行用 4.4 `[ResourceLock("key")]`（比 DoNotParallelize 更窄时）。`[Order]` 不是依赖语义——真前置才 `[DependsOn]`，否则独立化测试或人工后续。绝不从 fixture 级设置推断方法级并行。

## 4. migrate-xunit-to-mstest（xUnit v2/v3 → MSTest v4）

同 NUnit 技能的通用契约（不改 TFM/平台、cheatsheet 只查用到的节、四阶段快路：一次批量发现读→一次编辑→一次 `dotnet test`→一次简明结果；不把工程文件复制进技能目录、不 `--no-restore`、不重复跑已过的命令）。

**包**：删 `xunit*`/`xunit.v3.*`/`xunit.runner.visualstudio`/`YTest.MTP.XUnit2` 及伴生包；默认 MSTest v4 元包（示例 4.1.0 需 Test.Sdk 18.0.1+，旧钉版 `NU1605`；VSTest 保留工程自有 Test.Sdk 钉版并升兼容，仓库有意依赖元包传递引用可沿用其约定）。保留 MTP：不带入 xUnit 的 `UseMicrosoftTestingPlatformRunner`，首选 `MSTest.Sdk`；元包路线 `EnableMSTestRunner=true`+`OutputType=Exe`；`TestingPlatformDotnetTestSupport=true` 仅留给继续经 VSTest 命令模式调 MTP 应用的仓库（原生 .NET 10+ 不需要）；MSTest.Sdk 保留 VSTest 设 `UseVSTest=true`。`xunit.runner.json` 先移植相关设置再删。

**机械映射**：无类属性→`[TestClass]`；`[Fact]`→`[TestMethod]`；`[Theory]+[InlineData]`→`[TestMethod]+[DataRow]`；`[MemberData]`→`[DynamicData]`；`[Fact(Skip=...)]`→`[TestMethod]+[Ignore(...)]`；`[Trait("Category",v)]`→`[TestCategory(v)]`；**`[Trait("Owner",v)]`→`[Owner(v)]`**（Owner 是 VSTest 保留属性，不是 TestProperty）；其他 Trait→`[TestProperty]`；`Assert.Equal/NotEqual/True/False/Null/NotNull`→`AreEqual/AreNotEqual/IsTrue/IsFalse/IsNull/IsNotNull`。删 `using Xunit[.Abstractions];`。保留类继承，不机械 seal。

**强制语义**：`Assert.Throws<T>` 精确→`ThrowsExactly<T>`；`ThrowsAny<T>`→`Throws<T>`；`IsType<T>`→`IsExactInstanceOfType<T>`、`IsAssignableFrom<T>`→`IsInstanceOfType<T>`（有赋值就用泛型重载保返回值）；序列 `Assert.Equal`→`AreSequenceEqual`（4.3+）或实体化 `CollectionAssert.AreEqual`；`[DataRow]` 字面量精确匹配参数类型；`TestContext.Current.CancellationToken`→注入的 MSTest `TestContext.CancellationToken`（**绝不** `CancellationToken.None` 或新 CTS）；无等价断言（`Assert.Collection/All/Equivalent`、`Record.Exception`、事件断言）显式人工重写，绝不删断言不补验证。

**fixture/生命周期/并行**：构造 setup 与 `IDisposable/IAsyncDisposable` 有效就保留；`IAsyncLifetime`→`[TestInitialize]/[TestCleanup]`；**`IClassFixture<T>`=每类一实例**→static `T` 字段+static `[ClassInitialize](TestContext)` 创建+`[ClassCleanup]` 释放（用 TestInitialize 就变成每方法一个 fixture，错）；`ICollectionFixture<T>` 保共享+串行→优先 static `Lazy<T>` helper，源集合禁了并行才加 `[DoNotParallelize]`，真全装配才装配初始化；`ITestOutputHelper`→注入/属性 `TestContext`，每个 `_output.WriteLine`→`TestContext.WriteLine`（结果里点名两者）。**xUnit 默认类间并行、MSTest 默认串行**：≥2 个独立可运行类时加 `[assembly: Parallelize(Workers = 0, Scope = ExecutionScope.ClassLevel)]`；单类无显式设置不加（类级并发不可观测）；显式 `CollectionBehavior`/`xunit.runner.json` 设置无论类数都要翻译；**绝不用 `ExecutionScope.MethodLevel` 模拟 xUnit**。

**验证**：同基线命令跑一次；差异按缺用例/异常变化/共享状态或耗时大变/静默跳过分类调查；确认无 xUnit 残留；回读每个高风险改动文件并在结果点名确切目标 API（`[ClassInitialize]`、`TestContext.WriteLine`、`IsExactInstanceOfType<T>` 等含泛型与成员名）——"已转换属性"式泛称不算证据。最终形状：Changed/Verified/Preserved/Remaining。

## 5. migrate-xunit-to-xunit-v3（v2 → xunit.v3）

**预检决策**：已引用 `xunit.v3`+配置齐+无 v2 残留+测试命令过→停并报验证过的 no-op（有任何必需的 v3 适配残留就只修那一项，不把包引用当完成）。v2 用了 `YTest.MTP.XUnit2`→保留 MTP：删 shim、`UseMicrosoftTestingPlatformRunner=true`、**不加** `xunit.runner.visualstudio`、不设 `IsTestingPlatformApplication=false`。没用→保留 VSTest：保/更新 `xunit.runner.visualstudio`、`IsTestingPlatformApplication=false`（共享 props 存在才放 props，不为单工程建仓库级 props）。`OutputType=Exe` 使 `net*-windows` 在非 Windows 主机失败→要交叉构建就 `EnableWindowsTargeting=true` 重跑，不把迁移引发的失败推给"既有问题"。伴生包（`xunit.v3`+Xunit.Combinatorial+Xunit.StaFact）从配置 feed 解析**互相兼容的一组**；最新 v3 大版本无兼容稳定伴生就选最新兼容大版本并解释钉版；验证发现不只编译。

**步骤**：①找 v2 包（`xunit`/`xunit.abstractions`/`xunit.assert`/`xunit.core`/`xunit.extensibility.core|execution`/`xunit.runner.visualstudio`，含中央 props/targets）；TFM 不满足 net8+/net472+（测试库可 ns2.0）就**停**让用户先升 TFM；确认 SDK-style。②包映射：`xunit`→`xunit.v3`；`xunit.abstractions`→删；`xunit.assert`→`xunit.v3.assert`；`xunit.core`→`xunit.v3.core`；`extensibility.core`+`execution`→合并 `xunit.v3.extensibility.core`；查询配置源钉真实存在的最新稳定版；VSTest 工程才更新 `xunit.runner.visualstudio`。③测试工程（非测试库）设 `OutputType=Exe`（可集中 `Directory.Build.props`——**不放 targets**；名称模式则条件化；否则逐工程）。④平台保留（见预检）。⑤删所有 `using Xunit.Abstractions;`。⑥`async void` 测试不再支持→`async Task`（结果里说明原因，不只报机械替换）。⑦字符串双参属性改 Type：`CollectionBehavior`/`TestCaseOrderer`/`TestCollectionOrderer`/`TestFramework` 的 `("Ns.Type","Assembly")`→`(typeof(Ns.Type))`；指向自定义类型的属性要**同时**迁类型到 v3 契约（集合工厂要实现 v3 `IXunitTestCollectionFactory`——属性编译过而工厂空着不算完成）。⑧自定义 `FactAttribute/TheoryAttribute` 子类构造加 `[CallerFilePath]/[CallerLineNumber]` 并 `base(sourceFilePath, sourceLineNumber)` 转发（回读每个受影响构造点名确认，测试跑过不证明传播）。⑨`BeforeAfterTestAttribute` 子类：`Before/After(MethodInfo)`→`Before/After(MethodInfo, IXunitTest)` 且 base 调用带同参；**保持继承不改成直接实现 `IBeforeAfterTestAttribute`**（能编译但丢基类行为、不是机械迁移）；回读引用确切签名。⑩新 analyzer 警告（最著 xUnit1051：接受 CancellationToken 的方法用 `TestContext.Current.CancellationToken`）。⑪`Xunit.SkippableFact`：删包；`SkippableFact/Theory`→`Fact/Theory`；`Skip.If`→`Assert.SkipWhen`；`Skip.IfNot`→`Assert.SkipUnless`；可行时验证两分支（默认条件报跳过原因、满足条件执行通过）——grep+泛过运行不证明运行时跳过语义。⑫伴生包：Combinatorial 1.x→2.x+、StaFact 1.x→兼容线；按依赖约束+feed 实证选择；STA 测试在 Linux 的**平台跳过**与失败分开确认。⑬构建+`dotnet test` 与迁移前同结果；CPM 工程编辑后回读 `Directory.Packages.props`+工程文件确认 `PackageVersion` 持版本、重命名 `PackageReference` 无版本、`OutputType=Exe` 生效。

## 6. migrate-vstest-to-mtp（运行器迁移）

**核心约束**：同一解决方案/运行配置**不得混用** VSTest 与 MTP 工程（不支持场景）——所有测试工程一起迁。不适用：UWP/打包 WinUI（MTP 未支持）、混合非 .NET 适配器（JS/C++ 必须 VSTest）、框架转换、MSTest 版本升级。

**先定 SDK 模式**：从 `global.json` 或明示 CI SDK 解析（宿主 `dotnet --version` 仅在仓库未钉未述时用，绝不静默覆盖明示的 .NET 8/9 CI 目标）。**.NET 9-**：`TestingPlatformDotnetTestSupport=true` + `--` 分隔符；**.NET 10+ 原生**：`global.json` 加 `"test": {"runner": "Microsoft.Testing.Platform"}`（JSON 严格合法无尾逗号）、删该属性、MTP 参数**不带** `--` 直传。

**Directory.Build.props 集中**：MTP 属性尽量放解决方案/仓库根 props。**条件陷阱**：`Directory.Build.props` 求值时 `IsTestProject` 尚未由测试 SDK targets 设置——**绝不用** `Condition="'$(IsTestProject)' == 'true'"`，改用 `$(MSBuildProjectName.EndsWith('.Tests'))` 等名称条件；同一条件里放全所有适用中心属性（`OutputType`、runner opt-in、.NET 9- 的 `TestingPlatformDotnetTestSupport`），不留影响生产工程的无条件 runner 属性。

**框架启用**：MSTest NuGet（3.2.0+）`EnableMSTestRunner=true`+`OutputType=Exe`（已 ≥3.2 不需升版）；`MSTest.Sdk` 默认 MTP——唯一动作是删 `<UseVSTest>true</UseVSTest>`。NUnit 需 `NUnit3TestAdapter` 5.0.0+ + `EnableNUnitRunner=true`+`OutputType=Exe`。xUnit v2 加 `YTest.MTP.XUnit2`（0.4.0）+`OutputType=Exe`——它**保留 VSTest `--filter` 语法**、支持 `--settings`/`xunit.runner.json`/`--report-trx`/`--treenode-filter`，无需迁过滤。xUnit v3 `UseMicrosoftTestingPlatformRunner=true`——**不支持** VSTest `--filter`，必须翻译（见 `test-authoring.md` 第 7 节：`--filter-class/-method/-namespace/-trait` 及 `--filter-query` 路径语法；优先直译旗标，query 先 `--list-tests` 验证，选中 0 测试不算翻译成功）。`OutputType=Exe` 只有 MSTest.Sdk 自动设；无法可靠只针对测试工程条件化时逐工程设是可接受例外。

**参数翻译表**（构建类参数 `-c/-f/--no-build/-v` 不变）：`--test-adapter-path`/`--blame` 不适用；`--blame-crash[-dump-type]`→`--crashdump[-type]`（CrashDump 包）；`--blame-hang[-timeout/-dump-type]`→`--hangdump[-timeout/-type]`（HangDump 包）；`--collect "Code Coverage;Format=cobertura"`→`--coverage --coverage-output-format cobertura`；`-d/--diag <file>`→`--diagnostic`；`--filter` 同语法（xUnit v3 除外）；`-l/--logger trx`→`--report-trx`（TrxReport 包）；`--results-directory`/`-t/--list-tests` 同；`-s/--settings` 同（MSTest/NUnit 仍吃 `.runsettings`）；`-- <RunSettings args>`→`--test-parameter`（仅 MSTest/NUnit）。翻译 reporter/coverage/dump 时**点名每个所需扩展包**——只有选项没有 owning 扩展包不算完整；CPM 下 `Directory.Packages.props` 加 `PackageVersion`，版本从 feed 解析不抄示例。

**CI**：AzDO `VSTest@3`→`DotNetCoreCLI@2 command:test`；已是 CLI 任务就按表更新参数（.NET 9- 记得 `--`：`'--no-build -- --report-trx --results-directory $(Agent.TempDirectory)'`）；GitHub Actions 同样翻译；`vstest.console.exe` 直调→`dotnet test`（测试工程现在是可执行文件，可直跑）。

**行为差异**：零测试 VSTest 静默成功、**MTP 退出码 8**——三形式给全：`--ignore-exit-code 8`、`TestingPlatformCommandLineArguments` 追加、`TESTINGPLATFORM_EXITCODE_IGNORE=8`；有意抑制要警告会掩盖坏过滤导致的空跑，且只作用于已知零测试工程/配置。迁完可删仅 VSTest 需要的包：`Microsoft.NET.Test.Sdk`（MSTest.Sdk v4 默认已不带）、`xunit.runner.visualstudio`（用 YTest.MTP.XUnit2 时不需要）；过渡期保留。

**验证**：build 零错→`dotnet test` 计数对基线→直跑测试 exe→CI 产物（TRX/覆盖率/转储）→VS 17.14+/VS Code Test Explorer 发现运行→CI 脚本无 `vstest.console` 残留→非 MSTest.Sdk 工程都有 `OutputType=Exe`。最终结果点名：框架 runner opt-in、仓库选定 SDK 集成模式、确切翻译后命令、扩展包、验证证据。后续：跑测试用 run-tests 知识、迭代修测试用 mtp-hot-reload。
