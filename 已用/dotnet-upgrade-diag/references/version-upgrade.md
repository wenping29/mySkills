# .NET 版本升级与公共 API 兼容性

蒸馏自源技能 `migrate-dotnet8-to-dotnet9`、`migrate-dotnet9-to-dotnet10`、`migrate-dotnet10-to-dotnet11`、`dotnet-breaking-changes`。覆盖：TFM 逐级升级（8→9→10→11）的六步流程与各版本破坏性变更清单、基础设施更新；以及修改"调用方不受你控制"的 .NET 代码时的兼容性门禁。不用于：.NET Framework 迁移；从 .NET 7 或更早升级（先补前一跳）；全新项目；测试框架/运行器迁移→`dotnet-test`；AOT/可空/Thread.Abort 专项→`aot-nullable.md`。

## 0. 通用六步流程（三个 migrate 技能共享）

1. **评估**：`dotnet --version` 确认目标 SDK 已装（未装即停并告知）；从 SDK 属性（`Microsoft.NET.Sdk.Web`→ASP.NET Core；`WindowsDesktop`+`UseWPF/UseWindowsForms`）、PackageReferences（EF Core/Extensions.Http/Hosting/Linq.Async 等）、Dockerfile 存在性、P/Invoke、BinaryFormatter/STJ/X509 用法判定涉及的技术域并记录要加载的参考文档；在**当前 TFM** 上做 `dotnet build --no-incremental` 建立干净基线并记录既有警告。
2. **改 TFM**：各 `.csproj`（或集中式 `Directory.Build.props`）`netX.0`→`netY.0`（多目标加项或替换）；`Microsoft.Extensions.*`/`AspNetCore.*`/`EntityFrameworkCore.*` 升到 Y.0.x（CPM 改 `Directory.Packages.props`）；`dotnet restore` 处理新警告。
3. **修编译错误与源码破坏**：按技术域加载 `references/` 下分域文档（csharp-compiler、core-libraries、sdk-msbuild 恒加载；aspnet-core、efcore、cryptography、extensions-hosting、serialization-networking、winforms-wpf、containers-interop、deployment-runtime 按选用）。**每批修复后重建**直至干净。
4. **行为变更**：不报错但改运行时行为——先过"高影响清单"，逐项判断是否依赖旧行为。
5. **基础设施**：Dockerfile 基础镜像、`global.json`（`rollForward` 建议 `latestFeature`，`disable`/`latestPatch` 可能解析失败）、VS 版本、解析 CLI/构建输出的 CI 脚本。
6. **验证**：clean build + `dotnet test` + 容器构建 + 冒烟（各版本重点见下）+ diff 审查确认无意外行为变更。

**契约**：破坏性变更信息**直接来自加载的分域参考**，不搜文件系统不查网页（例外：9→10 怀疑 CVE 时可查已发布安全公告）；每个逻辑边界（步骤 2/3/4/5）各提交一次；一次迁移一件事。

## 1. .NET 8 → 9（C# 13）

**restore/工具**：VS 17.12+ 才能编 `net9.0`；netstandard1.x 与 net7 目标出现新警告（考虑移除）。

**高频源码破坏**：
1. `params ReadOnlySpan<T>` 新重载优先绑定——`String.Join/Concat`、`Path.Combine`、`Task.WhenAll` 等；`Expression` lambda 内调用报 CS8640/CS9226。
2. `StringValues` 隐式转换与新 span 重载歧义→显式强转参数。
3. 新过时警告：SYSLIB0054（`Thread.VolatileRead/Write`→`Volatile.Read/Write`）、SYSLIB0055（ARM AdvSimd 有符号重载）、SYSLIB0056（Assembly.LoadFrom 哈希）、SYSLIB0057（`X509Certificate2` 二进制/文件构造器→`X509CertificateLoader`）。
4. C#13：`[InlineArray]` 禁用于 record struct（CS9259，改普通 struct）；迭代器引入安全上下文（外部 unsafe 类内的局部函数不再继承 unsafe，需加 `unsafe`）；空集合表达式 `[]` 不再用 span/非span 决胜重载（改按精确元素类型优先）。
5. `String.Trim(params ReadOnlySpan<char>)` GA 移除（预览期编译代码须改）。
6. **BinaryFormatter 运行时必抛**——项目用到就**停并告知用户**（重大决策）。
7. `HttpListenerRequest.UserAgent` 变 `string?`；WinForms 空性注解收紧、新安全分析器 WFO1000（属性须显式序列化配置）。

