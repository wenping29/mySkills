# Web API 与数据访问

蒸馏自源技能 `dotnet-webapi`、`create-datadriven-aspnetcore`、`optimizing-ef-core-queries`。

## 一、ASP.NET Core Web API 端点（dotnet-webapi）

用于新增/修改 Controller 或 Minimal API 端点、OpenAPI/Swagger、`.http` 测试文件、全局错误处理。不用于：一般 C# 风格、EF 建模/查询优化（见本文第三节）、前端/Blazor、gRPC、SignalR。

### 1. 定风格

先扫描：`ControllerBase`/`[ApiController]` → 已有 Controller 就继续 Controller；`app.MapGet/MapPost...` → 继续 Minimal API；新项目默认 Minimal API。**同一项目不混两种风格。**

### 2. 请求/响应类型

- 绝不直接暴露 EF 实体于请求/响应体。
- **所有 DTO 用 `sealed record`**（响应可用位置参数记录；请求用 `init` 属性让数据注解自然工作）。不用可变类（`{ get; set; }`）。
- 命名：`Create{Entity}Request` / `Update{Entity}Request` / `{Entity}Response` / `{Entity}ListResponse`。
- 所有暴露 DTO 加 `<summary>` XML 注释——自动进入 OpenAPI 规范。
- 日期时间用 `DateTimeOffset` 不用 `DateTime`（保留 UTC 偏移、ISO 8601 带偏移序列化）。
- 枚举默认序列化为字符串（`JsonStringEnumConverter`；Minimal API 用 `ConfigureHttpJsonOptions`，Controller 用 `AddControllers().AddJsonOptions`），除非用户明确要整数。
- 严格 JSON 设置（`NumberHandling.Strict`、大小写敏感、禁重复属性、`WhenWritingNull`）**仅新项目或用户明确要求**，既有 API 不擅自收紧以免破坏客户端。
- Minimal API 数据注解验证需显式注册：.NET 10+ `builder.Services.AddValidation();`（Controller 自动）。

### 3. 实现端点

- Minimal API 按资源组织：每个资源一个静态类 + `Map{Resource}(this WebApplication app)` 扩展方法，`Program.cs` 依次调用。
- **优先 `TypedResults`**（签名嵌入响应类型信息供 OpenAPI 用）；多结果类型时给 lambda 显式返回类型 `Task<Results<Ok<ProductResponse>, NotFound>>`。裸三元里用 `TypedResults.Ok/NotFound` 不加显式注解会 CS1593（`Ok<T>` 与 `NotFound` 无公共基类）。7+ 分支可退回 `Results` 工厂。
- 状态码：GET 单资源 200/404；GET 列表 200；POST 创建 **201 + Location**（`CreatedAtAction` / `TypedResults.Created`），400/409；PUT/PATCH 200，400/404；DELETE **204**，404/409。
- 每个端点签名接受 `CancellationToken` 并转发到全部下游 async 调用（服务、EF、HttpClient）。

### 4. OpenAPI

- .NET 9+ 用内置 `builder.Services.AddOpenApi()` + `app.MapOpenApi()`（默认 `/openapi/v1.json`），无需额外包。**禁止给 .NET 9+ 项目加任何 `Swashbuckle.*` 包**（与 9/10 的 OpenAPI 类型有兼容问题）；.NET 8 及以下可接受 Swashbuckle；已装则保留除非用户要求移除。
- 端点元数据链：`.WithName()`、`.WithSummary()`、`.WithDescription()`、`.Produces<T>(StatusCodes...)`。

### 5. 错误处理

全局异常处理器，端点内不写 try-catch；所有错误响应用 RFC 7807 Problem Details。.NET 8+：`AddProblemDetails()` + `app.UseExceptionHandler()` + `app.UseStatusCodePages()`。需自定义异常→状态码映射时实现 `IExceptionHandler`（`KeyNotFoundException`→404、`ArgumentException`→400、`InvalidOperationException`→409，未匹配返回 false 交给默认处理器；返回 true 会抑制诊断中间件，先记日志；`Detail` 不放 `exception.Message` 防泄漏）。注册：`AddExceptionHandler<ApiExceptionHandler>()`。**异常处理器类放 `Middleware/` 文件夹**，不放项目根。

