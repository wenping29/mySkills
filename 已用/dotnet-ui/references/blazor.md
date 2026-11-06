# Blazor 组件与交互

蒸馏自 dotnet-blazor 插件 10 个技能 + dotnet-aspnetcore 的 convert-blazor-server-to-webapp，共 11 节。多数技能第一步都是**读项目根 `AGENTS.md`** 确认 Interactivity Mode/Scope 再动手。

## 1. create-blazor-project — 创建 Blazor Web 应用

先问清：应用做什么、需要什么交互、部署环境、是否要认证。渲染模式是递进标尺，从满足需求的最简单级起步：`Static SSR → SSR+Enhanced Nav → Interactive Server → Interactive WebAssembly`。

### 决策规则

| 需求 | 用 | 理由 |
|---|---|---|
| 展示数据、简单表单、页面链接 | Static SSR（`-int None`） | 无 JS 运行时/无 circuit/无 WASM 下载；表单走 HTML POST |
| 以上 + 少量客户端行为组件 | Interactive Server, per-page（`-int Server`）**推荐默认** | 只有需要的组件 `@rendermode` 加入交互；服务端执行、完整 .NET、无需 API 层 |
| 大多数页面富交互（仪表盘/拖拽/聊天） | Interactive Server, global（`-int Server -ai`） | 全部交互，代价是每用户一个 SignalR circuit |
| 延迟敏感/移动弱网/离线 | Interactive WebAssembly（`-int WebAssembly`） | 浏览器执行；需 `.Client` 项目 + API 层 + 首访下载 ~10MB；离线要自行加 PWA service worker |
| Server 快首访 + WASM 低延迟后访 | Interactive Auto（`-int Auto`） | 最复杂，仅当 Server 与 WASM 约束同时存在才选 |

Auto 约束：交互组件必须全在 `.Client`；不得直连服务器资源（EF DbContext、文件系统、server-only 服务），数据全走 HTTP API；server 与 client 两个 `Program.cs` 注册匹配服务；代码不得假设执行环境（无裸 `HttpContext`，浏览器 API 加 `RendererInfo` 守卫）；两种模式都要测。

Don'ts：别"因为酷"选 WASM；说不出 Server/WASM 单独都不足就别选 Auto；大多数页面只读内容的应用别全局交互。

### 脚手架命令

```shell
dotnet new blazor -o {AppName} -int None          # Static SSR
dotnet new blazor -o {AppName} -int Server        # Server per-page（默认推荐）
dotnet new blazor -o {AppName} -int Server -ai    # Server global
dotnet new blazor -o {AppName} -int WebAssembly   # WASM per-page（生成 {AppName} + {AppName}.Client）
dotnet new blazor -o {AppName} -int WebAssembly -ai
dotnet new blazor -o {AppName} -int Auto          # / -ai
dotnet new blazor -o {AppName} -int Server -au Individual   # 加 Identity（SQLite/SQL Server）
```

- `blazor` 模板只支持 `-au Individual`；组织身份（Entra ID/B2C）先 `-au Individual` 再换 `Microsoft.Identity.Web`/OIDC。Identity 页面永远静态 SSR，勿加 `@rendermode`。
- 结构：单项目 = `Components/{App,Routes}.razor` + `Layout/` + `Pages/` + `Program.cs`；双项目 = server 放静态组件/布局，交互组件放 `.Client/Pages/`。
- Program.cs 接线按模式核对：None = `AddRazorComponents()` + `MapRazorComponents<App>()`；Server 加链 `.AddInteractiveServerComponents()` / `.AddInteractiveServerRenderMode()`；WASM 用 `AddInteractiveWebAssemblyComponents/RenderMode` + `AddAdditionalAssemblies(typeof({AppName}.Client._Imports).Assembly)`，Client 侧 `AddAuthorizationCore()` + HttpClient；Auto 同时链 Server+WASM。
- global 与 per-page 差别仅在 `App.razor`：global 在 `<HeadOutlet>`/`<Routes>` 加 `@rendermode="InteractiveServer"`；per-page 不加、由页面自选。
- 脚手架后按模式从 `assets/agents-md/` 选模板生成项目 `AGENTS.md`（替换 `{AppName}`），再 `dotnet build`/`dotnet run` 验证，删除模板 Counter/Weather 页继续实现用户需求。