**高影响行为变更**：浮点→整数转换在 x86/x64 变**饱和**（不再回绕）；EF Core `Migrate()` 在有未应用模型变更时抛（**grep `HasData` 里的 `DateTime.Now/UtcNow/Guid.NewGuid()` 换成固定常量**）、在用户事务内抛；HttpClientFactory 默认 `SocketsHttpHandler`（强转 `HttpClientHandler` 抛 InvalidCastException）且 Trace 日志 header 默认脱敏；环境变量优先于 runtimeconfig.json；开发环境 HostBuilder 默认开 DI `ValidateOnBuild/ValidateScopes`。其他：`FromKeyedServices` 不再回退非键服务（抛）；容器镜像不再装 zlib；Intel CET 默认启用（不兼容原生库致进程终止）；JsonDocument 反序列化 JSON null 返回 `JsonValueKind.Null` 对象而非 C# null；ZipArchiveEntry 名遵守 UTF-8 标志；WPF `GetXmlNamespaceMaps` 返回类型变。

**基础设施**：镜像 8.0→9.0 并自装 zlib1g（若依赖）；`dotnet build` 交互终端默认 Terminal Logger（解析输出的脚本加 `--tl:off` 或 `MSBUILDTERMINALLOGGER=off`）；`dotnet workload` 输出格式变；dotnet-monitor 镜像 tag 简化。冒烟重点：BinaryFormatter、浮点转换、EF 迁移应用、HttpClientFactory 强转与日志、DI 验证、环境变量优先级。

## 2. .NET 9 → 10（C# 14）

**restore/工具**：NU1510（直接引用被裁剪=包已进共享框架，删显式引用）；`<PackageReference>` 无版本改为报错；`dotnet restore` 审计传递包（新漏洞警告要处理）。

**高频源码破坏**：
1. `System.Linq.Async` 与内置 `System.Linq.AsyncEnumerable` 冲突——移除该包或升 v7.0.0；传递引入加 `<ExcludeAssets>compile</ExcludeAssets>`；`SelectAwait` 按需改 `Select`。
2. SYSLIB0058（`SslStream.KeyExchangeAlgorithm/CipherAlgorithm/HashAlgorithm`→`NegotiatedCipherSuite`；旧属性用于拒绝弱 TLS 算法的，迁移时**必须保留等效校验**）、0059（SystemEvents.EventsThreadShutdown→AppDomain.ProcessExit）、0060（`Rfc2898DeriveBytes` 构造器→静态 `Pbkdf2(password,salt,iterations,hashAlgorithm,outputLength)`）、0061（`Queryable.MaxBy/MinBy` 比较器泛型改 `IComparer<TKey>`）、0062（`XsltSettings.EnableScript`）。
3. C#14：`field` 成属性访问器上下文关键字（局部变量叫 field 报 CS9272；成员引用不加 `this.` 报 CS9258→改名或 `@field`）；`extension` 禁作类型/别名/类型参数名；span 重载影响表达式树（`.Contains()` 可能绑到 `MemoryExtensions`、数组 `Reverse` 绑到原地 Span 扩展→强转 `IEnumerable<T>`/`.AsEnumerable()`/显式静态调用）。
4. ASP.NET Core：`WebHostBuilder/IWebHost/WebHost`、`ActionContextAccessor`、`WithOpenApi`、`IncludeOpenAPIAnalyzers`、`KnownNetworks`(IPNetwork)、Razor 运行时编译、`ApiDescription.Client` 包均废弃/过时；**`Microsoft.AspNetCore.OpenApi 10.0` 拉 OpenApi v2.x**——命名空间/模型重构，`OpenApiString/OpenApiAny` 删除（用 JsonNode）、`Reference` 类型替换、集合可为 null、`OpenApiSchema.Nullable` 移除。
5. SDK：`dotnet new sln` 默认 SLNX（旧格式 `--format sln`）；文件级指令禁双引号；`dnx.ps1` 移除；restore 不再支持 project.json。
6. EF Core：`ExecuteUpdateAsync` 改收普通 lambda（表达式树构造代码重写）；`IDiscriminatorPropertySetConvention` 签名变；`IRelationalCommandDiagnosticsLogger` 加 `logCommandText` 参数。
7. 加密：`MLDsa/SlhDsa` 成员 `SecretKey`→`PrivateKey`（如 `ExportMLDsaSecretKey`→`ExportMLDsaPrivateKey`）；`CoseSigner.Key` 可空；`GetKeyAlgorithmParameters()`/`PublicKey.EncodedParameters` 可返回 null；环境变量 `CLR_OPENSSL_VERSION_OVERRIDE`→`DOTNET_OPENSSL_VERSION_OVERRIDE`。
8. WinForms/WPF：同引两框架须消歧 `MenuItem/ContextMenu`；WPF 空 `ColumnDefinitions/RowDefinitions` 禁用。