### 6. 服务层

不向控制器/端点直接注入数据存储。每个服务定义接口 + `sealed` 实现（拥有数据访问与实体↔DTO 映射），DI 按接口注册：`AddScoped<IProductService, ProductService>()`。

### 7. `.http` 测试文件

项目根创建，覆盖每个新端点至少一个请求（真实 body、含错误路径如不存在 ID），端口匹配 `launchSettings.json`。

### 8. 验证与构建

`dotnet build` 零错误零警告 → 启动确认 OpenAPI 文档含全部端点 → 跑 `.http` 请求核对状态码。

常见坑速记：实体直接当响应→换 sealed record DTO；POST 返回 200→201+Location；忘 CancellationToken；混风格；三元 TypedResults 无返回类型注解；DTO 可变类；服务无接口；.NET 9+ 加 Swashbuckle；DTO 缺 XML 注释；用 DateTime；枚举存整数。

## 二、数据驱动 ASP.NET Core 脚手架（create-datadriven-aspnetcore）

**不用 CLI 脚手架/代码生成工具**手工生成 Razor Pages/Blazor 组件/MVC Controller+视图/Minimal API 的完整 CRUD，匹配项目现有 CSS 框架与编码模式；`dotnet` 的 build/restore/migrations 照常。非 ASP.NET 项目或需要 CLI 脚手架时不用。

### 执行清单（按序，不可只做子资源就停）

**所有 EF 脚手架**
1. 先读项目文件、`Program.cs`、目标模型、验证注解、导航属性与外键。
2. 复用请求指定的既有 `DbContext`，否则新建；只加所需 provider 包并 `AddDbContext` 注册（连接串按请求）。需要迁移而缺 `Microsoft.EntityFrameworkCore.Design` 时补加（`PrivateAssets="all"`）。
3. 为请求实体**及每个必需外键父实体**生成完整 CRUD：列表、详情、创建、编辑、删除。
4. 走 EF 迁移生命周期（建迁移并应用）；**绝不 `EnsureCreated` 或在 `Program.cs` 种子数据**。
5. restore、build、测试生成的项目；报错先修再交付。

**MVC/Razor Pages/Blazor**：先查现有 layout、CSS、代表性 UI；生成子级与必需父级完整 UI 流并提供导航路径（能先建父再建子）；匹配现有 UI 框架；Blazor 保留既有 render-mode 配置。

**Minimal APIs**：每资源一个路由组，映射 GET(列表/按 ID)/POST/PUT/DELETE（父与子都要）；每端点加 OpenAPI 元数据（唯一名、tags、描述、成功/错误响应、启用 OpenAPI 时 `.WithOpenApi()`）；建可执行 `.http` 文件，按依赖序先建父、捕获/复用返回 ID 于子请求。

### 关键规则

- Blazor：`[SupplyParameterFromForm]` 属性必须 `= new()`（非 `null!`），防初始 GET 时 `EditForm` 崩溃；仅当组件真用 `InteractiveServer`（或项目已有）才链 `.AddInteractiveServerComponents()`/`.AddInteractiveServerRenderMode()`；不替换既有链式 render-mode 调用。
- 不加多余包（禁 `RuntimeCompilation` 等便利包）；命名/缩进/namespace 模式匹配现有文件。
- `dotnet ef` 优先 `dotnet tool restore`（本地工具清单），无清单才全局安装。
- `.http`：命名 `{ModelName}.http`（冲突加数字后缀）；请求按依赖排序（父先子后）；标签准确描述动作；尽量用 HTTP 客户端变量捕获父 ID 复用为子外键，不能捕获就注释说明需手改的 FK 值，不留假占位。

### 验证

`dotnet restore && dotnet build` 零错误 → 首次用时 `dotnet ef migrations add InitialCreate` + `dotnet ef database update`（重跑换唯一名）→ API 脚手架：查 `launchSettings.json` 有 `https` profile 则 `dotnet run --launch-profile https`，逐条按依赖序执行每个 `.http` 请求并报告方法/URL/状态码，非 2xx 停下修复。