Don'ts：别用 `dotnet new blazorwasm`（无 SSR 的独立 SPA）；别给 `-int None` 项目手动加 `AddInteractiveServerComponents()` 就指望能用（还需 rendermode 指令与 App.razor）；别把 WASM 组件放 server 项目（prerender 能过、接管后失败）。

## 2. plan-ui-change — 复杂 UI 特性分解

复杂 UI 先规划组件分解，然后**立即实现**——计划是思考工具不是交付物，绝不停在计划或问"可以继续吗"。

1. **映射视觉区域**：每个有自己数据/行为/布局职责的区域都是组件候选；画出组件树（页面拥有数据并编排布局）。识别规则：独立职责、重复结构（列表项抽模板）、独立交互、单区超 ~150 行标记就拆。
2. **分类每个组件**：列 Action/Render Mode/拥有状态/行数估计表；页面组件 markup+code 超 ~200 行即过大继续拆。
3. **设计数据流**：确定每份数据的 state owner；数据永远经 `[Parameter]` 向下，事件永远经 `EventCallback<T>` 向上；页面/父组件拥有数据、把过滤/转换后的视图传给子；子绝不改参数，只回调通知；数据跨 2 层以上而中间层不需要它 → cascading value 或 scoped service。
4. **找复用**：先查项目现有列表项/过滤/泛型组件（`DataTable<T>`、`Pagination`）；多页使用放 `Shared/`。
5. **实现顺序自底向上**：Models/DTO → Services（接口+实现）→ 叶子组件 → 容器组件 → 页面组件 → 配置（DI/render mode）。每个组件独立可编译，绝不引用还不存在的组件。

反模式：500+ 行单页组件；10+ 参数逐层穿透（parameter drilling→用 cascading/scoped 状态服务）；子组件各自调 API（父拥有数据再传）；复杂列表项内联渲染（抽成项组件）；先堆一个文件"以后重构"；一次性用途做泛型组件（过度工程）。命名按渲染内容：`ProductCard` 不是 `ProductRenderer`。

## 3. author-component — 编写/评审 .razor 组件

核心规则：

- 数据向下 `[Parameter]`，事件向上 `EventCallback<T>`（绝不用 `Action`/`Func`）。
- 绝不改 `[Parameter]` 属性；在 `OnParametersSet` 拷贝到私有字段。
- `[Parameter] public T Prop { get; set; }`——不用 `required`/`init`（触发 BL0007）；必需参数用 `[EditorRequired]`。
- 处理全部状态：loading/empty/loaded/error 各配 `@if/@else`。
- 循环内重复元素用 `@key`；集合参数用 `IReadOnlyList<T>` 不用 `IEnumerable<T>`。
- 插槽：`RenderFragment? ChildContent`、泛型模板 `RenderFragment<TItem>? RowTemplate` + `@typeparam TItem`。
- 文件模式：逻辑 < ~50 行单文件 `.razor`+`@code`；> ~50 行 `.razor`+`.razor.cs` partial class。
- 拥有订阅/定时器/CTS 的组件实现 `IAsyncDisposable`（非 `IDisposable`）：`DisposeAsync` 中 `-=` 退订、取消 CTS、释放资源；绝不在其中调 `StateHasChanged`。

异步模式：

- 每个 async 操作都 `await`；禁 `.Result`/`.Wait()`/`Task.Run`/`ContinueWith`/`Thread.Start`。
- **防抖**：`Task.Delay` + CTS——取消旧 CTS、建新、await delay、做事；禁 `System.Threading.Timer`/`System.Timers.Timer`。
- **轮询**：`OnInitializedAsync` 内循环 `await Task.Delay(interval, token)`（留在同步上下文）。
- **外部事件（`Action<T>`）**：`async void` handler + `await InvokeAsync(() => { state++; StateHasChanged(); })` + `catch` → `DispatchExceptionAsync`；绝不 `_ = InvokeAsync(...)`（吞异常）。
- `DisposeAsync` 取消 CTS；用 CTS 取消而非 catch `ObjectDisposedException`。