**高影响行为变更**：**SIGTERM 默认处理器移除**——非 Generic Host 的控制台/容器应用须显式 `PosixSignalRegistration.Create(PosixSignal.SIGTERM, _ => Environment.Exit(0))`（ASP.NET Core 与 Generic Host 不受影响）；`BackgroundService.ExecuteAsync` 全跑后台线程（首个 await 前的同步段不再阻塞启动→顺序敏感代码移入 `StartAsync`/构造器或实现 `IHostedLifecycleService`）；配置 JSON null 不再转空串（非默认初值属性会被覆盖为 null）；**Microsoft.Data.Sqlite 时区三连**（无偏移 `GetDateTimeOffset` 按 UTC、REAL 列写入转 UTC、`GetDateTime` 带偏移返回 Utc；临时开关 `AppContext.SetSwitch("Microsoft.Data.Sqlite.Pre10TimeZoneHandling", true)`）；EF `.Contains()` 改多标量参数（大集合性能受影响，`UseParameterizedCollectionMode(Parameter)` 回退）；Azure SQL 兼容级≥170 JSON 列用 `json` 类型（会生成 ALTER 迁移）；STJ 多态类型属性与 `$type/$id/$ref` 冲突抛（加 `[JsonIgnore]`）。其他：BufferedStream.WriteByte 不再隐式 flush；容器默认镜像 Debian→**Ubuntu（Debian 停发）**；单文件应用不再从可执行目录找原生库；`MailAddress` 连续点校验；浏览器 HTTP 客户端默认流式响应；`Uri` 长度上限移除（曾用作输入闸门要显式补校验）；`XmlSerializer` 不再忽略 `[Obsolete]` 属性（敏感数据加 `[XmlIgnore]`）；`dotnet watch` 日志走 stderr。

**基础设施**：镜像 9.0→10.0；`DOTNET_ICU_VERSION_OVERRIDE` 改名；`NUGET_ENABLE_ENHANCED_HTTP_RETRY` 移除；Unix 需 OpenSSL 1.1.1+，macOS 不再支持 OpenSSL 原语。

**安全审查（验证步骤含）**：SYSLIB0058 迁移后 TLS 弱算法拒绝逻辑保留；obsolete 敏感属性被序列化排除；Uri 长度门仍在；异常处理器返回 true 前发安全遥测；连接串显式 Application Name 不泄版本；restore 漏洞审计发现被处理而非抑制。冒烟重点：信号处理/优雅停机、后台服务启动顺序、null 配置绑定、Sqlite 日期时间、多态 JSON、`.Contains()` 查询。

## 3. .NET 10 → 11（C# 15；预览期，覆盖至 Preview 3）

**restore/工具**：TFM→net11.0、包升 11.0.x；restore 错误先修完再继续。

**高频源码破坏**：
1. C#15：`Span<T>/ReadOnlySpan<T>` 集合表达式安全上下文改 declaration-block（外层作用域赋值报错→用数组类型或移作用域）；`with(...)` 在集合表达式中按构造参数解析（调同名方法用 `@with(...)`）；特性里 `nameof(this.P)`→去 `this.`；`dynamic` 右操作数的 `&&/||` 左操作数为接口类型时报编译错（强转具体类型或 dynamic）；`(X.Y) when` 现解析为带 when 的常量模式而非 cast（switch 表达式语法要复核）；`ref readonly` 委托/局部函数需 `InAttribute` 可用。
2. SYSLIB0063：`NamedPipeClientStream` 带 `isConnected` 的构造器过时（删参数用 3 参构造；`TreatWarningsAsErrors` 工程直接构建失败）。
3. EF Core Cosmos 同步 I/O 全删——`ToList()/SaveChanges()` 必抛，全转异步；`Microsoft.EntityFrameworkCore.Tools/.Tasks` 不再传递带 `.Design`（需要就显式引用）；MSBuild 属性 `EFOptimizeContext` 移除→`<EFScaffoldModelStage>`/`<EFPrecompileQueriesStage>`。
4. `Microsoft.AspNetCore.OpenApi` 依赖 **OpenApi 3.x**——直接使用 `OpenApiDocument/OpenApiSchema` 等类型的代码编译错，按 v3 升级指南改。

