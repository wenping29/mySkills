# .NET 测试编写、脚手架与运行

蒸馏自源技能 `writing-mstest-tests`、`code-testing`、`code-testing-agent`、`code-testing-extensions`、`assertion-quality`、`filter-syntax`、`test-tagging`、`scaffold-dotnet-test-project`、`run-tests`、`platform-detection`、`mtp-hot-reload`。覆盖：写/修 MSTest 测试、生成测试流水线、断言质量、标签、脚手架、运行命令、平台判定、热重载。不用于：覆盖率/CRAP/缺口分析→`test-analysis.md`；静态依赖与可测性→`testability.md`；框架迁移→`framework-migration.md`。

## 1. code-testing：测试生成/修复入口（三件套之一）

**分工**：`code-testing` = 需要改代码的测试工作（生成/补/修/强化）；`writing-mstest-tests` = 仅修 MSTest API/配置写法；`code-testing-agent` = 旧名兼容别名（直接转 `code-testing`，勿自激活）；`code-testing-extensions` = 只读目录（`extensions/dotnet.md` 含 .NET 构建/测试命令、CS 错误码、MSTest 模板；仓库无代表性测试时才读 `dotnet-examples.md`）。

**先分范围再动手**：
- **Focused**（一个函数/类/文件、补缺失方法）：不建中间状态文件、不派子代理；读目标与一个邻近测试即可，写完跑最窄测试命令，自查断言。
- **Broad**（项目/包级套件、多模块）：走 Research → Plan → Implement 流水线（有 `test-engineer` 代理则委托一次；否则内联执行同流程），在非可暂存目录（Git 元数据 `git rev-parse --path-format=absolute --git-path testagent` 或系统临时目录）建 `research.md`/`plan.md`/`status.md`，绝不入库、绝不改 `.gitignore` 隐藏。

**完成契约（两种范围都适用）**：
1. 每个被要求的行为有具体断言（边界/错误路径单列）；覆盖率达标≠完备，按"需求矩阵"而非测试数量判定。
2. 最窄相关测试命令干净退出——引用"通过的运行"而非"尝试过"；最后一次覆盖率运行非零退出必须先修复重跑。
3. 最终交付按 `Requirement | Evidence` 映射，引用**确切测试名**与成功命令；泛泛的"覆盖了 X 模块"不合格。
4. 生成测试的失败多数是**断言期望值写错**而非生产代码 bug：读实际输出→读生产代码→修断言；绝不为通过而加 `[Ignore]`/`[Skip]`。
5. .NET 先分 SDK-style 与 classic 非 SDK；classic 保留 `packages.config`/现有 mock 版本/自定义基类，新文件加进 `<Compile Include>`，绝不为生成测试而现代化工程。
6. MSTest 先看钉住的包版本再选异常断言：3.5.x 用 `Assert.ThrowsException<T>`，不得替换为 `[ExpectedException]`/`Throws<T>`/`ThrowsExactly<T>`。

## 2. writing-mstest-tests：MSTest 写法修正

用于修复/现代化/解释**既有** MSTest 测试与配置；设计新用例走 `code-testing`；跑测试走 `run-tests`；v1/v2→v3、v3→v4 升级走迁移技能。

**硬门禁：先定版本再选 API**。检查 `MSTest.Sdk`（版本在 `global.json` 的 `msbuild-sdks`）、`MSTest` 元包或 `MSTest.TestFramework`+`MSTest.TestAdapter` 的确切版本；项目既有约定与已装版本优先于示例。