Don'ts：内联 `style` 属性（用 CSS 类或 `data-*`）；`catch { throw; }`（用 `when` 守卫或让异常传播）；未被要求的 ARIA/包装 div 镀金。

## 4. coordinate-components — 跨组件共享状态

| 需求 | 机制 | 场景 |
|---|---|---|
| 子树内（同渲染模式） | `CascadingValue` 组件 | 主题、布局配置 |
| 全应用（跨渲染模式） | DI 注册 `CascadingValueSource<T>` | 当前用户、feature flag、全局主题 |
| circuit 内可变共享状态 | Scoped 服务 + `Action` 事件 | 购物车、通知计数、过滤器 |

- `CascadingValue` 按**类型**匹配；同类型多值加 `Name`。值永不变时 `IsFixed="true"` 省订阅开销。**不跨渲染模式边界**——静态 SSR 父级里的 `<CascadingValue>` 对交互子组件不可见（子看到 null）。
- 跨边界用 DI：`builder.Services.AddCascadingValue(sp => new CascadingValueSource<ThemeInfo>(theme, isFixed: false));` 消费仍 `[CascadingParameter]`。更新协议：改状态的组件必须注入 `CascadingValueSource<T>` 调 `NotifyChangedAsync(newValue)`（或改对象后无参调用）——这是唯一让全部订阅者重渲染的机制；绝不用 `NavigationManager.Refresh()`/页面重载替代。每次 `NotifyChangedAsync` 重渲染**所有**订阅者，所以级联类型要细粒度分（ThemeState/CartState/UserPreferences），别把全部应用状态塞一个对象。Auto/WASM 在 server 与 `.Client` 两个 Program.cs 都注册，类型放共享程序集。
- Scoped 状态服务：类内 `event Action? OnChange`，变更处 `OnChange?.Invoke()`；组件 `OnInitialized` 订阅 `StateHasChanged`、`Dispose` 退订。事件从同步上下文之外（timer/后台任务/SignalR）触发时，处理器包 `InvokeAsync(StateHasChanged)`，委托存字段以便用同一实例退订。
- 生命周期矩阵：Server 上 Scoped=每 circuit、**Singleton 跨所有用户共享——绝不用单例存用户状态**（购物车串号）；WASM 上 Singleton 每标签页安全；Auto 两端都跑的代码必须 Scoped。Auto/WASM 状态服务定义在 `.Client` 或共享程序集（不能引用 server-only 类型），prerender 状态不活过接管——跨 prerender 持久用第 7 节 `[PersistentState]`。

Don'ts：忘退订（每 circuit 泄漏）；用 `<CascadingValue>` 放静态布局指望到达交互子级；非 Blazor 线程直接 `StateHasChanged`（Dispatcher 抛 InvalidOperationException）。

## 5. collect-user-input — 表单与验证

先按 AGENTS.md 的模式定表单机制：None（静态 SSR）= `EditForm` + `FormName` + `[SupplyParameterFromForm]`，**不能用 `@bind`/`@onchange`**；Server/WASM/Auto = `EditForm` + `@bind-Value` 全交互（Auto/WASM 中依赖服务器数据的校验器要走 API）。Scope=Global 时所有表单交互、`FormName` 只在显式选静态时必要；Scope=per-page 时静态页表单用 `FormName`+`[SupplyParameterFromForm]`。

