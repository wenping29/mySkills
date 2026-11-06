# .NET MAUI 跨平台应用

蒸馏自 dotnet-maui 插件 8 个技能。多数技能共同原则：**只回答用户问的部分**——技能内容是参考而非清单，不要把未涉及的分组/性能/平台配置硬塞进答案；不要为风格重写用户已工作的代码。

## 1. dotnet-maui-doctor — 开发环境诊断与修复

适用：MAUI 环境搭建、构建报 SDK/workload/JDK/Android/Xcode 错误、更新后验证。不用于：非 MAUI 项目、Xamarin.Forms、与环境无关的运行崩溃、商店发布签名问题。

**核心原则：绝不硬编码版本。** .NET 每年 11 月发新主版本，训练数据必然过时——一律动态发现：
- 当前活跃主版本：`https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json` 取 `support-phase == "active"` 的 `latest-sdk`，与 `dotnet --info` 比对。
- JDK/Android SDK/Xcode 要求：从 NuGet workload manifest 的 `WorkloadDependencies.json` 取 `jdk.version` 范围与 `jdk.recommendedVersion`、`androidsdk.packages`/`buildToolsVersion`/`apiLevel`、`xcode.version` 范围。

Workload 矩阵：`maui`（macOS/Windows 必装；**Linux 无此元工作负载，用 `maui-android`**）、`android`（全平台必装）、`ios`（macOS 必装、Windows 可选、Linux 不适用）。

修复规则：
- workload 一律 `dotnet workload install <id> --version <x>` 显式版本；**绝不用 `workload update` / `workload repair`**。
- JDK **只支持 Microsoft OpenJDK**（Oracle/Adoptium/Azul 版本对了也构建失败）；`java -version` 输出须含 "Microsoft"。**不要设 JAVA_HOME**——MAUI 从已知路径自动检测；JAVA_HOME 指向非微软 JDK 时报为异常让用户决定，不擅自卸载。
- Android SDK 用 `sdkmanager`（Windows 用 `sdkmanager.bat`）核对包/build-tools/apiLevel。
- macOS：`xcodebuild -version` 比对范围；Windows：核对 Windows SDK（通常随 workload/VS 装好）。

每修一项立即重跑对应验证，迭代到全绿。最终构建验证：`dotnet new maui` 到临时目录 + `dotnet build`，成功即环境可用。`dotnet build -t:Run -f net10.0-android` 等真机/模拟器部署**先征得用户同意**再做。

## 2. maui-app-lifecycle — 应用与 Window 生命周期

四状态：Not Running / Running / Deactivated（可见但失焦：对话框、分屏、通知栏）/ Stopped（完全后台）。`Window` 六事件：Created、Activated、Deactivated、Stopped、Resumed、Destroying。

订阅方式：`App.CreateWindow` 里 `base.CreateWindow(...)` 后挂事件；或自定义 `Window` 子类覆写 `OnActivated/OnStopped/OnResumed/OnDestroying`，从 `CreateWindow` 返回。

后台保存/恢复流程：识别瞬态状态（草稿、滚动位置）→ `OnStopped` 存（小值 `Preferences.Set`，大值文件序列化）→ `OnResumed` 读回 → **Android 返回键可能跳过 Stopped 直接 Destroying，关键保存两处都要写** → 处理器 1–2 秒内完成（Android ~5s ANR、iOS 后台时限），别在生命周期处理器里写数据库。

平台映射与原生钩子：`MauiProgram.cs` 里 `builder.ConfigureLifecycleEvents(events => ...)` + `#if ANDROID/IOS||MACCATALYST/WINDOWS`。Android：Created→OnCreate、Activated→OnResume、Deactivated→OnPause、Stopped→OnStop、Destroying→OnDestroy。iOS builder 方法名与 UIKit selector **不同名**：激活用 `.OnActivated()`/`.OnResignActivation()`——**不存在** `.DidBecomeActive()`/`.WillResignActive()`，写错编译不过。Windows：OnLaunched/Activated/VisibilityChanged/Closed。

