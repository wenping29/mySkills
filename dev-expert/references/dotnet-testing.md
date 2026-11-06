# .NET 测试专项参考

> 本文件是 `test-generation` 的 .NET/xUnit 补充参考，**不作为独立子技能计数，也不提供 `@` 显式调用入口**。命中 C#、xUnit、NUnit、Moq、NSubstitute、WebApplicationFactory、EF Core 测试、Testcontainers (.NET)、BenchmarkDotNet 等信号时按需加载，并与 `dotnet-development.md`、`api-design.md` 协同。

## 测试分层

- **单元测试（xUnit + NSubstitute/Moq）**：覆盖纯业务逻辑、边界条件、异常分支；被测对象直接 `new`，依赖用构造器注入替身；**不启动 Host**。
- **集成测试（`WebApplicationFactory<Program>`）**：真实 HTTP 管道 + DI 容器，覆盖端点契约、认证授权、中间件、模型绑定；API 项目验证的**默认升级路径**。
- **数据层测试**：优先 Testcontainers（真实数据库行为一致）；纯逻辑查询可用 InMemory Provider，但**禁止用它验证依赖真实 SQL 语义的行为**（事务、唯一约束、`ExecuteUpdate`、数据库函数）。
- **回归测试**：每个已修复缺陷至少补一条可复现用例（失败先行或明确复现步骤）。

## 基础规则

1. 一个测试只验证一个主要行为；命名采用 `方法名_场景_期望`（如 `Transfer_InsufficientBalance_ThrowsDomainException`），不用 `Test1`。
2. 同时断言**返回值与副作用**：响应状态/JSON、数据库状态、事件发布、MQ 发送、缓存写入。
3. 断言用 FluentAssertions（`Should()`）或 xUnit 原生 `Assert`；**禁止只断言"不抛异常"**当作通过；异步断言用 `await Assert...` / `Should().ThrowAsync<>()`。
4. 时间、随机、ID 生成必须可注入（`TimeProvider`（.NET 8）/ `IClock`、`IdGenerator`）；测试内禁止 `DateTime.Now` 直取。
5. 测试必须可重复执行：不依赖执行顺序；xUnit 同类内实例隔离、跨类并行，共享静态状态必须显式加锁或消除。
6. 涉及权限与校验时，**允许路径与拒绝路径成对覆盖**，不得只测 happy path。
7. 测试数据构造集中在 Fixture 类 / Builder / AutoFixture，不在测试主体散落大段对象初始化。
8. `[Theory]` + `[InlineData]`/`[MemberData]` 覆盖参数化边界，替代复制粘贴多个 `[Fact]`。

## Host 与容器策略

- **默认不启动 Host**：单元测试纯替身；只有需要管道能力时才升到 `WebApplicationFactory`。
- `WebApplicationFactory` 用 `IClassFixture<>` 复用实例（创建昂贵）；`builder.ConfigureTestServices()` 替换外部依赖，勿改生产注册逻辑。
- 认证测试：`AddAuthentication(Test).AddScheme<...>()` 假认证方案，或生成真实 JWT；断言 401/403 与越权拒绝路径。
- 配置隔离：`appsettings.Test.json` / `WithAppSettings()`，不污染主配置；`IHostedService` 在测试中用替身或 `NoOp`。

## 数据与外部依赖

| 依赖类型 | 推荐策略 | 说明 |
| - | - | - |
| 关系型数据库 | **Testcontainers**（MsSql/Postgres/MySql module）优先；纯查询逻辑可用 InMemory | 唯一约束、事务、`ExecuteUpdate`、迁移脚本必须真实库验证 |
| 事务回滚 | 集成测试每用例独立数据库容器/独立事务并回滚 | ⚠️ 与 `SaveChanges` 提交语义冲突时改为数据清理策略，勿假回滚 |
| 缓存 / Redis | Testcontainers 或 `IDistributedCache` 替身 | 断言命中/未命中与过期行为，不只断言返回值 |
| 消息队列 | Testcontainers 或 mock producer | 断言消息内容、发送次数、重试次数 |
| 外部 HTTP | WireNet MockServer / `HttpMessageHandler` 替身 + `IHttpClientFactory` 注入 | 必须显式模拟**超时**与 **5xx**，验证降级路径 |
| 时间 | `TimeProvider` 注入，测试用 `FakeTimeProvider`（Microsoft.Extensions.TimeProvider.Testing） | 固定"现在"后断言过期/超时逻辑 |
| 文件系统 | `Path.GetTempPath()` + 用例后清理，或内存 FS 抽象 | 不写真实业务目录 |

## Mock 规范

- 优先 **NSubstitute**（意图清晰）或 Moq；只 mock **自己的抽象接口**，不 mock 具体类（避免过度耦合实现）。
- 不 mock `DbContext`——用真实 InMemory/Testcontainers 实例；mock EF 查询是经典反模式。
- `Verify`/`Received()` 断言交互次数只在"交互本身是契约"时使用（如"必须发送且仅发送一次"）；否则断言状态结果。
- 禁止 mock 值对象、record、纯数据 DTO。

## 覆盖率与运行

```bash
dotnet test                                   # 全量
dotnet test --filter "FullyQualifiedName~TransferTests"
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura   # Coverlet
dotnet test --settings runsettings.parallel.json   # 并行策略固定化
```

- 覆盖率目标按模块设定（核心业务 ≥ 80%，工具层不强求）；**分支覆盖优先于行覆盖**，异常路径必须有对应用例。
- CI 门禁：`dotnet test` + 覆盖率阈值 + `dotnet format --verify-no-changes` 三件套。

## 算法边界用例（图/递归/状态机）

同 `test-generation.md` 的算法边界用例清单（0/1 节点、自环、互环、菱形 DAG、平行边、方向遍历）；.NET 场景用 `[Theory]` + `MemberData` 枚举结构，property-based 可用 FsCheck.Xunit（单调性/交换律断言）。

## 关联 reference

- `test-generation`：通用测试生成流程、Spec 场景覆盖检查、防作弊红线（不得为通过放宽断言）。
- `dotnet-development`：被测代码的分层、异步与 EF 约定。
- `api-design`：端点契约测试的入参出参与状态码判据。
- `performance-benchmark`：BenchmarkDotNet 基准与耗时阈值断言的统计口径。
- `code-quality`：FIRST 原则与测试坏味道（脆弱测试、大球泥团）方法学。
