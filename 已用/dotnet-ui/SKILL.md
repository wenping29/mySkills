---
name: "dotnet-ui"
description: ".NET UI 框架技能：Blazor 项目脚手架与渲染模式、组件编写/协调/表单/数据/预渲染/认证/JS interop/Ignite UI、Blazor Server 迁移为 Web App；MAUI 环境诊断、生命周期、DI、数据绑定、CollectionView、Shell 导航、安全区、主题明暗；WinForms 设计器序列化契约与验证流程。当用户要求 Blazor/MAUI/WinForms 开发、创建 razor 组件或 EditForm 验证、render mode/prerender 选择、IJSRuntime 互操作、Blazor Server 升级 .NET 8、MauiProgram/DI/Shell/CollectionView/edge-to-edge/暗色模式、Designer.cs/InitializeComponent/BindingSource/TableLayoutPanel，或提到 blazor/maui/winforms/razor/shell/collectionview 时触发。边界：不用于纯视觉风格/配色/品牌设计→web-visual-design；.NET/C# 语言与后端（Web API/EF Core/P/Invoke）→dotnet-dev；端到端交付→dev-expert。"
---

# dotnet-ui — Blazor / MAUI / WinForms

蒸馏自微软 dotnet/skills 仓库 20 个技能（dotnet-blazor 10 个 + dotnet-aspnetcore 的 convert-blazor-server-to-webapp、dotnet-maui 8 个、dotnet-winforms 的 winforms-expert）。本文件只做路由，执行前必须 `Read` 对应主题文件。

## 触发词路由表（源技能 → 主题文件 → 何时用）

| 源技能 | 主题文件 | 何时用 |
|--------|----------|--------|
| create-blazor-project | `references/blazor.md` §1 | 新建 Blazor 应用：渲染模式/Scope 决策、`dotnet new blazor` 参数、Program.cs 接线 |
| plan-ui-change | `references/blazor.md` §2 | 复杂 UI 特性先分解组件树再立即实现 |
| author-component | `references/blazor.md` §3 | 编写/评审 .razor 组件：参数、EventCallback、异步、Dispose |
| coordinate-components | `references/blazor.md` §4 | 跨组件共享状态：CascadingValue / CascadingValueSource / Scoped 服务 |
| collect-user-input | `references/blazor.md` §5 | 表单与验证：EditForm、DataAnnotations、SSR `[SupplyParameterFromForm]`、文件上传 |
| fetch-and-send-data | `references/blazor.md` §6 | 组件调 API：HttpClient 注册、加载/错误/取消、参数驱动重载 |
| support-prerendering | `references/blazor.md` §7 | prerender 双调用、`[PersistentState]`、禁用 prerender、ExcludeFromInteractiveRouting |
| configure-auth | `references/blazor.md` §8 | 按渲染模式配认证授权：Identity、AuthenticationState 序列化 |
| use-js-interop | `references/blazor.md` §9 | JS 互操作：`.razor.js` 模块、时机铁律、类型化包装类、DotNetObjectReference |
| use-igniteui-blazor | `references/blazor.md` §10 | 接入 Ignite UI for Blazor Lite/GridLite：包、注册、主题样式表 |
| convert-blazor-server-to-webapp | `references/blazor.md` §11 | pre-.NET 8 经典 Blazor Server 迁移为 .NET 8+ Blazor Web App |
| dotnet-maui-doctor | `references/maui.md` §1 | MAUI 环境报错：SDK/workload/JDK/Android SDK/Xcode 诊断与修复 |
| maui-app-lifecycle | `references/maui.md` §2 | Window 生命周期事件、后台保存恢复、ConfigureLifecycleEvents |
| maui-dependency-injection | `references/maui.md` §3 | MauiProgram 注册服务/VM/Page、生命周期选择、Shell 路由自动解析 |
| maui-data-binding | `references/maui.md` §4 | x:DataType 编译绑定、XC0022-25、ObservableObject、转换器、绑定模式 |
| maui-collectionview | `references/maui.md` §5 | 列表/网格：布局、选择、分组、增量加载、SwipeView、ListView 迁移 |
| maui-shell-navigation | `references/maui.md` §6 | AppShell 层次、Route 注册、GoToAsync、传参、导航守卫 |
| maui-safe-area | `references/maui.md` §7 | .NET 10 SafeAreaEdges/edge-to-edge、键盘避让、Blazor Hybrid CSS env |
| maui-theming | `references/maui.md` §8 | 明暗模式：AppThemeBinding、ResourceDictionary 切换、DynamicResource、UiMode |
| winforms-expert | `references/winforms.md` | WinForms 创建/修改/评审：设计器序列化契约、症状修复表、验证流程 |

## 全局门禁

- **Blazor 先读 `AGENTS.md`**：动手前确认项目的 Interactivity Mode/Scope，表单机制、数据访问、注册方式全由它决定。
- **计划即实现**：复杂 UI 分解后立即写代码，绝不停在计划或问"可以继续吗"。
- **MAUI/WinForms 答窄**：主题文件是参考不是清单——只答用户所问，不重写其未要求且可用的代码；CollectionView 四条铁律（无 ViewCell、可变列表用 ObservableCollection、UI 线程改集合、每个 DataTemplate 设 x:DataType）与 WinForms 设计器序列化契约（InitializeComponent 内无 lambda/局部变量/控制流）不可违反。
- **API 存在性先验证**：SafeAreaEdges 需 net10.0+；ListView obsolete 仅 .NET 10+；WinForms DataContext/Command 先确认 TFM——按项目实际 TFM 给方案。
- **WinForms 构建 ≠ 设计器健康**：有 validator 先跑 validator 再 build；能开设计器就做 round-trip，开不了如实报 not run。
- **边界**：纯视觉风格/配色/品牌 → `web-visual-design`；.NET/C# 语言与后端（Web API/EF Core/P/Invoke/SIMD）→ `dotnet-dev`；端到端交付流程 → `dev-expert`。