- `EditForm` 需要 `Model` **或** `EditContext`，绝不两者都要。EditContext 式用于程序化字段跟踪/动态规则/手动 `Validate()`。
- 提交处理器：`OnValidSubmit`（配 DataAnnotationsValidator 的标准表单）/`OnInvalidSubmit`/`OnSubmit`（手动验证，与前两者互斥）。
- 内置组件：`InputText`、`InputTextArea`、`InputNumber<T>`、`InputDate<T>`（DateTime/DateOnly/DateTimeOffset）、`InputCheckbox`、`InputSelect<T>`（枚举用 `Enum.GetValues<T>()` 生成 option）、`InputRadioGroup<T>` 包 `InputRadio<T>`、`InputFile`（仅交互模式）。全部 `@bind-Value`；文本控件包 `<label>` 或 `id/for`。
- 注解验证：模型上 `[Required]`/`[StringLength]`/`[EmailAddress]`/`[Range]`；表单内必须放 `<DataAnnotationsValidator />`（缺了注解被静默忽略）；错误显示 `<ValidationSummary />` 与 `<ValidationMessage For="() => Model!.Field" />`。
- 自定义服务器往返校验：写 `CustomValidator : ComponentBase`（`[CascadingParameter] EditContext` + `ValidationMessageStore`；`OnValidationRequested` 清全部、`OnFieldChanged` 清单字段；暴露 `DisplayErrors(Dictionary<string,List<string>>)`/`ClearErrors()` + `NotifyValidationStateChanged`），表单里 `<CustomValidator @ref=... />`，`HandleSubmit` 调服务返回错误字典再 DisplayErrors。
- 交互模式响应输入变化：`@bind:after="OnXChanged"`（如邮编变化联动城市）；实时过滤用 `@oninput`（`ChangeEventArgs.Value`）。
- SSR 关键模式：`[SupplyParameterFromForm]` 属性配 `OnInitialized` 里 `Model ??= new()`——GET 时 null 需创建、POST 时框架已填充需保留，**缺 `??=` 即崩**。一页多表单每个必须唯一 `FormName`（`[SupplyParameterFromForm(FormName = "search")]` 对应），否则任一提交触发全部表单。`<EditForm ... Enhance>` 让 SSR 表单经 fetch 提交 + DOM patch + 保持滚动，SPA 感。裸 `<form method="post" @formname=...>` 必须手加 `<AntiforgeryToken />`（`EditForm` 自动含）。
- 文件上传：`InputFile` 仅交互模式；`e.File.OpenReadStream(maxAllowedSize: 10*1024*1024)`——Server 默认 ~30KB SignalR 消息上限需显式提高；多文件 `multiple` + `e.GetMultipleFiles(maxAllowedFiles)`。
- 防重复提交：提交期间 `disabled="@isSubmitting"`，`finally` 恢复。
- 自定义校验 CSS：`FieldCssClassProvider` 子类返回 `is-valid/is-invalid`，`editContext.SetFieldCssClassProvider(...)`。

## 6. fetch-and-send-data — 调 API 与异步生命周期

数据访问按模式：None=服务端注入服务/DbContext + `[StreamRendering]` 改善加载 UX；Server=服务端注入（prerender 用 `??=`+`[PersistentState]` 守卫）；WASM=浏览器只能 `HttpClient`；Auto=永远走 API。

- 注册 HttpClient（仅当 Server 组件调外部 API，或 WASM/Auto 总是）：`AddHttpClient("CatalogAPI", c => c.BaseAddress = ...)` 或 typed client `AddHttpClient<CatalogClient>(...)`；WASM/Auto+prerender 在 server 与 `.Client` 两处都注册。访问自家数据库就注入 DbContext/服务，别绕 HTTP 自调。
- 加载：`OnInitializedAsync` 里 `await Catalog.GetProductsAsync()`，`products is null` 显示 Loading。`[StreamRendering]` 只影响静态 SSR。prerender 双调用用 `[PersistentState] private Product[]? products;` + `products ??= await ...`。
- 错误：**默认策略是 `<ErrorBoundary>`**（布局/父级包一层，`ErrorContent` 给友好提示）；非取消异常自动传播，无需组件内 catch。`ComponentBase` 静默吞**所有** `OperationCanceledException`（自发起与外部超时都吞，ErrorBoundary 看不到；超时表现为卡 loading，通常可接受）。仅当需要 ErrorBoundary 给不了的行为（重试、超时专属文案）才组件内处理，且只 catch 需要的：`catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)`。绝不向用户显示 `exception.Message`（PII/内部细节风险）——`ILogger` 记真实异常、界面用硬编码文案。服务必须接受 `CancellationToken` 并传递。
- 参数驱动重载（路由/查询参数变化时）：`OnParametersSetAsync` + 跟踪值守卫（`if (CategoryId == loadedCategoryId) return;` 跳过仅 UI 参数变化）；`LoadAsync` 先 `await cts.CancelAsync(); cts.Dispose();` 再建新 CTS 并**在 await 前把 token 捕获到局部变量**；不清空 `products`（旧数据 + `isLoading` "Refreshing…" 覆盖层）；实现 `IAsyncDisposable` 导航离开时取消挂起工作；错误态带 Retry 按钮。
- 发送数据：`PostAsJsonAsync/PutAsJsonAsync/DeleteAsync` + `EnsureSuccessStatusCode()`；保存期间禁用提交按钮 + saving 指示。
- Auto/WASM+prerender 服务抽象：抽象基类 `ProductServiceBase`，Server 实现直连 DbContext、Client 实现走 HttpClient，两个 Program.cs 各注册各的实现，组件注入基类。

