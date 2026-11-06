# Windows Forms

蒸馏自 dotnet-winforms 插件 winforms-expert。触发门禁：请求含明确 WinForms 标记才用（WinForms、System.Windows.Forms、Form/UserControl Designer 文件、VS WinForms Designer、TableLayoutPanel、BindingSource、DataGridView、Control.InvokeAsync、组件托盘序列化等）；WPF/XAML、MAUI、Avalonia 或无任何标记的请求不适用。

## 核心契约：设计器序列化 vs 应用行为

两个代码上下文，规则完全不同：

| 上下文 | 文件 | 规则 |
|---|---|---|
| 设计器序列化 | `*.Designer.cs/.vb`、`InitializeComponent` | 只写设计器能解析再生成的简单确定性语句，当**序列化格式**而非普通代码 |
| 应用行为 | 主 partial 类、服务、VM | 用项目 TFM/语言版本支持的任意现代语法 |

`InitializeComponent`/设计器文件内铁律：
- 控件/组件用**类级字段**，绝不把控件塞进 `Controls/Items/Columns` 等序列化集合的局部变量。
- 事件一律绑主 partial 文件里的**具名处理器**，绝不 lambda/匿名委托。
- 禁控制流（if/循环/switch/try/lock/await/goto）、局部函数、表达式体逻辑、集合表达式、`?.`/`??` 等运行时决策。
- 不放业务逻辑/数据加载/验证/服务调用；除 `InitializeComponent`/`Dispose` 外不加方法。
- 保留生成器的命名空间/限定/排序/资源/nullable 风格——**不为现代化而改生成语法**；最小化设计器 diff，不整体重排重格式化。
- `BeginInit/EndInit`、`SuspendLayout/ResumeLayout`、容器所有权必须配对平衡。
- 设计器可实例化的 Form/UserControl 必须保留无参构造路径（有运行时依赖则保留原构造 + 加设计期可用路径，依赖使用推迟到运行加载并加设计期守卫）；VB 保留 `Friend WithEvents` 与主文件 `Handles`。

安全生成顺序：实例化控件/组件 → 需要时建 `IContainer` → BeginInit/SuspendLayout → 子属性赋值 → 加入序列化集合并绑具名处理器 → 配置容器本身 → EndInit/ResumeLayout/PerformLayout → 生成字段声明在原位置。复杂逻辑一律挪到主 partial（`InitializeComponent()` 之后）。托盘组件（Timer、BindingSource、ImageList）必须传入 `components` 容器，随 Form 关闭释放。

## 症状 → 修复速查

| 症状 | 做 | 绝不 |
|---|---|---|
| 能编译但设计器无法实例化 | 保留运行时构造 + 无参设计路径 + 依赖延迟到运行期 | 设计路径里构造生产服务/开文件/查数据 |
| 设计器保存/重开后控件消失、重复 | 恢复生成字段/集合形状，平衡每对 Begin/End、Suspend/Resume | 在 OnLoad 打补丁或把控件挪进局部变量 |
| 改列表不刷新绑定控件 | `BindingList<T>` 或项目既有适配器 | 把 `ObservableCollection<T>` 当 WinForms DataSource 直用 |
| DPI/字体/本地化下内容裁切 | 从叶子到每级父检查 AutoSize/AutoSizeMode/Dock/Min/Max/行列样式，去掉真实增长上限、保留刻意最小值，同步安置相邻控件 | 以为 `AutoSize=true` 就够、只放大一个固定 Size |
| UI 异步工作完成/异常丢失 | 操作放 `Task` 返回方法（可 await/可测）；`async void` 事件处理器只做 `await RefreshAsync()`；可能离开上下文处 `await InvokeAsync`（选对同步/异步、有无返回值的重载）；`finally` 恢复控件状态 | 整个操作塞 `async void`、`_ =`、fire-and-forget BeginInvoke、用应用级钩子当常规路径 |
| 文本要本地化 | 走既有 `.resx` + `ComponentResourceManager.ApplyResources` 序列化 | 在 InitializeComponent 硬编码兜底文案 |
| VB 启动/单实例/UI 异常钩子 | 扩展 `ApplicationEvents.vb`（VB Application Framework），限定 `Microsoft.VisualBasic.ApplicationServices` 事件参数类型；`e.ExitApplication` 显式设定并在报告说明 | 发明 `Program.vb`/`Sub Main`、替换生成启动代码 |
| 评审没发现真实设计器缺陷 | 文件逐字节不动，解释为何可疑构造无害 | 顺手清理警告/格式化/现代化 |