铁律：① **首次启动不触发 Resumed**（序列是 Created→Activated），每次进前台都要跑的逻辑放 OnActivated；② Deactivated≠Stopped，别在 OnDeactivated 做重保存；③ iPad/Catalyst/桌面多窗口各 Window 独立触发事件，无全局单一生命周期；④ 禁用 Xamarin.Forms 遗留 `Application.OnStart/OnSleep/OnResume`（绕过 Window 事件、破坏多窗口）。

## 3. maui-dependency-injection — DI 配置与生命周期选择

容器即 `Microsoft.Extensions.DependencyInjection`，全部注册在 `MauiProgram.CreateMauiApp()` 的 `builder.Services`，build 后不可变。

| 类型 | 生命周期 | 理由 |
|---|---|---|
| Page / ViewModel | `AddTransient` | 每次导航新实例避免陈旧状态；**Singleton 页从视觉树移除后无法再加回** |
| 共享/昂贵服务（设置、DB、HttpClient） | `AddSingleton` | 全应用一份 |
| `AddScoped` | **默认别用** | MAUI 无 HTTP 请求作用域；每 Window 一个 scope → Scoped=窗口寿命；从根容器解析则退化为 Singleton。两者都不给"每次导航全新"。真要 unit-of-work：`AddTransient`、手动 `scopeFactory.CreateScope()`、或 `AddDbContextFactory`——给菜单讲权衡，别开单方 |

模式：Page 构造注入 VM 并 `BindingContext = viewModel`；Page 注册 DI + `Routing.RegisterRoute(nameof(X), typeof(X))` 后 `GoToAsync` 自动解析全依赖图。**导航参数不走构造函数**——ViewModel 实现 `IQueryAttributable.ApplyQueryAttributes` 接收（Shell 同时应用到 page 和其 BindingContext）。平台差异实现 `#if` 分支**必须覆盖所有目标平台或加 `#else` NoOp 回退**，漏一个平台即运行时 null。

陷阱：① `<ShellContent ContentTemplate="{DataTemplate ...}">` 的页用 `Activator.CreateInstance` 创建**不经 DI**——有参构造直接 `MissingMethodException`；要 DI 就给无参构造或改路由导航。经 `RegisterRoute`+`GoToAsync` 的页走 `ActivatorUtilities.GetServiceOrCreateInstance`（未注册类型也能注入，缺依赖则抛）。② `App.xaml` 资源在 `InitializeComponent()` 解析、早于容器就绪——依赖服务的工作推迟到 `CreateWindow()`（`App` 注入 `IServiceProvider`，`AppShell` 注册为 Transient 后 `GetRequiredService<AppShell>()`）。③ Service locator（`Handler.MauiContext.Services.GetService`）仅最后手段。④ 别给未用 DI 的项目引入 DI、别为对称性强行加接口——只在用户要求或修真实缺陷时。

## 4. maui-data-binding — 数据绑定与编译绑定

编译绑定比反射快 8–20 倍且 NativeAOT/裁剪必需。`x:DataType` **只放在绑定作用域起点**：页/视图根（设 BindingContext 处）+ **每个 `DataTemplate`**。禁把 `x:DataType="x:Object"` 撒到子元素逃避编译检查（退回反射）。

警告码（.NET 10/11 核实；编号随 SDK 带次变，新版本先查 BuildException.cs）：XC0022=作用域内无 x:DataType 回落反射；XC0023=x:DataType 显式 `{x:Null}`；XC0024=DataTemplate 继承外层 x:DataType（给它自己的）；XC0025=带显式 Source 未编译。csproj 强制：

```xml
<MauiEnableXamlCBindingWithSourceCompilation>true</MauiEnableXamlCBindingWithSourceCompilation>
<WarningsAsErrors>XC0022;XC0025</WarningsAsErrors>
```

顺序不能反：项目有 `Source=`/`RelativeSource` 绑定时未开开关就提升 XC0025 会全线报错。