| API/模式 | 最低版本 | 兼容回退 |
|---|---:|---|
| `Assert.ThrowsExactly*`、统一 `Contains`/`HasCount`/`IsEmpty`/`IsNotEmpty` | 3.8 | `ThrowsException*`、`CollectionAssert`、`StringAssert` |
| `IsGreaterThan`/`IsLessThan`/`IsInRange`/`StartsWith`/`EndsWith`/`MatchesRegex` | 3.10 | 带清晰消息的 `IsTrue` 或 `StringAssert` |
| 泛型 `IsInstanceOfType<T>(value, out var)` | 仅 3.4–3.11 | 3.0–3.3 断言后转型；v4 直接返回值 |
| ValueTuple `DynamicData` | 3.7 | `IEnumerable<object[]>` |
| 构造函数注入 `TestContext` | 3.6 | 实例属性 |
| `[Retry]`/`[OSCondition]` | 3.8 | 无内置，自修 flaky |
| `[CICondition]` | 3.10 | 项目自有机制 |

**约定**：`sealed` 测试类；`[TestClass]`/`[TestMethod]`；AAA；命名 `MethodName_Scenario_ExpectedBehavior`；测试工程 `[ProjectName].Tests`。

**断言改写规则**（保留语义、参数顺序不可反）：
- `AreEqual` 参数序：expected 在前、actual 在后（保住失败输出标签）。
- 比较：`score > 0`→`Assert.IsGreaterThan(0, score)`；`score >= 60 && score <= 90`→`Assert.IsInRange(60, 90, score)`——期望边界在前、观测值最后。
- 泛型 `IsTrue` 替换：`IsTrue(list.Count>0)`→`IsNotEmpty`；`IsTrue(list.Count()==3)`→`HasCount(3,…)`；`IsTrue(x!=null)`→`IsNotNull`；同实例比较→`AreSame`；`list.Single(predicate)`+`IsNotNull`→`ContainsSingle`。
- 异常：lambda 只包住抛异常操作；`Throws<T>`（含派生）vs `ThrowsExactly<T>`（精确）；需要 `ParamName` 等属性时捕获返回值。
- 类型：3.8+ 优先统一 `Assert` 替代 `StringAssert`/`CollectionAssert`；旧版保持专用类。

**数据驱动**：内联值用 `[DataRow(...)]`（可 `DisplayName=`）；复杂数据 3.7+ 用 ValueTuple `DynamicData`（类型安全但仍是位置匹配，同名同型交换照样编译）；需要每行元数据用 3.8+ `TestDataRow<T>`。

**生命周期顺序**：`[AssemblyInitialize]` → `[ClassInitialize]` → 构造器（3.6+ 可注入 TestContext；否则属性注入在构造后赋值）→ `[TestInitialize]`（仅异步初始化用）→ 测试方法 → `[TestCleanup]` → `DisposeAsync` → `Dispose` → `[ClassCleanup]` → `[AssemblyCleanup]`。`[TestCleanup]` 失败也执行。

**超时/取消**：3.11+ 用 `[Timeout(ms, CooperativeCancellation = true)]` + `TestContext.CancellationToken`；3.6.4–3.10 用 `TestContext.CancellationTokenSource.Token`；裸 `[Timeout]` 不保证中断在途工作。

**MSTESTxxxx 分析器诊断**：按规则应用版本兼容修复，优先改代码而非抑制，重建确认消失。文件修改后跑最窄 `dotnet test` 验证——进程成功但 0 个测试被发现不算验证。

## 3. assertion-quality：断言质量分析（只报告，不代写）

把每条断言归入 12 类：Equality、Boolean、Null、Exception、Type、String、Collection、Comparison、Approximate、Negative、State/Side-effect（mock Verify）、Structural/Deep（快照/递归比较）。

**套件指标**：平均断言数/测试；类型散布 x/12；零断言测试%；仅平凡断言%；自指断言%（`AreEqual(input, Parse(input.ToString()))` 式同义反复——除非测试目的本身就是往返，且需配非平凡输入）；负向断言%（目标 ≥10%）；异常/状态/结构断言%；单类别测试%。

