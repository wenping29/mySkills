# .NET / C# 专项开发

> 本文件是 `dev-expert` 的 .NET/C# 专项补充参考，不作为独立子技能计数，也不提供 `@` 显式调用入口。命中 C#、.NET、dotnet、ASP.NET Core、Minimal API、EF Core、Dapper、Blazor、MAUI、NuGet、xUnit、MSBuild、csproj、sln、Kestrel、Middleware、Dependency Injection 等信号时，按需与 `code-generation`、`code-review`、`test-generation`、`performance-benchmark`、`software-project` 协同加载。

## 适用边界

- 适用：C#/.NET 项目源码走读、ASP.NET Core API 开发、EF Core 数据访问、类库与解决方案设计、单元测试、异步与性能诊断。
- 不适用：未确认语言/框架时强行套用 .NET 结构；Java/PHP/纯前端项目不使用本参考。
- 版本基线：**默认 .NET 8（LTS）**；实际以项目 `*.csproj` 的 `TargetFramework`、`global.json` 和 CI 为准。`net5~net7` 已 EOL，遇到应提示升级 LTS。C# 12 特性（主构造函数、集合表达式等）仅在确认语言版本后使用。

## 源码分析流程

1. **先读结构**：查看 `.sln`、`.csproj`、目录与命名空间，识别 Web API / 类库 / Worker / Blazor 等形态与分层。
2. **找入口**：定位 `Program.cs`（Minimal API/HostBuilder）、`Startup.cs`（旧模板）、`HostedService`、MQ 消费者或核心业务入口。
3. **逐层深入**：沿调用链追踪 Endpoint/Controller → Service → Repository/DbContext → 外部依赖，标注关键分支与异常路径。
4. **识别依赖**：梳理 DI 注册（Scoped/Singleton/Transient）、项目引用、NuGet 包与版本、循环引用。
5. **总结输出**：给出项目概览、核心流程、关键类型职责、风险点和验证建议。

### 源码分析输出模板

```markdown
## 项目概览
- 技术栈：.NET 版本 / ASP.NET Core / EF Core / …
- 分层架构：
- 构建工具：dotnet CLI / MSBuild / Cake

## 核心流程
1. 入口：Program.cs / …
2. 业务逻辑：
3. 数据访问：
4. 外部依赖：

## 关键类型说明
| 类型 | 职责 | 关键方法 |
| --- | --- | --- |
| ... | ... | ... |

## DI 注册一览
| 服务 | 生命周期 | 备注 |

## 质量与风险
- 正确性 / 性能 / 安全 / 异步 / 建议验证
```

## 标准项目结构

```text
src/
├── Project.Api/            # 表现层：Program.cs、Endpoints/Controllers、Middleware
├── Project.Application/    # 业务层：Service、DTO、接口定义、验证
├── Project.Domain/         # 领域层：实体、值对象、枚举、领域异常
├── Project.Infrastructure/ # 基础设施：DbContext、仓储实现、外部客户端
└── Project.Tests/          # 测试项目（与 src 平级或按项目后缀）
```

- 依赖方向：Api → Application → Domain ← Infrastructure（Domain 不引用任何外层，符合 Clean Architecture 依赖规则，细则见 code-quality `step3`）。
- 单项目小工具可先两层（根 + `Infrastructure/`），不强行四段拆分（Karpathy 简洁优先）。

## 编码规范

- 类型/方法/属性 PascalCase，私有字段 `_camelCase`，常量与静态只读用 PascalCase 或 `const`。
- 优先构造器注入并注册到 DI；禁止服务定位器反模式（在业务代码里 `sp.GetService()` 拿依赖）。
- `async` 方法以 `Async` 结尾；全链路 `await`，禁止 `.Result` / `.Wait()`（死锁风险）；库代码不写 `ConfigureAwait(false)` 之外的同步阻塞。
- 禁止 `async void`（事件处理器除外）；取消令牌沿调用链传递 `CancellationToken`。
- 不吞异常；`catch` 后必须记录上下文（结构化日志 ILogger）、转业务异常或继续抛出；禁止 `throw ex` 丢栈，用 `throw`。
- DTO 与 Entity 分离，禁止把 EF 实体直接作为长期 API 响应契约（循环引用与过度暴露风险）。
- 可空引用类型（`<Nullable>enable</Nullable>`）保持开启；外部输入边界用 `null` 检查或 `[DisallowNull]`。
- 魔法数字/状态用 enum + `StringEnumConverter`；文件级 `using`、`ImplicitUsings` 保持项目一致。
- 分析器：启用 `dotnet Analyzers`（`Microsoft.CodeAnalysis.NetAnalyzers`、Id/x 系列），`TreatWarningsAsErrors` 建议 CI 开启。

## 数据访问（EF Core / Dapper）

- **EF Core**：关注 ChangeTracker 开销（读多场景 `AsNoTracking()`）、N+1（`Include`/投影 `Select` 替代懒加载）、事务边界（一个业务事务一个 `SaveChanges`）、迁移纪律（`dotnet ef migrations add` 必须人工审查生成的 SQL，禁止自动 `Migrate()` 上生产）。
- **查询翻译**：客户端求值会静默全表拉取——升级警告为错误（`ConfigureWarnings`）或开 `EnableDetailedErrors` 排查；复杂 SQL 优先拆为 Dapper。
- **Dapper/裸 SQL**：一律参数化 `@param`，禁止字符串拼接外部输入；动态表/列名走白名单。
- 批量写入：EF Core 用 `ExecuteUpdate`/`ExecuteDelete`（.NET 7+）或分批 `AddRange`；明确事务大小与失败回滚。
- 索引与分页：为高频 WHERE/ORDER BY 提供索引依据，深分页用 keyset 分页；协同 `mysql-database`（或对应数据库参考）。
- 连接弹性：生产启用 `EnableRetryOnFailure()`，但注意与显式事务的兼容限制。

