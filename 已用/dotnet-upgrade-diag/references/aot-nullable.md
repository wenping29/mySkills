# AOT/裁剪兼容、可空引用迁移与 Thread.Abort 迁移

蒸馏自源技能 `dotnet-aot-compat`、`migrate-nullable-references`、`thread-abort-migration`。覆盖：Native AOT/IL 裁剪分析器警告的系统性消除、项目级/逐文件启用可空引用类型并清零 CS86xx、.NET Framework `Thread.Abort` 到协作式取消的迁移。不用于：发布 AOT 二进制、优化体积、替换重反射库；只想抑制警告而不修复；已全量迁移完成的项目（除非审计 suppression）；留在 .NET Framework 的项目；第三方库内部的 Thread.Abort。

## 1. AOT/裁剪兼容（dotnet-aot-compat）

前提：net8.0+（或多目标含 net8.0+）；纯 net4x 不支持本分析器。

**铁律**：IL 警告**绝不**用 `#pragma warning disable`（只瞒 Roslyn，链接器/AOT 编译器仍看见，发布期失败）或 `[UnconditionalSuppressMessage]`（连链接器一起瞒，无法验证安全）——构建期报错永远好过隐藏后运行时静默坏。首选 `[DynamicallyAccessedMembers]` 沿调用链流动类型信息；流被破坏（`Type` 装箱进 `object[]`、无类型集合、接口中转）就**重构保住流**而不是抑制；根本不可静态描述的用 `[RequiresUnreferencedCode]/[RequiresDynamicCode]/[RequiresAssemblyFiles]` 标记并向调用方传播。

**流程（警告驱动，禁止先探索代码库）**：
1. csproj 加（多目标必须带条件，否则旧 TFM 报 NETSDK1210）：
```xml
<PropertyGroup>
  <IsAotCompatible Condition="$([MSBuild]::IsTargetFrameworkCompatible('$(TargetFramework)', 'net8.0'))">true</IsAotCompatible>
</PropertyGroup>
```
2. `dotnet build <csproj> -f <net8+> --no-incremental 2>&1 | grep 'IL[0-9]\{4\}'` 收集、排序去重。
3. **按代码分组计数再分诊**（先别逐文件读）：IL2026+IL3050 大量来自 JsonSerializer→直接走 JSON 批修；IL2070/IL2087→内层方法加 DAM 注解再级联；IL2067→源头参数注解。多数真实项目 JsonSerializer 占大头。
4. 由**最内层**反射调用向外修，每 5-10 条一批立即重建（修复会级联出新警告）。可用子代理时：2 轮构建-修复后把剩余文件编辑并行派给子代理（每个 5-10 文件），主循环只管构建与分诊。
5. 全 TFM 重建：net8+ 0 IL 警告、无 NETSDK1210、旧 TFM 干净。

**常见码**：IL2070 Type 参数反射缺注解；IL2067 未注解 Type 传入期望参数；IL2072 返回值/拆箱丢注解；IL2057 `Type.GetType(非常量)`；IL2026 调用 RUC 方法；IL2050 P/Invoke COM 封送；IL2091 泛型实参不满足约束注解；IL3000 `Assembly.Location` 单文件/AOT 返回空；IL3050 调用 RDC 方法。

**策略**：A=DAM 注解（调用方注解必须 ⊇ 被调方要求的成员集，否则 IL2091）；B=重构保流（`object[]` 参数袋拆出专用注解参数、集合存储改带注解类型字段、接口方法参数加注解、装箱 getter 注解返回类型）；C=JSON 源生成批修——grep 收集全部 `JsonSerializer.Serialize/Deserialize` 调用点提取类型，建**一个** `JsonSerializerContext` 只登记**自己拥有**的类型（外部包类型不会源生成），机械替换调用点为 `Context.Default.TypeName` 重载（**别用 sed 改 C#**，泛型尖括号会被改坏），构建一次后剩余非序列化警告走 A/B/D；D=`[RequiresUnreferencedCode]` 最后手段（整条调用链标为裁剪不兼容，慎用）。