- **Mode** 只在覆盖默认时显式写（`Label Text` 默认 OneWay、`Entry Text`/`Switch IsToggled` 默认 TwoWay，写 `Mode=` 重复项是噪音）；静态值用 `OneTime`。
- 变更通知：推荐 CommunityToolkit.Mvvm `ObservableObject` + `[ObservableProperty]` + `[RelayCommand]`（源生成器全包）；或手写 INPC（判等再触发）。**POCO 基类绑定永不更新**。绑定目标必须 public 属性（字段被忽略）。
- 绑定空白先查 BindingContext 是否真设了，别先怀疑路径。
- `IValueConverter`（Convert/ConvertBack；`ConverterParameter` 永远以 string 传入，内部自行解析）；多源合并 `MultiBinding` + `IMultiValueConverter`；简单格式化用 `StringFormat='Total: {0:C2}'`（含逗号/大括号要单引号包裹），免转换器。`FallbackValue`=路径解析失败/转换器抛异常时用；`TargetNullValue`=值为 null 时用。
- RelativeSource：`Self`（如 Height=Width）、`AncestorType={x:Type ContentPage}`（够到父级 BindingContext）、`TemplatedParent`（ControlTemplate 内）。
- .NET 9+ 代码绑定 AOT 安全：`label.SetBinding(Label.TextProperty, static (PersonViewModel vm) => vm.FullName)`。
- 线程：`PropertyChanged` 自动封送到 UI 线程（后台线程赋值属性安全）；但 **ObservableCollection 的 Add/Remove 从后台线程改可能崩溃**——`MainThread.BeginInvokeOnMainThread(() => Items.Add(x))`。

## 5. maui-collectionview — 列表与网格

四条不可协商（违反即代码不工作）：① 模板根**绝不用 `ViewCell`**（任意 View/Layout 即可）；② 首渲染后会变的列表用 `ObservableCollection<T>`（`List<T>` 仅适用于绑定后不变）；③ 集合变更在 UI 线程；④ 页根与每个 DataTemplate 都设 `x:DataType`。其余（分组、snap、EmptyView、性能项）按需取用，不是清单。

- 布局 `ItemsLayout`：`VerticalList`（默认）/`HorizontalList`/`GridItemsLayout Orientation + Span + ItemSpacing`。
- 选择：`Single`→绑 `SelectedItem`（TwoWay）；`Multiple`→绑 `SelectedItems`（`IList<object>`，OneWay）。选中高亮：模板根加 `VisualStateGroup "CommonStates"` 的 `Normal`/`Selected` 态（可配 `{AppThemeBinding}`）。
- 分组：组类 `: List<T>` 带 Name → 绑 `ObservableCollection<组>` + `IsGrouped="True"` + `GroupHeaderTemplate`。
- 下拉刷新：`RefreshView` 包裹（`IsRefreshing` + `Command`），完成时**必须把 IsRefreshing 置回 false**。
- 增量加载：`RemainingItemsThreshold="5"` + `RemainingItemsThresholdReachedCommand`；**不得配非虚拟化布局**（BindableLayout 无虚拟化会无限触发）。
- SwipeView 项内命令够不到 VM：`Command="{Binding BindingContext.DeleteCommand, Source={RelativeSource AncestorType={x:Type ContentPage}}}"` + `CommandParameter="{Binding}"`。
- `EmptyView` 字符串直接用；自定义视图**包 `ContentView`**。静态 Header/Footer 直放，数据绑定用 `HeaderTemplate/FooterTemplate`。
- 滚动：`ScrollTo(index/item, ScrollToPosition.MakeVisible|Start|Center|End, animate)`；`LinearItemsLayout` 的 `SnapPointsType=MandatorySingle` + `SnapPointsAlignment`。
- 性能（仅在用户报性能问题时给）：等高项用 `ItemSizingStrategy="MeasureFirstItem"`——**设在 `<CollectionView>` 上**（声明于 StructuredItemsView），设在 layout 上编译不过；变高文本/DataTemplateSelector/首项特殊/尺寸依赖未加载数据时保持默认 `MeasureAllItems`。替换 `ItemsSource` 整体重渲染——原地改集合。
- ListView 迁移：`ListView` **自 .NET 10 起 [Obsolete]**（.NET 9 及更早不是——先查 TFM 再定性）。映射：ViewCell→任意根；`ItemSelected`→`SelectionChanged`；`ItemTapped`→模板内 `TapGestureRecognizer`（SelectionChanged 点已选项不再触发）；`IsPullToRefreshEnabled`→RefreshView；`HasUnevenRows`→默认 MeasureAllItems；固定行高→模板内定高；**分隔线无等价物**——模板自画 BoxView/Border（最常见迁移意外）。用户没要求时不静默重写其 ListView 代码。