## 布局、绑定、启动策略

- 新布局优先 `TableLayoutPanel`/`FlowLayoutPanel`/`SplitContainer`/嵌套 UserControl，弃脆弱绝对定位；复杂界面拆小区域不用单个超大 grid；列宽 AutoSize（标题/单行）+ Percent（可扩内容）+ Absolute（真固定）；保留既有 `AutoScaleMode`，新表单按项目约定刻意选择而非照抄别 DPI 坐标；autosize 链完整（autosized 行里的固定高 Panel/GroupBox 仍会裁切）；可缩/本地化对话框设合理 MinimumSize。
- 对话框：`AcceptButton`/`CancelButton`/`DialogResult`；提交时整表验证，别在每个焦点切换里取消把用户困在字段。
- 经典绑定：可变对象 `INotifyPropertyChanged`；列表变更 `BindingList<T>`；设计/运行中介用 `BindingSource`；转换逻辑放 `Binding.Format/Parse` 而非生成代码；经典 Binding **没有** WPF 式 OneWayToSource——变通要写明并测试。现代 MVVM API（`Control.DataContext`、`ButtonBase.Command`/`ToolStripItem.Command`/`CommandParameter`）先确认 TFM 真有再用；VM 是否独立项目遵循仓库既有分离，不为小修新增架构。
- 自定义 Component/Control 属性序列化三选一（CodeDOM 策略，勿混用矛盾策略）：非默认才序列化（`[DefaultValue]` 或 `ShouldSerializeX`/`ResetX`，且默认元数据与运行时初始化严格一致——`[DefaultValue(typeof(Color),"Yellow")]` 就真用 `Color.Yellow` 初始化）；不序列化（`DesignerSerializationVisibility.Hidden`）；序列化内容（`Content` + 设计器兼容可变内容）。改完测属性网格编辑 + 保存重载。
- 启动模型保持现状：C# 在 `Program.cs` 配默认；VB 用 Application Framework + `ApplicationEvents.vb`。DPI 维护常规行为用 `SystemAware`，`PerMonitorV2` 仅当应用确为按监视器缩放设计并测过。`async void` 处理器 await 后默认回 UI 上下文（未刻意绕过时直接操作控件合法）；`Application.ThreadException`/`AppDomain.UnhandledException` 是兜底不是常规错误路径。
- 可用性：TabIndex 逻辑序 + 键盘遍历、助记符、AccessibleName、默认焦点/接受取消、DPI×主题组合检查；owner-draw/DataGridView/图标逐主题验对比度，系统色自适应而硬编码色不自适应。

## 执行与验证契约

编辑前：列工作区根、找任务专用 validator/测试脚本/文档化验证命令，读其场景选择器与参数再定实现。编辑后按序：① 先跑窄 validator 并修掉它归因于本次变更的全部失败；② 通过后跑聚焦构建（`dotnet build <project> --nologo`）；③ 构建或后续编辑再动源码则重跑 validator。构建成功**不能替代**可用的布局/绑定/序列化/设计器安全检查，也不能替代设计器实开。

设计器 round-trip（环境允许时）：打开每个改过的 Form/UserControl → 确认设计面/工具箱/属性网格/组件托盘/继承控件无错加载 → 做一次无害可逆属性改动、保存、关闭、重开 → 只回滚这个验证用改动（不动需求实现）→ 再构建。

不可用时（无 VS/设计器/桌面/工作负载/目标运行时）：该验证报 **not run** + 原因，列出实际跑过的检查；绝不以静态验证冒充 round-trip、不以成功形状的替代掩盖失败。命令失败：报命令与首条可操作错误，区分"本次变更导致" vs 工具缺失/平台不符/文件锁/网络/既有失败；变更导致的修完重跑。

收尾验证记录四行：`Build:` 命令+结果；`Runtime UI:` 实际跑过的行为 或 not run+原因；`Designer round trip:` 打开/编辑/保存/关闭/重开 或 not run+原因；`Preserved:` 有意保持不动的项目策略与生成/启动文件。

边界：不迁移到其他 UI 框架（除非明确要求）；不为风格重写可用生成代码；不顺手改 TFM/语言版本/SDK/包策略/启动模型/DPI 模式/全局主题。