Don'ts：构造函数里调 API；数据不依赖变化参数时用 `OnParametersSetAsync`；WASM/Auto 组件注入 DbContext；`HttpClient` 调自家服务器；把 `exception.Message` 显示给用户；为自发起取消 catch `OperationCanceledException`。

## 7. support-prerendering — 预渲染支持

prerender 对所有交互渲染模式**默认开启**：服务器先出静态 HTML，交互运行时再加载重渲染。后果：`OnInitializedAsync` 跑**两次**；`OnAfterRenderAsync` prerender 期间不调；交互页面间内部导航**跳过** prerender（仅整页加载才有）。静态 SSR（mode None）不适用本技能。

- **持久状态（推荐）**：`[PersistentState] public WeatherForecast[]? Forecasts { get; set; }` + `OnInitializedAsync` 里 `Forecasts ??= await ...`——prerender 序列化、交互激活恢复，消除闪烁与重复 API/DB 调用。同组件多实例用 `<ItemCard @key="item.Id" />` 区分状态。
- 高级命令式：`PersistentComponentState`——`RegisterOnPersisting(PersistOrders)` + `TryTakeFromJson<List<Order>>("orders", out var restored)` / `PersistAsJson("orders", orders)`（动态 key、自定义序列化场景）。
- **禁用 prerender**（仅当依赖浏览器 API 立即执行或 `[PersistentState]` 解决不了；别当首选——伤加载感知与 SEO）：组件定义 `@rendermode @(new InteractiveServerRenderMode(prerender: false))`；实例 `@rendermode="new InteractiveServerRenderMode(prerender: false)"`；整应用在 `App.razor` 的 `<HeadOutlet>/<Routes>` 上设。**父级 prerender 设置覆盖子级**：`<Routes>` 关了页面无法再开。
- **从交互路由排除页面**（全局交互应用需要 `HttpContext` 的页面：cookies/请求头/响应码）：`@attribute [ExcludeFromInteractiveRouting]` 强制整页导航、走静态 SSR 管线；配合 `App.razor` 用 `[CascadingParameter] HttpContext` + `HttpContext.AcceptsInteractiveRouting() ? InteractiveServer : null` 条件渲染模式。
- 运行时区分：`RendererInfo.IsInteractive`（prerender false / 交互 true）、`Name`（"Static"/"Server"/"WebAssembly"）守卫只在交互执行的代码（如 SignalR 连接）。
- `.Client` 组件 prerender 在服务器上跑：只在 client Program.cs 注册的服务（如 `IWebAssemblyHostEnvironment`）prerender 期缺失。修法：server 也注册匹配服务 / 构造注入可空默认（`IMyService? svc = null`）/ 服务抽象两端实现 / 该组件禁 prerender。

Don'ts：`OnInitializedAsync` 里调 JS interop（prerender 无 JS，用 `OnAfterRenderAsync(firstRender)`）；假定 `OnInitializedAsync` 只跑一次；交互组件用 `HttpContext`（仅静态 prerender 期存在）。

## 8. configure-auth — 认证与授权（按渲染模式）