## 三、EF Core 查询优化（optimizing-ef-core-queries）

诊断修复慢/错的 EF Core 数据访问（不适用于 Dapper/裸 ADO.NET）。优先减少往返、重复行、扫描、每次调用翻译成本，而非微优化。仅源码评审时不执行代码，区分"已证实缺陷"与"还需工作负载/部署证据的优化"；有 SQL/日志/计划时用它确认瓶颈。

### 源码评审流程

1. 找 EF 边界（`DbContext`/`DbSet`/仓储实现/工作单元/查询 helper/模型构建代码），跟实现不猜接口。
2. 把每个查询追到执行/枚举点；检查操作符绑 `Queryable` 还是 `Enumerable`——`IEnumerable` 可能仍是延迟数据库序列。
3. 沿调用路径数数据库操作与真实事务边界，记录哪些操作共享同一 `DbContext`。
4. 每条执行路径独立检查谓词、表达式构造、投影内容、结果基数、排序、Include、跟踪、SQL 参数化、模型构建。
5. 保留契约：结果成员与顺序、随机页访问、生成键、重试、事务与部分失败行为、并发处理、域/拦截器副作用。
6. 按优先级报告发现：位置、受影响调用路径、具体影响、安全修复；说明未验证项，不把源码推理等同于实测计划/加速。

### 抓 SQL 与查询数

```csharp
optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information);
// 或 appsettings: "Microsoft.EntityFrameworkCore.Database.Command": "Information"
```

`.TagWith("...")` 标记便于日志定位；改动前后数语句数与每语句行数。

### 修复模式库

- **追物化与结果边界**：helper 内物化仍是执行边界——List/数组已加载行，后续约简在内存；`IEnumerable<T>` 可能隐藏延迟查询且每次枚举重查库。可翻译的过滤/投影/聚合留在 `IQueryable` 直到执行。存在性用 `AnyAsync`，需要数值总数保留 `CountAsync`；重复全序列汇总改服务端聚合。交互结果分页/设上限；完整导出用流式/分块减少缓冲但不截断契约。
- **谓词保持可走索引**：列上函数/算术、非锚定子串匹配常阻止 seek；优先裸列比较（常为半开区间，如 `CreatedAt >= start && CreatedAt < start.AddYears(1)` 替代 `CreatedAt.Year == year`）。大小写不敏感：用既有已索引归一化/计算列或兼容 collation，别包列（`StringComparison` 重载通常不翻译，当前 EF Core 对不可翻译谓词抛错而非本地过滤）。类型转换谓词（`column.ToString().StartsWith(...)`）逐行套函数，改在类型化列上比较/范围。`Contains` 一般不可 seek；前缀匹配与全文检索不是任意子串匹配的替代品——保留搜索语义或显式披露变更。不要只凭 LINQ 断言全表扫描（provider 翻译、计算索引、其他谓词都改变计划）。
- **编译热点查询**：`EF.CompileQuery/CompileAsyncQuery` 生成跳过翻译缓存查找的委托，只降表达式处理成本、不降数据库 I/O。委托 `static`、参数含 `DbContext`；仅用于单一形状超高频执行（端点/循环），一次性查询无用。
- **控制参数化与计划复用**：区分 EF 翻译缓存与数据库计划缓存。捕获值默认成参数（SQL 文本稳定、利于计划复用）；字面量内联暴露值给优化器（选择性好但高基数会碎化服务器计划缓存）。`EF.Parameter(value)`（EF9+）强制参数；`EF.Constant(value)`（8.0.2+）强制内联常量。默认不动，有工作负载证据才覆盖。EF9 中覆盖在形状缓存之后处理：`EF.Constant` 可复用翻译仍产出不同 SQL；不等于把请求值嵌成 `Expression.Constant`；编译委托修不了服务器计划碎化；EF9 不支持在 CompileQuery 内用这些覆盖。
- **稳定动态查询形状**：请求值进表达式树时用捕获值表达式而非 `Expression.Constant(requestValue)`（后者每值新 EF 缓存条目 + 不同 SQL）。为实体建 `ParameterExpression` 不等于参数化比较值；固定结构常量不是自动缺陷；保持 null/转换语义；每值缓存委托/把每个新动态表达式编译并不能稳定形状。报告可能的编译/缓存抖动，不是已证实的无界泄漏。
- **按结果图选跟踪**：