**校准规则（防误报）**：
- 判"弱"前先给反例：说出一个真实缺陷值仍能通过该谓词，说不出就不算弱。
- null 检查后跟有效值断言的，null 是守卫不算平凡；`IsTrue(result.IsValid)` 检查具体属性不算平凡；只有 `IsTrue(true)` 这类恒真才平凡。
- 异常测试天然低断言数，不扣分；mock verify、裸 `assert`、`if got != want { t.Error }` 都算真断言。
- 多样性≠数量：20 条相等断言是低多样；1 相等+1 null+1 异常是好多样。
- 异步测试中未 `await` 的断言按零断言处理。
- 报告规模匹配输入：小套件只给结论+一张每测试表，别灌仪表盘。

## 4. test-tagging：特征标签分类（audit 默认，明示才改）

**词表固定，不得自造**：`positive`/`negative`（每个测试至少其一）/`boundary`/`critical-path`/`smoke`/`regression`/`integration`/`end-to-end`/`performance`/`security`/`concurrency`/`resilience`/`destructive`/`configuration`/`flaky`。一个测试可多标签；`boundary` 等是附加的——边界成功仍计 `positive`。

**框架属性**：MSTest `[TestCategory("...")]`；xUnit `[Trait("Category","...")]`；NUnit `[Category("...")]`；TUnit `[Property("Category","...")]`；pytest `@pytest.mark.x`；JUnit5 `@Tag`。分类靠读断言与输入值，不靠猜名字；名字误导时读方法体。

**能力分级**：auto-edit（.NET/pytest/JUnit 等有规范语法）可编辑；report-only（Go 标准 testing、无约定的 Jest/Rust/XCTest）只出 Markdown 表；convention-based（Go build tag、`*_integration_test.go`）仅在用户确认约定后编辑。**审计动词（audit/classify/report）一律不改源码**。

**验证**：auto-edit 后 `dotnet build` + `dotnet test --list-tests --no-build` 确认可发现（不执行套件）；总数=清单行数，分布数由同一清单推导；保留既有标签不重复；类级标签不能替代方法级分类。

## 5. scaffold-dotnet-test-project：测试工程创建/接线修复

目标：让测试经**仓库真实构建入口**被发现，不是追求理想布局。先按状态选一条路：

| 仓库状态 | 动作 | 禁止 |
|---|---|---|
| 无合适测试工程 | 建一个有界工程+引用生产工程+注册 | 每个源工程建一个测试工程 |
| 有工程缺 `ProjectReference` | 只加该引用并验证 | 重建工程/重写测试 |
| 直接跑通过但缺席 `.sln`/`.slnx`/`.slnf` | 在 CI 用的入口点注册现有工程 | 重建工程或换解决方案格式 |
| 三者均已正确 | **零改动**，报告现有路径（要写测试方法→`code-testing`） | 任何"顺手规范化" |

**创建顺序**：用户明示框架 > 邻近测试工程 > 仓库包/SDK 约定 > 标准模板。`dotnet new xunit` 常生成 xUnit2 包——中心化 `xUnit.v3` 仓库须用 v3 模板或直接建最小 SDK 工程，绝不先生成 v2 再改写。删除模板 `UnitTest1.cs` 换成行为命名文件；中心化包管理时不写版本号。xUnit v3 + MTP 需 `<OutputType>Exe</OutputType>` + `<UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>`；`TestingPlatformDotnetTestSupport=true` 仅用于 VSTest 命令模式桥接。

**修复**：`dotnet add <test> reference <prod>`；`dotnet sln <entry> add <test>` 后**立刻** `dotnet sln <entry> list` 验证同一确切路径；`.slnf` 缺失先保证底层 `.sln` 含该工程再编辑过滤器；只改用户/CI 指定的那一个解决方案工件。

**验证**：新工程需模式感知的直跑（native MTP 用 `dotnet test --project`，VSTest 模式用位置参数）+ CI 的确切入口命令 + 注册列表。绿色 `dotnet build` 不是测试发现证据。

## 6. run-tests：给出/执行正确的 .NET 测试命令

**先选模式（决策表）**：

