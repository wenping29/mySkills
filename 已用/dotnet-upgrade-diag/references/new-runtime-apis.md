# .NET 11 新 API 与实验性测试分析

蒸馏自源技能 `process-api-net11`、`system-text-json-net11`、`exp-mock-usage-analysis`、`exp-test-maintainability`。覆盖：net11.0+ 的 `System.Diagnostics.Process` 便利 API、`System.Text.Json` 新面（PascalCase 命名策略与强类型元数据），以及两个实验性分析技能（mock 使用审计、测试套件重复度分析）。不用于：目标为 net10.0 及更早的项目（§1/§2 的 API 不存在）；写新测试/修测试写法→`dotnet-test`；测试框架迁移→`dotnet-test`。

## 1. Process API（.NET 11）

**新类型**：`ProcessExitStatus`（`ExitCode`/`Canceled`/`Signal`——按外部命令契约解释 ExitCode，**没有通用 Success 属性**）；`ProcessTextOutput`（`ExitStatus`/`StandardOutput`/`StandardError`/`ProcessId`）；`ProcessOutputLine`（`Content`/`StandardError`，readonly struct）。

**静态便利方法**（`ProcessStartInfo` 重载均要求 `UseShellExecute=false`，这是 .NET 默认）：
- `Process.Run / RunAsync`：启动并等退出，返回 `ProcessExitStatus`，不捕获输出；`silent: true` 把标准句柄重定向到 NUL 丢弃；超时/取消即杀进程。
- `Process.RunAndCaptureText / …Async`：启动并同时捕获 stdout+stderr，**消除双流管道缓冲死锁**；`ProcessStartInfo` 重载下由调用方自行设 `RedirectStandardOutput/Error=true`（BCL 不改传入参数）；超时/取消即杀进程。简单 CLI 场景（无需取消/异步扩展）优先同步版。
- `Process.StartAndForget`：启动即返回 PID 并释放全部句柄资源（纠正"Dispose 会杀进程"的误解——Dispose 只释放资源不杀进程）；未显式提供的标准句柄默认到空设备。`UseShellExecute` 或任一 `Redirect*` 为 true 时抛 `InvalidOperationException`（要读输出就用捕获/流式 API）。

**实例方法**（在 `Process` 实例上读自身 stdout/stderr，保证无 OS 管道溢出死锁；要求启动时 `RedirectStandardOutput/Error=true`）：`ReadAllText[Async]` 返回 `(string StandardOutput, string StandardError)` 元组、`ReadAllBytes[Async]`、`ReadAllLines[Async]`（`IEnumerable<ProcessOutputLine>` / `IAsyncEnumerable`）。示例：`var (stdout, stderr) = await process.ReadAllTextAsync();`

**ProcessStartInfo 新属性**：
- `KillOnParentExit`：父进程退出（含崩溃与强杀）时终止子进程；支持 Windows/Linux/Android；要求 `UseShellExecute=false`。跨平台代码要**按平台守卫赋值**（`OperatingSystem.IsWindows()/IsLinux()/IsAndroid()`），需要自动清理时在不支持平台上显式失败，而不是起了个无保护子进程。
- `InheritedHandles`（`IList<SafeHandle>?`）：精确控制哪些句柄被子进程继承，防资源泄漏。标准句柄始终继承（不必列入）；空列表=只继承标准句柄；目前仅允许 `SafeFileHandle`/`SafePipeHandle`；Windows 启动不再用全局锁（并行起进程可受益）；**并发启动不得传同一句柄**（运行时临时改继承位——共享句柄的启动要串行化或各用独立句柄）；传入前不要自行开启句柄继承（否则其他进程启动 API 可能意外继承）；无原生句柄继承控制的 Unix 上设置它会严重拖慢启动；非 null 要求 `UseShellExecute=false` 且不能配非空 `UserName`。
- `StartDetached`：脱离父终端/job 会话启动，父退出后存活；要求 `UseShellExecute=false`。

**典型用法**：`ProcessTextOutput r = Process.RunAndCaptureText("git", ["status"]);` 后查 `r.ExitStatus.ExitCode`；`await foreach (var line in process.ReadAllLinesAsync())` 按 `line.StandardError` 分 `[Err]/[Out]` 前缀；`int pid = Process.StartAndForget("notepad.exe");`。