交付前自查：模板根非 ViewCell、DataTemplate 有 x:DataType、可变列表用 ObservableCollection、ItemSizingStrategy 位置正确、Single/Multiple 绑对属性、IsRefreshing 会复位、答案只覆盖所问。

## 6. maui-shell-navigation — Shell 导航

四级层次 `Shell > FlyoutItem|TabBar > Tab > ShellContent`；可省略中间层自动补（裸 ShellContent→FlyoutItem>Tab>ShellContent）。FlyoutItem 进抽屉；TabBar 只有底部栏；一个 Tab 内多个 ShellContent=顶部 tab。

硬性规则：
- **永远 `<ShellContent ContentTemplate="{DataTemplate views:MyPage}" Route="mypage">`**——直接放子元素会在启动时构造全部页面；**每个 ShellContent 显式 Route**，否则 MAUI 按共享计数器生成 `D_FAULT_ShellContent{n}`，编号不连续且随增删页面漂移，绝对路由/深链没法写。
- 层次外详情页先 `Routing.RegisterRoute("details", typeof(DetailsPage))`（AppShell 构造函数）再 `GoToAsync("details")`；未注册相对路由运行时抛；重名（含与层次路由冲突）抛 `ArgumentException`。
- 任何 `GoToAsync` 必须 `await`（fire-and-forget 吞异常+竞态）。
- 前缀：`//`=从根绝对（须匹配完整路径 `//FlyoutItem/Tab/ShellContent`，写错**静默无操作**不抛）；无=相对压栈；`..`=返回一层（`../..` 两层；`../editanimal` 返回再压）。
- 收参数：首选 **ViewModel 实现 `IQueryAttributable`**（一次收全部，状态跟 BindingContext 走）；`[QueryProperty]` 也放 ViewModel，且属性必须发变更通知（Shell 在构造函数设完 BindingContext 之后才应用，普通自动属性会卡初值）；整对象用 `ShellNavigationQueryParameters` 传，别序列化进查询串。
- 导航守卫：`AppShell.OnNavigating` 中 `args.Source == ShellNavigationSource.Pop` 且未保存时 `var deferral = args.GetDeferral(); ... args.Cancel(); deferral.Complete();`——异步确认必须 deferral，不同步阻塞。
- Tab 外观附加属性：`Shell.TabBarBackgroundColor/ForegroundColor/TitleColor/UnselectedColor/TabBarIsVisible`（页面级隐藏：`Shell.TabBarIsVisible="False"`）。`FlyoutBehavior=Disabled|Flyout|Locked`；`FlyoutDisplayOptions=AsSingleItem|AsMultipleItems`；非导航抽屉项用 `<MenuItem>`；返回按钮 `<Shell.BackButtonBehavior>`（Command/IconOverride/TextOverride/IsVisible）。
- 状态查看：`Shell.Current.CurrentState.Location`、`CurrentPage`、`Navigation.NavigationStack`（**只读**，改栈只能 GoToAsync）。`ShellNavigationSource`：Push/Pop/PopToRoot/Insert/Remove/…
- Shell 应用里不要提 `NavigationPage.PushAsync` 方案，也不要未经要求重构既有 AppShell 层次。

## 7. maui-safe-area — 安全区与 edge-to-edge（.NET 10+）

门禁：`SafeAreaEdges`/`SafeAreaRegions` 是 **.NET 10 新 API**（TFM 须 net10.0-*）；.NET 9 及更早引导用旧 `ios:Page.UseSafeArea`/`Layout.IgnoreSafeArea`。