| 检测到的模式 | 命令形状 | 禁用 |
|---|---|---|
| classic 非 SDK | 仓库脚本，或 `MSBuild.exe` 全量构建 + `vstest.console.exe path\MyTests.dll /TestAdapterPath:...`（`packages.config` 先 `nuget restore`；需 Windows 开发者命令环境） | 假设 `dotnet test` 可用 |
| VSTest 模式/VSTest | `dotnet test [<path>] [VSTEST_OPTIONS]` | MTP 专属旗标（`--report-trx`、`--treenode-filter`） |
| VSTest 模式/MTP 桥 | `dotnet test [<path>] [DOTNET_OPTIONS] -- [MTP_OPTIONS]` | 省略 `--`（SDK 10 桥接同样要） |
| native MTP（SDK 10+） | `dotnet test --project <path> [MTP_OPTIONS]` | 位置路径、`--` 分隔符 |

`global.json` 的 `test.runner` 只选 **`dotnet test` 命令模式**，不等于执行平台。`--framework`/`--no-build`/`--verbosity` 等放 `--` 之前；只有 MTP 应用参数放其后。`dotnet test` 默认会构建，别"以防万一"先 build。

**过滤**（详见第 7 节语法）：用户点名子集就别跑全套；过滤运行成功退出还不够——核对输出的测试名/数确为请求范围，被忽略则修正语法重跑。

**报告与诊断对照**：

| 目的 | VSTest | MTP |
|---|---|---|
| TRX | `--logger "trx;LogFileName=x.trx"` | `--report-trx` |
| 结果目录 | `--results-directory <dir>` | 同左 |
| 诊断日志 | `--diag <file>` | `--diagnostic --diagnostic-output-directory <dir>` |
| 崩溃转储 | `--blame-crash` | `--crashdump` |
| 挂起转储 | `--blame-hang --blame-hang-timeout 5min` | `--hangdump --hangdump-timeout 5min` |
| 覆盖率 | `--collect "Code Coverage"` | `--coverage` |

MTP 各旗标依赖对应扩展（TrxReport/CrashDump/HangDump/CodeCoverage）已注册；不识别先查包引用再建议加包。`--verbosity diagnostic` 只是提高输出详细度，不写 VSTest 诊断日志。

**输出契约**：只要命令→先给一条可运行命令再一句语法解释；要求执行→报告确切命令与字面 `Passed: N, Failed: N, Skipped: N` 摘要；restore/build 失败≠测试失败，分别报告阶段与首条可行动错误；绝不把未跑/失败的命令说成成功。

## 7. filter-syntax：过滤器语法（平台×框架）

- **VSTest（MSTest/xUnit v2/NUnit）**：`--filter "<Property><Op><Value>[|&...]"`；运算符 `=` `!=` `~`(包含) `!~`；`|`=OR、`&`=AND、括号分组；属性：MSTest `FullyQualifiedName/Name/ClassName/Priority/TestCategory`，xUnit `FullyQualifiedName/DisplayName/Traits`，NUnit `FullyQualifiedName/Name/Priority/TestCategory`；无运算符视为 `FullyQualifiedName~值`。示例：`--filter "TestCategory!=Slow"`、`--filter "ClassName=Ns.A&TestCategory=Unit"`。
- **MTP + MSTest/NUnit**：表达式同上，SDK 8/9 放 `--` 后，SDK 10+ 直接给。
- **MTP + xUnit v3**：不用 `--filter`；用 `--filter-class/-method/-namespace/-trait`（含 `--filter-not-*` 排除，可多值）或组合表达式 `--filter-query "/*/<ns>/<class>/<method>[Category=Smoke]"`（路径段语法，`*` 通配）。
- **MTP + TUnit**：`--treenode-filter "/<Assembly>/<Namespace>/<Class>/<Test>"`，段内 `*` 通配，`[Category=Smoke]` 属性匹配，`(A)|(B)` 分组。
- **迁移翻译**：MSTest/NUnit/xUnit v2 两边语法一致；xUnit v3 需翻译：`FullyQualifiedName~ClassName`→`--filter-class *ClassName*`，trait→`--filter-trait "Category=Value"`。