## 2. System.Text.Json（.NET 11）

三个新面各自替代一个旧 workaround：`JsonNamingPolicy.PascalCase`（替代自定义策略子类或逐成员 `[JsonPropertyName]`）；`JsonSerializerOptions.GetTypeInfo<T>()`（替代非泛型+强转）；`TryGetTypeInfo<T>(out …)`（替代 try/catch 探测）。**应用后必须真跑并展示输出**，不是向用户描述 API。

**决策表**：

| 需求 | 在 net11.0 上这样做 | 绝不 | 验证 |
|---|---|---|---|
| PascalCase 属性名 | `options.PropertyNamingPolicy = JsonNamingPolicy.PascalCase;` | 自定义 `JsonNamingPolicy` 子类、逐成员 `[JsonPropertyName]`、手工改大小写 | 输出键为 `"Name"`/`"Age"` |
| PascalCase 字典键 | `options.DictionaryKeyPolicy = JsonNamingPolicy.PascalCase;` | 只设 PropertyNamingPolicy、预转换字典 | `pendingOrders`→`"PendingOrders"` |
| 强类型 `JsonTypeInfo<T>` | 设 `TypeInfoResolver = new DefaultJsonTypeInfoResolver()` 后 `options.GetTypeInfo<T>()` | `(JsonTypeInfo<T>)options.GetTypeInfo(typeof(T))` 强转 | 变量即 `JsonTypeInfo<T>` 无强转 |
| 无异常探测元数据 | `if (options.TryGetTypeInfo<T>(out var info)) {…} else {…}` | `try { GetTypeInfo… } catch` | 无 try/catch，两分支都处理 |

**要点**：`GetTypeInfo<T>()` 无 resolver 时抛 `NotSupportedException(NoMetadataForType)`——反射应用设 `DefaultJsonTypeInfoResolver`，裁剪/AOT 用源生成 `JsonSerializerContext`。**文件级应用（`dotnet run app.cs`）默认关闭 STJ 反射**（`IsReflectionEnabledByDefault=false`），连普通 `Serialize` 都抛——每个 options 显式设 resolver，或改用普通项目（普通 csproj 项目反射默认可用不需要）。运行前提：`dotnet --list-sdk` 确认能编 `net11.0`；缺 SDK 且用户要求实跑→官方 dotnet-install 脚本按 **channel（先 GA `11.0`，GA 前 `-Quality preview`）装到项目本地目录**（`.dotnet/`），全路径调用；不要管理员、不改机器 PATH、不替换已装 SDK；装不上/跑不了就仍给出完整 net11 程序并如实报告**未运行**——绝不拿 net10 或自定义策略替代后谎称验证过 net11 特性。TFM 显式钉 `net11.0`（csproj 或 `#:property TargetFramework=net11.0`）。

**验证清单**：目标 net11.0 可见✓；PascalCase 用内置策略无自定义/无逐成员属性✓；字典键设了 `DictionaryKeyPolicy`✓；泛型 `GetTypeInfo<T>` 无强转且 options 有 resolver✓；探测用 `TryGetTypeInfo` 无 try/catch✓；`dotnet run` 实跑退出 0 且贴出实际 JSON✓；文件级应用每个 options 都带 resolver✓。

## 3. Mock 使用审计（exp-mock-usage-analysis）

把每个 mock 配置沿**生产代码执行路径**追踪，判定哪些真正被行使、哪些死/不可达/冗余/可替换。支持 Moq（`new Mock<T>()/.Setup/.Verify`）、NSubstitute（`Substitute.For<T>()/.Returns/.Received`）、FakeItEasy（`A.Fake<T>()/A.CallTo/.MustHaveHappened`）——全文用对应框架术语不混用。不用于：写新 mock/测试；非 mock 反模式（→dotnet-test 的 test-anti-patterns）；mock 框架间迁移。