**陷阱**：外部类型无 AOT 安全序列化——先看是否实现 `IJsonModel<T>`（Azure SDK 常见）是则直接 `((IJsonModel<T>)v).Write(writer, ModelReaderWriterOptions.Json)` 绕开 JsonSerializer，否则手写 `Utf8JsonReader/Writer` 转换器经 `[JsonSourceGenerationOptions]` 注册；Newtonsoft/XmlSerializer 等反射序列化器不 AOT——迁到 STJ 源生成，迁不动就标 RUC；共享 projitems 的注解影响所有消费工程，要全部重建验证。

**停止信号**：每模式最多深读 2-3 个代表文件后批量套用；一次构建后即开修，不做第二轮分析；某警告注解流 3 轮修不动→升级 RUC；需要架构级重构（换整个序列化层）→记录并停；不改第三方依赖的警告；用户限定范围（"只修这个文件"）不扩到全工程；0 IL 警告即止，不顺手优化已干净注解。旧 TFM（netstandard2.0/net472）需 `DynamicallyAccessedMembersAttribute` 等 polyfill（源技能 `references/polyfills.md`）。

**清单**：csproj 条件属性✓ 构建开分析器✓ 全部 IL 警告经注解/重构消除✓ 零 pragma/UCSM✓ polyfill✓ 全 TFM 0 警告✓ 共享源验证✓。

## 2. 可空引用迁移（migrate-nullable-references）

**零运行时行为变更门禁（最高优先）**：NRT 迁移是纯元数据/注解工程——生成的 IL 不得变（无新分支、无新 null 检查、无控制流变化、无增删调用）。允许的改动仅：`?` 注解、可空属性（`[NotNullWhen]` 等）、`!`（仅元数据）、`#nullable` 指令。迁移中发现缺失的运行时守卫或潜伏 bug **不顺手修**——在点位插 `// TODO: Consider adding ArgumentNullException.ThrowIfNull(param)` 注释留给独立变更。步骤边界各提交一次（启用→解引用→声明→属性→清 suppression）；逐文件迁移按文件/批次提交。

**评估**：NRT 需 C#8+（netcoreapp3.0/netstandard2.1+）。`<LangVersion>` 或 TFM 不足（如 net4x 未显式设版本）**即停**——向用户解释要改什么并问继续还是放弃，绝不默默升级。`<Nullable>` 已 enable 则跳到审计。项目类型定优先级：**库**=公共 API 契约优先（每个公共 `?` 都是消费者依赖的契约变更，保守精确）；**应用**=边界空安全优先（反序列化/DB/用户输入/外部 API），内部管道宽松；**测试**=! 可多用，保证干净编译即可。

**策略**：A=项目级 enable（<约50 文件或一轮做完）；B=`warnings` 先行修解引用警告再改 `enable` 触发第二波（大型/活跃代码库）；C=逐文件 `#nullable enable`（超大型遗留库）。多工程按依赖序（共享库先行，消除级联重复工作）；**从中心向外**：核心领域模型/DTO/共享工具先注解（收益最大），再到服务/控制器/UI。每工程或每层至少一个 PR。启用后**必须 clean build**（增量构建会藏住未改动文件的警告），记录初始警告数为基线，确认仍可编译再往下。

**解引用警告表**：CS8602 可能空调用、CS8600 null 转非空、CS8603 可能 null 返回、CS8604 可能 null 实参。每条决策流程：**null 是设计内合法值？→ 声明加 `?`**；不是→**能证明此处永不为 null？→ `!` + 注释说明**；能靠守卫→加 null 检查（属行为变更，单独提交）；否则回到"是"。CS8603 铁律：**方法真能返回 null 就改返回类型为 `T?`，绝不用 `!` 抑制**——非空返回类型是对所有调用方的承诺，这是 NRT 迁移最重要的一条。