`SafeAreaRegions`（Flags）：`None`（贴边）、`SoftInput`（避键盘）、`Container`（避状态栏/刘海/Home 指示条）、`Default`（控件类型平台默认）、`All`；可 `Container|SoftInput` 组合。`SafeAreaEdges` 结构体支持均匀/水平+垂直/逐边三构造；XAML 类 Thickness 逗号语法：`SafeAreaEdges="Container, Container, Container, SoftInput"`（L,T,R,B）。预设 `SafeAreaEdges.None/All/Default`。

控件默认值：ContentPage=`None`（**Android 相对 .NET 9 的破坏性变更**——升级后内容钻状态栏就加 `SafeAreaEdges="Container"` 恢复）；Layout=`Container`；ScrollView=`Default`（iOS 映射自动 content insets，**只认 Container 和 None**）；ContentView/Border=`None`。

决策：表单/关键输入→`All`；照片/视频/游戏沉浸→页**和**内层 layout 都 `None`（只设页不设 layout，layout 默认 Container 仍内缩——最常见错误）；固定头尾滚动内容→`Container`；聊天底部输入栏→逐边 `Container,Container,Container,SoftInput`。ScrollView 忽略 SoftInput——外面包 Grid 把 SoftInput 加在 Grid 上。`Default`≠`None`（Default 是"该控件类型的平台默认"）。

迁移映射：`ios:Page.UseSafeArea="True"`→`SafeAreaEdges="Container"`；`Layout.IgnoreSafeArea="True"`→`None`；`WindowSoftInputModeAdjust.Resize`（未废弃但仍 Android-only）→跨平台用 ContentPage `All`/SoftInput。

Blazor Hybrid：页保持 `None`， insets 交给 CSS `env(safe-area-inset-*)`——`index.html` viewport **必须加 `viewport-fit=cover`**（缺了 iOS 上 env 恒为 0），且 XAML Container 与 CSS env 二选一，都做=双倍内缩。

## 8. maui-theming — 明暗模式与主题切换

选型：`AppThemeBinding`（跟系统明暗、代码最少、只支持两主题）；`ResourceDictionary` 换字典（自定义品牌/多于两主题/用户可选，须全程 `DynamicResource`）；两者组合。别为风格把可用方案互换——只在用户需要另一方案的能力时。

**AppThemeBinding**：调色板在 App.xaml 定义一次（原始 `Color` 资源 + 隐式 `Style TargetType="ContentPage" ApplyToDerivedTypes="True"` 里 `{AppThemeBinding Light={StaticResource ...}, Dark={...}}`），页面零主题标记；**撒 `{AppThemeBinding Light=#333, Dark=#FFF}` 字面量到每个元素是最常见错误**。行内只留给真正的一次性场景且引用资源键。C#：`SetAppThemeColor(prop, light, dark)`（Color）与泛型 `SetAppTheme<T>`（任意类型，如 FontSize double）都该给出；BindableProperty 必须属于调用对象类型。

**字典切换**：每主题一个 `ResourceDictionary` xaml（带 `x:Class` 需 code-behind `InitializeComponent()`；纯 `Source` 加载不需要），键集必须完全一致（缺键静默回退默认值）。消费一律 `{DynamicResource Key}`——`StaticResource` 加载时定死、换字典不更新。

> 🚨 **绝不调 `MergedDictionaries.Clear()`**：默认模板把 `Colors.xaml`/`Styles.xaml` 合并在里面，Clear 连它们一起删、全应用样式静默消失。正确姿势：字段记住 `_currentTheme`，`merged.Remove(_currentTheme); merged.Add(theme); _currentTheme = theme;`。

系统主题：读 `Application.Current.RequestedTheme`；`UserAppTheme = AppTheme.Dark` 强制覆盖 OS、`Unspecified` 恢复跟随；`RequestedThemeChanged` 事件里换字典/刷新。用户偏好 `Preferences.Set/Get` 持久，App 构造/CreateWindow 时应用。

Android `MainActivity` 的 `ConfigurationChanges` **必须含 `ConfigChanges.UiMode`**（仅涉及运行时/系统切换时）——缺了主题变化整 Activity 重启、丢导航状态形似崩溃。CSS 主题**不能**运行时切换（要切换就用字典方案）。