**行为变更**：DeflateStream/GZipStream 空负载也写头尾（依赖零长度输出的检查要改）；MemoryStream 容量上限与异常行为变；TAR 读取校验头部 checksum（手工/损坏档案开始失败）、`TarWriter` 硬链接写 `HardLink` 条目（消费方须处理）；`ZipArchive` 读校验 CRC32（截断档案抛 InvalidDataException）、`CreateAsync` 急加载（大档案内存）；`Environment.TickCount` 与 Windows 超时行为对齐；**macOS 移除 DSA**（抛异常，改 RSA/ECDSA）；和历最小日期修正；**硬件基线 x86-64-v2 / Windows Arm64 LSE**（部署目标要核验）；Linux 上 .NET Framework 的 Mono 启动目标不再自动设置；**BackgroundService 未处理异常现停整个 host**（不该拖垮应用的加 try/catch）；AIA 中间证书下载默认禁用（预装完整链或客户端发送中间证书）；Blazor `Virtualize` 默认 `OverscanCount` 3→15；Microsoft.Data.SqlClient 7.0 **Entra ID 认证拆包**（用到加 `Microsoft.Data.SqlClient.Extensions.Azure`）；`SqlVector<T>` 不再自动进 SELECT（显式投影）；SQLitePCLRaw 3.0 移除加密 bundle（sqlcipher 等）；NativeAOT Unix 原生库输出文件名加 `lib` 前缀。

**基础设施**：镜像 10.0→11.0；`global.json` 只更新 `sdk.version`（如 `11.0.100-preview.3`）**保留其余键与 rollForward**；核验硬件目标。冒烟重点：空流压缩、TAR 读写、Cosmos 全异步、macOS DSA、MemoryStream、span 集合表达式、后台服务异常、mTLS 链验证、Entra 认证、AOT 输出文件名。

## 4. 公共 API 兼容性门禁（dotnet-breaking-changes）

用于"改调用方不受你控制的代码前"：NuGet 库、有 `PublicAPI.Shipped/Unshipped.txt`、ApiCompat、多 TFM、InternalsVisibleTo、生成 partial 的仓库。**绿色构建会漏掉**可选参数、参数名、sealed、const 值、可空性、`#if` 造成的静默破坏。不用于：调用方全在同工程内的可执行项目；局部变量/私有成员改名；格式化；框架/SDK/NuGet 升级（用上面 §0-3）。重命名/提取/合并类重构同时走 csharp-refactoring（dotnet-dev）。

**先勘察**（存在哪些隐藏面决定计划，缺失的标记=不在范围）：
```bash
git ls-files "**/PublicAPI.Shipped.txt" "**/PublicAPI.Unshipped.txt"
grep -rl "EnablePackageValidation\|ApiCompat" --include=*.props --include=*.targets --include=*.csproj .
grep -rl "<TargetFrameworks>" --include=*.csproj --include=*.props . ; grep -rn "#if " --include=*.cs .
git ls-files "*.g.cs" "*.generated.cs" ; grep -rln "partial class\|partial record" --include=*.cs .
grep -rn "InternalsVisibleTo" --include=*.cs --include=*.csproj --include=*.props .
```
每个 IVT 名字查是否在本解决方案内：**不在=外部消费者**，你对它可见的每个 internal 都是契约，绿色构建证明不了它。动手前先验证请求前提为真（"去重"可能一方已委托另一方、"加 X"可能已存在）——已完成就零改动并报告委托调用点。