**禁列**：`?.` 当快捷修复（静默跳过调用=行为变更，只在有意容忍 null 时用）；乱撒 `!`（每个 ! 都是"永不为 null"的断言，错了就藏了 NRE）；`return null!`/`default!` 保非空返回类型（调用方信签名跳过检查然后运行时 NRE；`!` 用于返回值仅限可证明非 null 而编译器看不见）；给值类型加 `?`（`int?` 变 `Nullable<T>`，改签名/二进制布局/装箱——引用类型的 `?` 才仅元数据）。

**声明注解原则**：先按设计意图定可空性**再**注解，别让警告驱动（全加 `?` 逼调用方多余检查、全加 `!` 藏 bug）。返回类型反映语义而非编译器满意：`*OrDefault` 系→`T?`；`ExecuteScalar`→`object?`；`Find/TryGet*`/查找→可空；文档/设计上失败返回 null→可空。**不删既有 `ArgumentNullException` 检查**（非空注解只是编译期提示，旧版本调用方/其他语言/反射/`!` 仍可传 null）；同时审计公共非空参数**缺**运行时守卫的——只问用户要不要加 TODO，不在迁移里加。对 null 有定义行为（返回 null/默认/失败结果而非抛）的方法应接受 `T?`（BCL 惯例：`Path.GetPathRoot(string?)` vs `GetFullPath(string)`）；灰区按"自己代码是否传过 null/调用方是否拿 null 当默认/同域方法是否收 null"判，拿不准**偏向 `T?`**（以后可收紧）。公共 API 改可空性前问用户，不靠命名/使用频率猜。

**技巧**：CS8618 构造后必被赋值的字段（框架生命周期/Init()/builder 模式）用 `= null!` 一处声明 + 初始化方法 `[MemberNotNull(nameof(f))]`，胜过 50 处 `!`；布尔辅助方法保证参数非 null→`[NotNullWhen(true)]`（纯元数据，消掉所有调用点 `!`）；守卫库带 `[NotNull]` 时后续赋值不加冗余 `!`；无约束泛型返回 `default` 用 `[return: MaybeNull] T` 而非 `T?`（后者改值类型签名）；`Where(x => x != null)` 不收窄 `T?`→用 `OfType<T>()`；`Debug.Assert(x != null)` 可作流分析提示但 Release 被剥——公共边界仍要显式检查；内部方法每个调用点都加 `!`→改参数为可空。

**特殊类型**：DTO/序列化模型跨信任边界→属性默认 `?`（反序列化数据永远可能是 null，序列化器不走构造器），用 `required`/`[JsonRequired]`/运行时校验强制；领域模型→非空+构造器强制（非法状态不可表示）——两者搞混是迁移最常出错处。`EventHandler? handler = X; handler?.Invoke` 是惯用式；struct 内引用字段：`default(T)` 是合法用法→必须可空，否则保持非空；Dispose 后才可能 null 的字段保持非空（用后 Dispose 是契约违约）；override 可比基类更严格（返回 `T` vs 基类 `T?`），参数必须精确匹配；广泛被 override 的虚方法拿不准→`T?`；引用类型实现 `IEquatable<T?>`/`IComparable<T?>`；`Equals(object?)` 参数加 `[NotNullWhen(true)]`。

**库的破坏性变更**：给公共参数/返回加 `?` 虽二进制不破，但对启用 NRT 的消费者**源码破坏**——建 `nullable-breaking-changes.md` 逐条记录（`T→T?` 返回、`T?→T` 参数、值类型加 `?`、新增 ANE 守卫、迁移中发现的行为变更），交用户审阅并可作发布说明。

**收尾**：清 `#nullable disable`/`!`/`#pragma CS86` 临时抑制（留下者加注释理由，可用源技能 `scripts/Get-NullableReadiness.ps1` 计数，`-Json` 机读）；0 警告后加 `<WarningsAsErrors>nullable</WarningsAsErrors>` 防回归；跑测试。**验证不只看警告数**：抽查公共签名 `?` 是否匹配设计意图、diff 里搜 `?.` 确认没混入行为变更、确认没删 ANE 守卫、`!` 稀少且各有注释。多目标旧 TFM 缺 `[NotNullWhen]` 等属性→`Nullable` polyfill 包或内部定义；生成代码带 `<auto-generated>` 自动豁免，仍有警告就文件头 `#nullable disable` 或 `.editorconfig generated_code=true`；升级依赖后新警告=对方加了注解，正常继续修；未注解依赖=oblivious（编译器不报但返回值仍当可能 null 对待）。EF Core/ASP.NET Core 启用可空会影响架构推断与模型验证（源技能有专 ref）。