1. Program.cs（server）注册：`AddCascadingAuthenticationState()` + `AddAuthorization()`；Identity 再加 `AddAuthentication(IdentityConstants.ApplicationScheme/ExternalScheme).AddIdentityCookies()` 与 `AddIdentityCore<ApplicationUser>().AddRoles<IdentityRole>().AddEntityFrameworkStores<...>().AddSignInManager().AddDefaultTokenProviders()`。
2. `App.razor` 用 `HttpContext.AcceptsInteractiveRouting()` 条件应用渲染模式（被排除的页面渲染为静态）；`Routes.razor` 用 `AuthorizeRouteView` + `<NotAuthorized>`（未登录 `<RedirectToLogin />`，否则提示无权）。
3. 页面保护：`@attribute [Authorize]` / `[Authorize(Roles = "Admin")]` / `[Authorize(Policy = "RequireManager")]`；条件 UI 用 `<AuthorizeView>`（`<Authorized>/<NotAuthorized>`，`Roles=` 属性）。代码里取状态：`[CascadingParameter] Task<AuthenticationState>? AuthState` → `state.User.IsInRole("Admin")`。
4. **Identity 页面必须静态 SSR**：`SignInManager`/`UserManager` 内部用 `HttpContext`，交互组件中**抛异常**。全局交互应用里每个 Identity 页面加 `[ExcludeFromInteractiveRouting]`（强制整页导航退出 circuit）+ App.razor 的 `AcceptsInteractiveRouting()`；per-page 应用 Identity 页默认静态、无需该属性。
5. WASM/Auto：浏览器无 `HttpContext`，auth 状态须 prerender 时从服务器序列化。Server Program.cs `AddAuthenticationStateSerialization()`（可 `options.SerializeAllClaims = true`），Client Program.cs `AddAuthenticationStateDeserialization()`；缺了 WASM 接管后解析成匿名用户。Auto 在**两个** Program.cs 都注册。

渲染模式 × 认证矩阵：

| 渲染模式 | HttpContext.User | SignInManager | 认证状态来源 | 关键要求 |
|---|---|---|---|---|
| Static SSR | 有 | 可用 | 服务器管线 | 重定向走中间件；`<NotAuthorized>` **不渲染** |
| Server 交互 | 无 | 抛异常 | `CascadingAuthenticationState` | 用 `[Authorize]`+`AuthorizeView`，不用 HttpContext |
| WebAssembly | 无 | 抛异常 | 服务器序列化 | Serialization/Deserialization 两端注册 |
| Auto | WASM 接管后无 | 抛异常 | 服务器序列化 | 同 WASM；两个 Program.cs 都注册 |

常见错：交互组件用 `HttpContext.User`（null/陈旧）→ 改 `Task<AuthenticationState>`；交互组件用 SignInManager → 移静态 SSR 页加 `[ExcludeFromInteractiveRouting]`；WASM 接管后匿名 → 缺 Serialization/Deserialization；静态 SSR 里 `<NotAuthorized>` 不显示 → 用中间件 `LoginPath`/`RedirectToLogin`；全局交互不查 `AcceptsInteractiveRouting` → Identity 页崩；缺 `AddCascadingAuthenticationState` → AuthState 为 null。

## 9. use-js-interop — JavaScript 互操作