**流程**：① 读测试**并必读生产代码**（不掌握被测方法控制流就无法判断配置必要性），识别框架。② 逐测试方法列出每条配置行，按该测试的实际输入追踪生产路径，分类：**Used**（路径上真被调用）；**Unreachable**（守卫子句提前返回/先抛异常，分支走不到——如测试预期首行就抛 `ArgumentOutOfRangeException` 却配了 `UpdateStock`）；**Unused**（被测方法根本不调该成员，无论输入）；**Redundant**（多测试重复同一默认配置应共享）。重点：早退与守卫、先抛后依赖、按渠道/类型分派（其他渠道的配置是死的）、只 Verify 不断言返回值的测试。③ 找可替换 mock：`Mock<ILogger<T>>`→`NullLogger<T>.Instance`（除非断言日志输出）；`Mock<IOptions<T>>`→`Options.Create(new T{…})`；DTO/record/值对象→直接 `new`。同时**明确确认哪些 mock 放对了位置**：外部边界（DB/HTTP/消息队列/三方 API）与安全敏感类型应保持 mock。④ 报告：每条=测试方法+配置行、为何不必要（沿生产路径解释）、具体修复（删哪些行/换什么/如何抽共享）；重复配置给 before/after 抽取示例。

**验证**：读过生产代码并追踪路径（不是只看测试）；每条发现落到具体方法与行；Unreachable 说明哪条路径使其不可达；正确 mock 的外部边界显式记为恰当；术语与框架一致。

## 4. 测试套件可维护性分析（exp-test-maintainability）

**只分析不改文件**。找重复样板、copy-paste 测试与结构性重复，产出带 before/after 的重构建议报告。支持 MSTest（`[TestClass]/[TestMethod|DataTestMethod]`）、xUnit（无类标记/`[Fact]|[Theory]`）、NUnit（`[TestFixture]/[Test|TestCase|TestCaseSource]`）、TUnit（无类标记/`[Test]`）。不用于：从零写测试；反模式/代码味道（→test-anti-patterns）；真正执行重构（用户要就直接帮做）；深度 mock 审计（→§3）。

**五类问题**：1) **重复构造**——同一对象在 3+ 方法以相同/近似参数 new：抽 `CreateSut()` 工厂/`[TestInitialize]`/构造器/复杂对象用 builder。2) **重复断言序列**——同一组属性断言在 3+ 方法：抽断言辅助（`AssertValidOrder(…)`）/框架断言扩展/标准 `Verify` 方法。3) **copy-paste 方法**——结构相同只差字面值、命名呈 `Method_Input1_Result` 模式：转 `[DataRow]/[InlineData]/[TestCase]`；复杂输入用 `[DynamicData]/[MemberData]/[TestCaseSource]`；**编译期常量优先 DataRow+DisplayName，计算值才 DynamicData**；参数值不自明（如 `[DataRow(3,7,42)]`）时加 DisplayName。4) **重复 setup/teardown**——跨类相似初始化/清理（DB seeding、文件、HttpClient 配置、Dispose 模式）：共享基类或 fixture、组合优于继承、上下文工厂。5) **重复基础设施**——同类 mock 配置/Handler 脚手架跨类复制：共享 fixture 库、可复用 fake、测试 harness。

**校准规则（报告前过滤）**：只在 **3+ 次出现**时报（两次相似可能是有意清晰）；不 flag 简单构造（`new Calculator()`、`new User(1,"Alice")` 不值得 builder）；**尊重有意冗余**——每个测试自包含且独立可读是合法选择，记录但不算问题；区分结构相似与真实重复（AAA 天然长得像，只 flag 实际代码重复）；考虑重构爆炸半径（20 个测试共享的 helper 制造耦合，注明权衡）；套件本来干净就明说，只报轻微机会也是有效结论。

**报告结构**：摘要（按类别计数；干净就开头直说）→分类发现（类别、具体方法与文件位置、重复代码样本、before/after 建议、预估简化行数/方法数）→优先级（出现次数×复杂度×风险，低风险抽取先行）→每条权衡（换来可读性、失去局部性/独立性、按次数是否值当）。**验证**：每条有位置+实际重复代码+before/after；过 3+ 阈值；未 flag 简单构造；权衡已注明。