## 8. platform-detection：判定平台/框架/命令模式

**工程系统**：根 `Sdk` 属性或 `<Sdk>` → SDK-style；`ToolsVersion`/`Microsoft.CSharp.targets`/显式 `<Compile Include>` → classic 非 SDK；`packages.config` → classic NuGet 管理。

**框架**：`MSTest` 元包或 `MSTest.Sdk` → MSTest；`xunit`/`xunit.v3*` → xUnit；`NUnit`+`NUnit3TestAdapter` → NUnit；`TUnit` → TUnit（仅 MTP）。classic 项目版本可能只在 `packages.config` + `<Reference HintPath>` 里。

**执行平台判定顺序**（先按 MSBuild 导入顺序解析 `UseVSTest`、runner 选择器、`TestingPlatformDotnetTestSupport`、`OutputType` 的**最终值与胜出来源**，后赋值的导入赢）：
1. 最终 `UseVSTest=true` → VSTest；若同时 `global.json` 选 native MTP 命令模式 → 冲突，报 `Platform: unavailable`。
2. native MTP 命令模式 + 兼容 MTP 应用 + 最终 `OutputType=Exe` → MTP。
3. SDK 8/9：runner 启用 + `TestingPlatformDotnetTestSupport=true` + `OutputType=Exe` → 经桥执行 MTP。
4. runner 启用但桥缺失/false 的双能力工程 → 实际 VSTest 执行；桥 true 但无 runner → VSTest。
5. runner+桥但输出不可执行 → 配置不完整，unavailable。

**信号角色别混**：runner 属性（`EnableMSTestRunner`/`EnableNUnitRunner`/`UseMicrosoftTestingPlatformRunner`）选测试应用；`TestingPlatformDotnetTestSupport` 只是 SDK 8/9 `dotnet test` 到达该应用的桥前提；`OutputType=Exe` 是宿主形状，不选择 MTP；`Microsoft.NET.Test.Sdk` 不蕴含 VSTest；`MSTest` 元包+`EnableMSTestRunner` 不隐式设桥。按 TFM 条件求值，不同 TFM 平台不同就分别报告。回答先给结论（`Platform: MTP` / `Framework: NUnit`）再一句因果证据。

## 9. mtp-hot-reload：MTP 控制台长驻热重载

仅用于用户明示要"编辑后自动重跑"的 MTP 控制台回路；一次性运行→`run-tests`；IDE/Test Explorer 重跑不是本功能。

1. **先检测平台**（按第 8 节流程）。**VSTest 硬停**：不装包、不改属性、不返回 `dotnet run` 热重载命令；给保真回退 `dotnet watch --project <path> test`（重建重跑，非热重载），迁移须用户明示。
2. `dotnet add <path> package Microsoft.Testing.Extensions.HotReload`（已装则保留版本跳过；经 `Microsoft.Testing.Platform.MSBuild` 自动注册，无需代码）。
3. 启用：环境变量 `TESTINGPLATFORM_HOTRELOAD_ENABLED=1`（推荐写进 `Properties/launchSettings.json` 的 profile）。
4. 运行：`dotnet run --project <path>`（**不是** `dotnet test`）；过滤放 `--` 后按框架语法（MSTest/NUnit `--filter`、xUnit v3 `--filter-method`、TUnit `--treenode-filter`）。宿主常驻等待编辑并自动重跑受影响测试。
5. **rude edit**（改签名/新类型）不可应用：Ctrl+C 停→`dotnet build`→重跑**同一原命令**；预期频繁则 `DOTNET_WATCH_RESTART_ON_RUDE_EDIT=1` + `dotnet watch run -- <原参数>`。绝不说旧宿主已应用未支持的编辑。
6. 完成：Ctrl+C 停宿主；一次性验证命令交回 `run-tests`。