**四个隐藏面**：① 公共 API（任何库修改的默认面）——两道**不可互换**的门：源级 PublicApiAnalyzers（`PublicAPI.*.txt` 手工维护）与二进制级 ApiCompat/`EnablePackageValidation`；尊重存在的门，没有门就人工审查并标记，**不顺手加分析器基建**。类型移动用 `[TypeForwardedTo]`，重命名要 `[Obsolete]` shim 而非 forwarder。② 多目标与 `#if`——检查每个分支（含未激活的），保留有意分歧，逐 TFM/RID 重验。③ 生成/部分类——包含全部 partial 声明；生成文件视为派生物，改生成器输入/模板而非输出。④ InternalsVisibleTo——internal 跨程序集可见；解决方案外的 friend 不能更新，旧 internal 名留 `[Obsolete]` forwarder。

**绿色构建拦不住的决策表**（左=诱人改法，右=安全形状）：

| tempting | 为什么破坏 | 安全形状 |
|---|---|---|
| 给已发布方法加可选参数 | 二进制破坏：旧签名消失，已编译消费者 `MissingMethodException` | 保留 `Foo(a)`，新增**必填**参数重载 `Foo(a, b)`；只记录新重载 |
| 用编辑/删行修 RS0017 | Shipped 行=已发布契约 | 恢复被改成员，新面记入 Unshipped.txt |
| 给已发布接口加成员 | 所有实现者（含其他包）编译失败 | 默认接口实现（netstandard2.0/Framework 不支持）或新接口；DIM 只能经接口调用，具体类要暴露就同步加公共成员；两者都记录 |
| 重命名已发布成员 | 源码+二进制双破坏 | 新名+旧名 `[Obsolete]` forwarder；只记录新成员 |
| 删/改 IVT 到的 internal | 解决方案外 friend 绑定时失败 | 新名+迁移仓内调用+旧名 `[Obsolete]` forwarder+保留授权，点名保护的 friend |
| 改已发布成员参数名 | 命名实参调用方与 dynamic/后期绑定失败；仓内位置调用会掩盖 | **保持原名不改**（没有重载能替同一签名带不同名）；可"建议"改 XML 文档或下个大版本再改 |
| sealed 类/去 virtual/收紧参数可空性 | 派生类型、override、可空调用方破坏 | 视为破坏，升级处理而非直接改 |
| 改 const 值/可选参数默认值 | 旧值已编译进调用方 | 保留已发布值；另起新成员（可 `static readonly`）或新重载承载新行为；const 换 static readonly 本身源码破坏 |
| 改 `#if` 下某目标的值 | 只有该目标消费者受影响，改测试掩盖不了 | 按该目标的行为变更处理并明说 |

**偏离字面请求时**（用重载代替可选参数、留 forwarder、或干脆不改）最终答复必须含一句因果声明，不许用"为二进制兼容"这类标签敷衍：
> **Compatibility:** Kept `<确切旧签名>` unchanged because `<谁仍绑定它>` would `<具体失败>` if it changed. `<代替字面请求做了什么、为什么>`

收尾前让 diff 可审计：点名新入口与保留的确切旧入口；点名迁移的仓内调用方/模板/friend 与无法迁移而被 forwarder 保护的外部消费者；说明哪个基线未动、哪个新面被记录；报告同时跑过新旧入口的兼容性检查。无改动结果以 `No files changed.` 开头并给决定性证据。

**"这算破坏吗"/审 diff**：不编辑只回答——一行结论先行；每个消费者可见变更一条（改了什么、**binary/source/behavioral** 哪类、谁会坏、**为什么 CI 绿**、安全形状）；行为断言要有具体输入的新旧结果差异，不确定就写一行小程序两侧实测（框架解析器本就宽容，如 `bool.TryParse` 忽略空白；无操作改写不算破坏）；收尾一行 "Not breaking:" 覆盖其余所有 hunk 及理由。

**验证**：**每个** TFM 都 build+test（`dotnet test -f <tfm>`），不只默认；设了 `EnablePackageValidation` 必须 `dotnet pack`（包验证只在 Pack 后跑，build 不跑）；如实报告跑了哪些命令与结果。

**停并升级（不静默继续）**：请求已实现；公共/已发布 API 要变且无 shim/forwarder 也无门可拦；改可观测注解（可空性、`DynamicallyAccessedMembers`、`RequiresUnreferencedCode`、泛型约束）；只能在部分目标保持一致；唯一办法是改下次构建会被覆盖的生成输出。