## API 设计约定（ASP.NET Core）

- Minimal API 按 Feature 文件组织 + `MapGroup`；Controller 项目保持属性路由与既有风格一致，不混用两种入口范式。
- 统一响应体与 ProblemDetails：错误返回 `400/401/403/404/409/422/5xx` 语义状态码，禁止一律 200 包错误；全局异常用中间件或 `IExceptionHandler` 收敛。
- 模型校验落在 DTO（DataAnnotations 或 FluentValidation），端点内不堆手写 if。
- 版本与兼容：URL/头版本按项目约定；已发布字段只增不改不删；废弃走 `[Obsolete]` + 迁移公告。
- 幂等：写接口支持幂等键（`Idempotency-Key` 或业务唯一键）；限流用 `AddRateLimiter`（.NET 7+ 内置）。
- OpenAPI：.NET 8 用 `Microsoft.AspNetCore.OpenApi` + SwaggerUI/Swashbuckle，接口变更同步示例。
- 分工：通用 API 规范以 `api-design.md` 为准，本节只补 .NET 落地约定。

## 异步与并发

- `Task` 组合用 `WhenAll` 而非逐个 await 串行；并发上限用 `SemaphoreSlim` 或 `Parallel.ForEachAsync(Scoped)` 显式控制。
- 后台任务：`BackgroundService`/`IHostedService` 必须处理 `ExecuteAsync` 异常与优雅停机（`StopAsync`、`CancellationToken`）。
- 共享状态：优先不可变类型 + `record`；必须可变时用 `ConcurrentDictionary`/`lock`/`Interlocked`，并说明选择理由。
- `Channel<T>` 做生产者-消费者管道，替代手写队列+信号量。
- 定时任务：进程内 `PeriodicTimer`（.NET 6+）或外部调度；多实例部署必须考虑分布式锁/幂等。

## 安全

- **认证授权**：JWT Bearer / Cookie Identity 集中配置；策略授权 `RequireAuthenticatedUser`/`AddPolicy`，禁止端点内手写角色 if。
- **越权（IDOR）**：按 id 取资源必须校验归属（`where x.OwnerId == currentUser`），不能只依赖前端不传别人 id。
- **注入**：EF/Dapper 参数化；`Process.Start` 外部命令禁拼接用户输入；Razor 默认转义，`Html.Raw` 必须白名单来源。
- **反序列化**：`System.Text.Json` 禁用 `TypeInfoResolver` 多态未白名单；禁止 `BinaryFormatter`（.NET 5+ 默认禁用，保持）。
- **SSRF**：`HttpClient` 请求用户可控 URL 前做目标白名单 + 内网/元数据地址拒绝。
- **密钥管理**：连接串/密钥走 User Secrets（开发）+ 环境变量/Key Vault（生产），禁止 `appsettings.json` 明文入库；`.gitignore` 覆盖 `secrets*.json`。
- **上传与路径**：文件名白名单 + `Path.GetFullPath` 规范化校验，防路径穿越；限制大小与 MIME。
- **口令与加密**：口令 ASP.NET Core Identity（PBKDF2）或 BCrypt.Net；对称加密 AES-GCM；禁用 MD5/SHA1/ECB。
- **供应链**：`dotnet list package --vulnerable --include-transitive` + NuGetAudit（.NET 8 默认开）；引入新包前查 CVE（协同 `threat-modeling`）。
- **HTTP 安全**：HSTS、HTTPS 重定向、CORS 显式白名单（禁止 `AllowAnyOrigin` + `AllowCredentials` 组合）。

## 性能与诊断

- 证据优先：接口耗时、`dotnet-counters`、`dotnet-trace`（perfview 格式）、GC 模式、线程池指标；没有基线不得声称优化有效。
- 常见反模式：同步阻塞异步（`.Result`）、大对象堆（LOH）字符串拼接（用 `StringBuilder`/`Span<T>`）、每请求 new HttpClient（用 `IHttpClientFactory`）、EF 全表拉取、Singleton 持有 Scoped 依赖（Captive Dependency）。
- 序列化热点：`System.Text.Json` source generator（`JsonSerializerContext`）替代反射。
- 冷启动与内存：Server GC vs Workstation GC 按部署形态选择；容器化注意 `DOTNET_gcServer` 与内存限额联动。

## 验证命令

```bash
dotnet build -c Release
dotnet test
dotnet format --verify-no-changes     # 风格门禁
dotnet list package --vulnerable --include-transitive
dotnet ef migrations script --idempotent   # 发布前审查迁移 SQL
dotnet run --project src/Project.Api
```

## 关联 reference

- `code-generation`：生成 Endpoint/Controller、Service、DTO、DbContext、测试代码。
- `code-review`：审查 .NET 代码时按本文件安全/异步/EF 清单补充专项检查。
- `test-generation` / `dotnet-testing`：xUnit/NSubstitute/WebApplicationFactory 测试（分层策略与模板见 `dotnet-testing.md`）。
- `performance-benchmark`：dotnet-trace/counters、BenchmarkDotNet 基准对比。
- `api-design`：通用 API 规范；本文件只补 ASP.NET Core 落地部分。
- `mysql-database`：索引依据、慢 SQL、分页与批量写入规范（SQL Server 场景同理迁移判据）。
- `threat-modeling`：依赖引入前审查、STRIDE 与供应链安全。
- `production-readiness`：发布回滚、监控告警与巡检。
- `code-quality`：SOLID/坏味道/重构手法方法学权威定义（分层与依赖规则见其 step3/step5）。