| 结果与消费者 | 决策 |
|---|---|
| 标量/纯值投影 | 无实体可跟踪，别把缺 `AsNoTracking` 当发现 |
| 实体或含实体的 DTO、后续要编辑 | 保留跟踪与标识语义 |
| 只读实体图 | 考虑 no-tracking；不需要完整实体先窄投影 |
| 只读、实体高度共享或消费者依赖引用标识 | `AsNoTrackingWithIdentityResolution` 或按 key 的 DTO 处理 |

  普通 `AsNoTracking` **不**把重复键解析为同一对象；identity-resolution 用查询局部映射（不 attach 到上下文），有记账成本、不减 join 载荷、不跨查询去重。DTO/record 内含实体仍默认被跟踪。过滤 Include 要查同一跟踪上下文上的先前/后续加载——导航 fixup 会加入不满足 Include 谓词的已跟踪子级且该导航被标记已加载；需要子集时用独立投影/独立 no-tracking 读/新读上下文；别为清理读而清空有未保存工作的写跟踪器。
- **消 N+1、避免懒加载**：同一 SELECT 每行一次（循环内访问导航属性）即 N+1；一次往返加载——`Select` 投影聚合或 `Include` 预加载。服务端应用别开 `Microsoft.EntityFrameworkCore.Proxies`、别为懒加载标 `virtual` 导航（懒加载强制同步 I/O）。验证：查询数固定且小，与行数无关。
- **区分 join 倍增与宽行重复**：兄弟集合 Include 互相倍增行；嵌套集合链不是同一笛卡尔积；引用不算额外集合。单个集合也能把宽父 blob/text 列重复多次——消费者不需要该列/图时优先窄投影，否则考虑 `AsSplitQuery` 或定向加载。Split 增加语句/往返且可能缓冲；尊重刻意的 `AsSingleQuery` 与一致性要求（多语句读可能需快照/可序列化事务）；分页需唯一排序（EF Core 10 前 split 分页尤其）。别只数 Include 就规定 split。
- **过滤 + keyset 分页**：大结果先 `Where`；用 keyset/seek（`Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(pageSize)`）替代深 `Skip`（仍扫描丢弃跳过行）。按唯一稳定键排序并有索引覆盖；降序 `(CreatedAt, Id)` 游标需 `CreatedAt < lastDate || (CreatedAt == lastDate && Id < lastId)`，不是两字段独立界定。第二个 `OrderBy` 会**替换**主排序（次键用 `ThenBy`）；`Skip/Take` 无稳定唯一序则不确定；keyset 对随机页码访问不保行为；有序 offset 页仍会随并发插入/删除漂移。验证：早期到深页延迟大致恒定。
- **补索引**：按工作负载分别审计（别与"把过滤移进 SQL"混为一谈）。检查已应用的模型配置与约定；每个依赖 FK 的有序属性来自 `HasForeignKey`，EF 通常给该元组建索引，除非已有索引/键覆盖有序前缀且满足所需唯一性，或约定被移除。别只数 `HasIndex` 调用，别混淆主键与依赖表覆盖。EF 拥有 schema 时：`modelBuilder.Entity<Order>().HasIndex(o => new { o.CustomerId, o.CreatedAt });`（等值列在前、范围/排序在后）→ `dotnet ef migrations add ...` 生成迁移，**未经用户明确批准不得 `database update`**（应用迁移即改库），展示迁移让用户决定。EF 不拥有 schema 就把同一索引建议给数据库管理者。别过度索引（每个索引拖慢写）。等值列匹配后再范围/排序键；中间无约束键可能阻断期望的范围/排序；关系元数据不足以否定反向复合索引；FK 索引可能覆盖关系但不覆盖另一日期排序工作负载——考虑加工作负载索引而非替换。模型代码证明的是意图元数据，不是当前物理索引。验证：计划走 seek/索引而非 scan。
- **追仓储下的持久化**：服务循环可能把 `SaveChanges` 藏在仓储/审计日志/进度钩子后；一次最终工作单元提交不撤销更早写入——先确认是否存在外层事务再断言逐项提交；一次 save 本身可需多个 SQL 批。契约允许时分有界批一起保存；保留审计/outbox 记录、生成键、关系 fixup、顺序、并发、域事件；保存后从**输入顺序的实体引用**捕获 ID，别假设数值 ID 分配序。重试型 feed 要推理已提交与可重放部分：设计持久行/-feed 标识 + 唯一约束与重放处理或确认检查点；分块不等于幂等，先查后插不防竞态。
- **限制增长导入中的变更检测**：已保存实体仍被跟踪；自动检测开启时 `ChangeTracker.Entries<T>()`/`HasChanges`/`SaveChanges` 扫描跟踪状态，按类型过滤不缩小先前扫描——逐行检查增长图可致超线性 CPU（即使保存已分块）。用导入自有进度计数替代反复枚举 tracker；仅当上下文归批所有时轮转上下文/清理已完成工作。`Add/AddRange` 本就不自动调 `DetectChanges`，互相替换不是检测修复。仅在已证实冗余扫描时抑制自动检测，`finally` 恢复，并在持久化/审计前显式检测。
- **集合式批量更新/删除**：确属大型、简单、无需逐实体处理时用 `ExecuteUpdateAsync/ExecuteDeleteAsync`（EF7+，provider 支持），立即执行不物化。检查整个写工作流：立即写不更新已加载实体值/快照，同属性后续变更**即使同一请求顺序执行**也会覆盖 SQL 改动——用一套一致的跟踪保存或显式同步的集合式路径，单加事务不刷新跟踪状态；并发令牌不被自动检查，需保留令牌谓词/更新/受影响行处理；每次调用独立执行，后续 `SaveChanges` 不会把它们与审计/outbox 写批处理或原子化——需要时显式共享事务；保留客户端级联与 SaveChanges 钩子（命令拦截器不同，仍可观察 SQL）。验证：单条 `UPDATE/DELETE` 带 `WHERE`、前面无 `SELECT`。
- **DbContext 操作不得重叠**：同一 `DbContext`（含用该上下文构造的不同仓储对象）不支持重叠操作——两个调用都未 await 即已并发；`Task.WhenAll` 不使共享安全。顺序 await，或每个并发操作独立创建/处置上下文；工厂创建的独立上下文可安全重叠。静态/单例持有上下文同时造成生命周期与线程安全问题。
- **裸 SQL**：优先插值重载 `FromSql`/`FromSqlInterpolated`、`ExecuteSql[Async]` 使值以参数发送。

### 证据门槛（仅源码评审）

- 先加载-修改循环后一次 `SaveChanges` ≠ 循环内 SaveChanges，不是逐行往返缺陷；仅当操作确属大型且绕过跟踪语义安全时才建议批量 API。
- 单个文件缺 `HasIndex` 不证明部署库缺索引；需模型构建代码/迁移/查询计划作证据，缺证据别塞泛泛的条件索引建议。
- 缺 `AsNoTracking` 仅在已证实只读实体结果上才可操作。
- 全部模式都健康就直说无需改动，不编造发现。

### 常见坑

函数包裹谓词不兼容普通索引→改范围/已索引归一值；只修组合忽略工作负载索引覆盖→匹配实际等值/范围/排序前缀（含约定建的索引）；偶尔执行的查询做编译→只编译真热点形状；混淆 EF 翻译复用与数据库计划复用→查 SQL 参数/字面量选择并以工作负载证据定覆盖；DTO 含实体却假定不跟踪→检查物化图不只外层返回类型；批量写后对陈旧值做跟踪运算→统一写路径并保留并发/原子性，别只加事务；重复枚举仓储的延迟 `IEnumerable`→跨到本地操作符前先组合数据库聚合。