- **模块**：一律同目录 `.razor.js` + `export` 函数，禁 `window.*` 全局函数与 `<script>` 标签。导入路径：同项目 `"./Components/X.razor.js"`，RCL `"./_content/{AssemblyName}/..."`。
- **时机铁律**：所有 interop 只能在 `OnAfterRenderAsync` 或事件处理器里发生，绝不在 `OnInitialized`/`OnParametersSet`/构造函数（prerender 期无 JS）。参数变化：`OnParametersSet` 置 `_dataChanged` 标志，`OnAfterRenderAsync` 里 `else if (_dataChanged && _chart is not null)` 再应用。
- **批处理（双向）**：连续 2+ 个 .NET→JS 调用合并成一个 JS 函数；一个调用结果喂给另一个的链留在 JS 内（数据不跨边界）；JS→.NET 多个数据用一次 `invokeMethodAsync` 传对象。规则：两侧总是成对发生的调用就合并。
- **类型化包装类**：每个特性一个 plain class（如 `ChartInterop : IAsyncDisposable`）持有模块生命周期——`internal const` 定义 ModulePath/方法名（禁魔法字符串）；`GetModuleAsync()` 懒加载 `_module ??= await _js.InvokeAsync<IJSObjectReference>("import", path)`；`DisposeAsync` 先调 JS 清理函数再 `_module.DisposeAsync()`，包 `catch (JSDisconnectedException) { }`。优先具体类而非 interface+实现；单测直接替换 `IJSRuntime`（它已是接口）。
- **JS→.NET 回调**：`DotNetObjectReference.Create(this)` 传入；`[JSInvokable]` 方法**必须 public**（private 静默运行时失败）；回调内 `StateHasChanged` 必须包 `await InvokeAsync(() => { state = x; StateHasChanged(); })`；JS 侧 `invokeMethodAsync` 一律 try/catch（circuit 断开会抛）；.NET 方法名在 JS 顶部定义 `const`；JS 侧把 dotNetRef 包进类（私有字段 + `AbortController` 清理监听器）；`DotNetObjectReference` 在 `DisposeAsync` 释放（否则内存泄漏）。
- DOM 元素用 `@ref` 的 `ElementReference` 传，不传字符串 ID；无返回值用 `InvokeVoidAsync` 不用 `InvokeAsync<object>`；清理必须 `IAsyncDisposable`（`InvokeVoidAsync` 返回 ValueTask 需 await），禁同步 `IDisposable`。
- CSS 能做的别用 JS（主题用 CSS 自定义属性 + `data-` 属性）。

检查清单：同目录 `.razor.js` 无全局；interop 全在 OnAfterRender/事件；`IAsyncDisposable` 捕获 `JSDisconnectedException`；DotNetObjectReference 已释放且 JS 侧 try/catch；`[JSInvokable]` public + InvokeAsync 包 StateHasChanged；ElementReference 代替 ID；双向批处理。

## 10. use-igniteui-blazor — Ignite UI for Blazor Lite 接入

装包前先查目标项目 TFM（最低 net8.0）与现有引用：已引用 `IgniteUI.Blazor`/`.Trial` 就保持原策略、勿加 Lite；仅在用户明确要求时换包族且**替换**冲突引用而非并存。勿臆造按组件包名（无 `IgniteUI.Blazor.Combo`）。

```bash
dotnet add package IgniteUI.Blazor.Lite       # 核心控件 IgbInput/IgbCombo/IgbDialog（MIT）
dotnet add package IgniteUI.Blazor.GridLite   # 轻量 DataGrid（MIT）
```

图表/地图/仪表盘等高级组件不在 Lite 内。

- **注册**：`builder.Services.AddIgniteUIBlazor();`（默认懒加载，各模块首渲染时加载）；传 `typeof(IgbXxxModule)` 列表可启动时预加载（模块名恒为 `Igb{ComponentName}Module`）。GridLite-only 应用：**不要**调 `AddIgniteUIBlazor()`、不要加手工 script 标签，只加包+命名空间+GridLite 样式表。
- **拆分 Web App（Server/Client 两项目）**：包加到**两个** `.csproj`；Lite 时**两个** Program.cs 都调 `AddIgniteUIBlazor()`；`@using IgniteUI.Blazor.Controls` 加到**两个** `_Imports.razor`。单项目 Server 应用只注册一次。
- **主题样式表（必加，缺了组件无样式）**：宿主页为 `wwwroot/index.html`（WASM/MAUI）、`Pages/_Host.cshtml`（Server）或 `Components/App.razor`（Web App）。`<link href="_content/IgniteUI.Blazor/themes/light/bootstrap.css" rel="stylesheet" />`——主题文件为 `{light|dark}/{bootstrap|material|fluent|indigo}.css`，**只链一个**；0.1.1 起 JS 经 Blazor initializer 自动加载，勿再加 Ignite UI script 标签。`.NET 9+` 可用指纹资产：`href="@Assets["_content/IgniteUI.Blazor/themes/light/bootstrap.css"]"`。GridLite 独立样式路径 `_content/IgniteUI.Blazor.GridLite/themes/light/bootstrap.css`——**仅当只用 GridLite** 时链它，混用其他组件则统一用主主题样式表。
- **渲染模式**：Ignite UI 组件必须处于交互渲染模式（`@rendermode InteractiveServer` 或全局 `<Routes @rendermode=...>`，按需 WebAssembly/Auto）；静态 SSR 渲染不出可用内容。