## 3. Thread.Abort 迁移（thread-abort-migration）

modern .NET（6+）中 `Thread.Abort` 抛 `PlatformNotSupportedException`，无强制终止托管线程的手段——范式从**抢占式取消**转为**协作式取消**。不适用：只用 `Thread.Join/Sleep/Start` 而无任何 abort/interrupt/`ThreadAbortException` 的代码——这些 API 行为不变，**报告无需迁移**（若顺带提 Task.Run 现代化，必须声明那是与本迁移无关的可选改进）；长期留在 Framework 的项目；第三方库内的用法。

**步骤 1 清点**：搜 `Thread.Abort`、`ThreadAbortException` catch、`Thread.ResetAbort`、`Thread.Interrupt`、`Response.End()`（内部调 Abort）、`Response.Redirect(url, true)`、`SYSLIB0006` pragma。逐处记录位置与意图。

**步骤 2 模式分类 → 替换**：

| 模式 | 现代替换 |
|---|---|
| 可停工作循环 | `CancellationToken` 参数 + 循环内 `token.ThrowIfCancellationRequested()` 检查点 |
| 超时强制 | `CancellationTokenSource.CancelAfter(TimeSpan)`；任务式用 `Task.WhenAny(work, Task.Delay(timeout, cts.Token))`，delay 赢则取消 cts |
| 阻塞调用唤醒 | `Thread.Sleep(ms)`→`Task.Delay(ms, token)` 或 `token.WaitHandle.WaitOne(ms)`；`WaitOne()`→`WaitHandle.WaitAny(new[]{ evt, token.WaitHandle })` |
| ASP.NET 请求终止 | 删 `Response.End()` 直接 return；`Redirect(url, true)`→`Redirect(url)` 或返回 redirect result；ASP.NET Core 长请求用 `HttpContext.RequestAborted` |
| ThreadAbortException 当控制流 | `catch (OperationCanceledException)`+显式清理；清理逻辑进 `finally` 或 `CancellationToken.Register`；**不要吞 OCE**——除非有具体恢复动作，让它传播到顶层编排点 |
| ResetAbort 继续执行 | 把工作拆成可取消单元：每单元后查 `IsCancellationRequested` 决定继续；新单元新建 CTS（可 Link）而非"重置" |
| 不可协作代码终止 | 移到子进程（stdin/stdout 或 IPC 通信），超时 `Process.Kill` |

**步骤 4 清理**：`Thread.Abort()`→`cts.Cancel()`；`Thread.Interrupt()`→token 信号或 `ManualResetEventSlim`（注意 .NET 9 起 Interrupt 也过时 SYSLIB0046）；删 SYSLIB0006 pragma。**步骤 5 验证**：目标框架构建 0 SYSLIB0006 无线程相关错误；全库再搜一遍四个 API 名；跑测试（依赖 Abort 做清理/超时的测试改用 token）；超时场景实测取消后确实停；阻塞场景实测线程及时醒。按模式分组提交，保持可 bisect。

**陷阱**：加了 token 参数却从不检查（协作式取消只在检查点生效，检查频率按可接受延迟设计）；token 没贯穿整条调用链（断一环全链停摆）；以为 token 能打断 `Sleep`/同步 socket 接收（不打断，须换 `WaitOne(ms)`/异步重载）；CTS 是 IDisposable 忘 dispose（定时器与回调泄漏）；以为取消即时生效；拿 `Thread.Interrupt` 当替代（只对 WaitSleepJoin 态生效且抛另一异常类型，同样不推荐）；删 `ThreadAbortException` catch 时没把其中的关键清理（放锁/回滚事务）先搬进 finally。