## 11. convert-blazor-server-to-webapp — 旧 Blazor Server 迁移为 Blazor Web App

适用门禁：仅 pre-.NET 8 经典 Blazor Server（`AddServerSideBlazor` + `MapBlazorHub` + `Pages/_Host.cshtml`）。**若已用 `AddRazorComponents`/`MapRazorComponents` 则已是 Web App，停止并告知用户**；WASM/托管 WASM、需留在旧模型、仍为 .NET Framework 的应用均不适用。每个逻辑步骤后提交，保证可评审可 bisect。

1. **csproj**：TFM 改 `net8.0`+；`Microsoft.AspNetCore.*`/`EntityFrameworkCore.*`/`Extensions.*`/`System.Net.Http.Json` 全部对齐同版本。
2. **Routes.razor**：把旧 `App.razor` 全部内容（`<Router>`）移入新建 `Routes.razor`；外层若有 `<CascadingAuthenticationState>` 包裹则去掉（改服务，见 5）；`<AuthorizeRouteView>` 保留可用。`App.razor` 清空待做根文档。
3. **_Host.cshtml → App.razor**（Razor Page → 组件）：删 `@page "/"`、`@namespace`、TagHelper `@addTagHelper`；`<base href="~/" />` → `"/"`；`<component type="typeof(HeadOutlet)" render-mode="ServerPrerendered" />` → `<HeadOutlet @rendermode="InteractiveServer" />`；`<component type="typeof(App)" .../>` → `<Routes @rendermode="InteractiveServer" />`；`<environment>` 标签 → `@inject IHostEnvironment Env` + `@if (Env.IsDevelopment())`；`_framework/blazor.server.js` → `_framework/blazor.web.js`；`_Imports.razor` 加 `@using static Microsoft.AspNetCore.Components.Web.RenderMode`；删除 `_Host.cshtml(.cs)`。原用 `render-mode="Server"`（未预渲染）的，两处 rendermode 改用 `new InteractiveServerRenderMode(prerender: false)` 保持行为。
4. **Program.cs**：`AddServerSideBlazor()` → `AddRazorComponents().AddInteractiveServerComponents()`，原 options（DetailedErrors、DisconnectedCircuitRetentionPeriod 等 circuit/hub 配置）必须搬进 `AddInteractiveServerComponents(options => ...)`，否则静默丢失；`MapBlazorHub()` → `MapRazorComponents<App>().AddInteractiveServerRenderMode()`；删 `MapFallbackToPage("/_Host")`；删显式 `app.UseRouting()`；加 `app.UseAntiforgery()` 且必须在 `UseAuthentication/UseAuthorization` **之后**（缺了表单 POST 全 400；放前面会在身份建立前校验）。
5. **认证级联**：`<CascadingAuthenticationState>` 组件不跨渲染模式边界，改用 `builder.Services.AddCascadingAuthenticationState();`。
6. **可选现代化**（建议时须声明可选）：.NET 9+ `app.MapStaticAssets()` 替代 `UseStaticFiles`；异步加载页加 `@attribute [StreamRendering]`；CSS 隔离 bundle `<link href="{AssemblyName}.styles.css">` 程序集名对齐。
7. **验证清单**：全局搜索确认 `AddServerSideBlazor`/`MapBlazorHub`/`MapFallbackToPage`/`blazor.server.js`/`_Host.cshtml` 零残留；App.razor 为完整 HTML 根、Routes.razor 含 Router；build 通过、跑起来验证页面/交互/导航/认证；跑既有测试。
