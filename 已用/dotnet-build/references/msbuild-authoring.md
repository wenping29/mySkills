# MSBuild 编写与工程文件组织

蒸馏自源技能：msbuild、target-authoring、item-management、property-patterns、extension-points、including-generated-files、directory-build-organization、msbuild-modernization。

## 0. 总入口：三类任务分流（源：msbuild）

MSBuild 工作先分类，只读对应小节：

1. **故障排查**：找独立根因、做最小修复，不做全面清理。有现成 `.binlog` 先分析日志（日志内路径不能证明本地有 checkout），不要急着重跑构建。测试断言失败但构建成功 ≠ MSBuild 故障。
2. **性能**：先建立可信基线再改配置；区分"评估阶段"与"目标/任务执行"耗时；一次只改一个原因，用同场景、同命令、同插桩重复测量并报告噪声。详见 `msbuild-perf.md`。
3. **编写评审**：改进工程文件结构与扩展契约但保持行为；这是 MSBuild 编写清理，**不是**框架/包/语言/旧工程系统迁移。匹配的文本模式 ≠ 缺陷证据，已正确的模式保持不动。

安全底线：不要以"清输出/缓存、停构建服务器、关诊断、序列化构建"作为万能修复；破坏性实验须限定在已批准、自己拥有的输出目录；区分记录事实与假设。

## 1. 自定义 Target 编写规范（源：target-authoring）

### 三层目标链

SDK 主入口（Build/Rebuild/Clean）都委托给一个 `DependsOn` 属性，链式走 Before → Core → After：

```xml
<PropertyGroup>
  <BuildDependsOn>BeforeBuild;CoreBuild;AfterBuild</BuildDependsOn>
</PropertyGroup>
<Target Name="Build" DependsOnTargets="$(BuildDependsOn)"
    Returns="@(TargetPathWithTargetPlatformMoniker)" />
<Target Name="BeforeBuild" />  <!-- 空扩展点，供用户覆盖 -->
<Target Name="AfterBuild" />
```

规则：
- 委托给属性（`DependsOnTargets="$(MyTargetDependsOn)"`），不要硬编码目标列表。
- `OnError` 放在编排目标内部，确保失败时也执行清理（如 `_CleanRecordFileWrites`）。
- 空的 Before/After 是扩展点：用户覆盖它们，SDK 不在其中放逻辑。

### 链扩展：只追加，永不覆盖

```xml
<!-- 好：追加 -->
<CompileDependsOn>$(CompileDependsOn);MyCodeGenTarget</CompileDependsOn>
<!-- 坏：整链被覆盖，SDK 目标被静默丢弃 -->
<CompileDependsOn>MyCodeGenTarget</CompileDependsOn>
```

### DependsOnTargets vs BeforeTargets/AfterTargets

| 机制 | 定义处 | 适用 |
|---|---|---|
| `DependsOnTargets` | 需要依赖的目标自身 | 目标明确需要前置 |
| `BeforeTargets` / `AfterTargets` | 注入方 | 插入到你不拥有的流水线 |

校验类目标用 `BeforeTargets` 拦截所有入口：
`BeforeTargets="$(BuildDependsOn);Build;$(RebuildDependsOn);Rebuild;$(CleanDependsOn);Clean"`。
不控制 targets 文件时，优先 `BeforeTargets="CoreCompile"` 而不是改 `$(CompileDependsOn)`。

### Returns vs Outputs

- `Returns`：MSBuild 任务跨项目调用时拿到的项。查询目标（`GetTargetPath`、`GetTargetFrameworks`）必须用 `Returns`。
- `Outputs`：用于增量判断（时间戳比较）。查询目标误用 `Outputs` 会因"up-to-date"被跳过而返回过期数据。两者不要混用目的。

### 命名约定

`_前缀`=内部；`CoreXxx`=真正实现；`BeforeXxx/AfterXxx`=空钩子；`PrepareXxx`=准备/校验；`ResolveXxx`=发现/解析；`GetXxx`=无副作用查询。

### 完整自定义目标模板

```xml
<PropertyGroup>
  <MyFeatureDependsOn>_ValidateMyFeatureInputs;BeforeMyFeature;CoreMyFeature;AfterMyFeature</MyFeatureDependsOn>
</PropertyGroup>
<Target Name="MyFeature" DependsOnTargets="$(MyFeatureDependsOn)" Returns="@(MyFeatureOutput)" />
<Target Name="BeforeMyFeature" />
<Target Name="AfterMyFeature" />
<Target Name="CoreMyFeature"
    Inputs="$(MSBuildAllProjects);@(MyFeatureInput)"
    Outputs="$(IntermediateOutputPath)myfeature.generated.cs">
  <Exec Command="my-tool.exe -o $(IntermediateOutputPath)myfeature.generated.cs" />
  <ItemGroup>
    <Compile Include="$(IntermediateOutputPath)myfeature.generated.cs" />
    <FileWrites Include="$(IntermediateOutputPath)myfeature.generated.cs" />
  </ItemGroup>
</Target>
```

常见坑：覆盖 DependsOn 属性丢 SDK 目标；查询目标用 Outputs 返回过期值；在 `.props` 里定义 target 导致 `BeforeTargets` 挂不上 SDK 目标（target 放 `.targets`）；忘 `OnError` 破坏后续增量构建。

## 2. Item 管理（源：item-management）

| 操作 | 用途 |
|---|---|
| `Include` | 新增项（标识+元数据） |
| `Remove` | 按模式移除项 / 清空组（`<_Temporary Remove="@(_Temporary)" />`） |
| `Update` | 只修改已存在项的元数据，不新增项 |

`Exclude` 只能配合 `Include` 使用，不能用于 Update/Remove。

### 批处理 %(Metadata)

- `%(Metadata)` 出现在 target 的 `Condition`/`Outputs` → 按唯一元数据值批处理整个 target（如 `%(Culture)` 生成卫星程序集）。
- 出现在任务参数 → 按值批处理该任务。
- **同一表达式混用两个不同项组的 `%()` 会产生 O(N×M) 交叉积**——一个组用批处理，另一个改用属性引用。

### 变换 @(Item->'expr')

```xml
<Copy SourceFiles="@(IntermediateAssembly)"
      DestinationFiles="@(IntermediateAssembly->'$(OutDir)%(Filename)%(Extension)')" />
```

### 其他要点

- 分析器/构建工具包加 `PrivateAssets="all"` 防止流向下游消费者。
- 生成文件写 `$(IntermediateOutputPath)`（obj/），不要写源码树（污染 VCS、glob 重复编译）。
- 目标内创建的每个文件都要加入 `@(FileWrites)`，否则 `dotnet clean` 不清理。

## 3. 属性模式（源：property-patterns）

### 条件默认值（基础模式）

```xml
<Configuration Condition="'$(Configuration)' == ''">Debug</Configuration>
```
两侧必须加引号。`.props` 里=可覆盖默认值；`.targets` 里=兜底。无条件的属性不能被先前导入覆盖。

### 组合与最后写入生效

- 列表属性用分号拼接且保留旧值：`<DefineConstants>$(DefineConstants);MY_FEATURE</DefineConstants>`、`<NoWarn>$(NoWarn);NU5131</NoWarn>`。
- 属性自上而下求值，最后赋值生效；`.targets`（晚导入）覆盖 `.props` 与工程文件。

### 路径处理

| 函数 | 用途 |
|---|---|
| `$([MSBuild]::NormalizePath(...))` | 跨平台合并+规范化 |
| `$([System.IO.Path]::Combine/IsPathRooted)` | 合并/判断绝对 |
| `HasTrailingSlash(...)` | 目录尾斜杠检查 |
| `$([MSBuild]::GetDirectoryNameOfFileAbove(...))` | 向上找标记文件 |
| `$(MSBuildThisFileDirectory)` | 当前文件所在目录 |

### TFM 与 OS 检测

```xml
Condition="'$([MSBuild]::GetTargetFrameworkIdentifier('$(TargetFramework)'))' == '.NETCoreApp'"
Condition="$([MSBuild]::IsTargetFrameworkCompatible('$(TargetFramework)', 'net472'))"
Condition="$([MSBuild]::IsOSPlatform('windows'))"
Condition="$([MSBuild]::AreFeaturesEnabled('17.10'))"  <!-- 按 MSBuild 版本门控 -->
```

> 警告：单 TFM 工程在 `.props` 求值时 `$(TargetFramework)` 为空——TFM 条件属性组放 `.targets` 或工程文件本体。

### 守卫属性与兜底链

```xml
<!-- 文件尾部置守卫，防双重导入 -->
<MySDKPropsImported>true</MySDKPropsImported>
<!-- 另一文件头部按守卫导入 -->
<Import Project="MySDK.props" Condition="'$(MySDKPropsImported)' != 'true'" />
```
兜底链：先主来源赋值，再 `Condition="'$(X)' == ''"` 赋备选值。

常见坑：条件不加引号（空值时解析失败）；覆盖 `DefineConstants` 丢历史值；硬编码绝对路径；默认值忘加 `Condition="'$(Prop)' == ''"` 导致不可覆盖。

## 4. 扩展点与导入发现（源：extension-points）

### CustomBefore/CustomAfter 钩子

每个主要 `.targets` 定义 `$(CustomBeforeMicrosoftCommonTargets)` / `$(CustomAfter...)` 导入钩子，默认路径含版本号支持并行安装；导入必须带 `Exists()` 检查；多个钩子用 `;` **追加**而不是覆盖。

### 通配符导入目录与控制属性

按字母序导入扩展目录内所有文件（用 `01-`、`02-` 数字前缀控制顺序）。关键路径：`$(MSBuildUserExtensionsPath)`（%APPDATA%\Microsoft\MSBuild，用户级）、`$(MSBuildExtensionsPath)`（机器级）、`$(MSBuildProjectExtensionsPath)`（obj/，NuGet 生成物）。

| 控制属性 | 关掉什么 |
|---|---|
| `ImportDirectoryBuildProps` / `ImportDirectoryBuildTargets` | Directory.Build.* 自动发现 |
| `ImportProjectExtensionProps` / `ImportProjectExtensionTargets` | obj/ 中 NuGet 生成的 props/targets |
| `ImportByWildcardBefore*` / `ImportByWildcardAfter*` | 机器级扩展 |

### NuGet 包构建扩展布局

```
MyPackage/build/MyPackage.props|targets          ← 仅直接消费者
MyPackage/buildTransitive/MyPackage.props|targets ← 整条依赖链
```
- 文件名必须与包 ID 完全一致，否则静默跳过导入。
- props 早导入（工程前），targets 晚导入（工程后）。
- 转发链走 `buildTransitive → build → 共享文件`，不要直接指向 `buildMultiTargeting/`。
- `build/` 按 TFM 打包而 `buildTransitive/<tfm>/` 转发器**必须带 TFM 段**（从文件自身目录推导，绝不能用 `$(TargetFramework)`——nearest-match 可能给 net10.0 消费者选 net9.0 目录），否则 `MSB4019`：
  `<Import Project="$(MSBuildThisFileDirectory)..\..\build\$([System.IO.Path]::GetFileName($([System.IO.Path]::GetDirectoryName('$(MSBuildThisFileDirectory)'))))\MyPackage.props" />`

### 源码树 vs 打包布局（评审必读）

仓库源码布局可与 .nupkg 内布局合法不同（pack 时由 `.nuspec <file target=…>`、`<PackagePath>` 元数据、SDK 约定三种机制重排）。**判定 `build/<tfm>/` 内无守卫 Import 是否缺失文件前**：1) 查工程目录及其直接父目录的 `*.nuspec` 的 `<file target=…>`；2) 查 `.csproj` 的 `<PackagePath>`；3) 只有源码树与投影包布局都缺失才报告。包内 `build/`、`buildTransitive/` 的导入是包契约，不加 Exists 守卫也不应标记。

### Directory.Build 发现与自建扩展点

只发现**最近**的一个 `Directory.Build.props`；嵌套层级须在内部文件顶部显式 `GetPathOfFileAbove` 导入父级。自建扩展点套路：守卫导入自身 `.props` → `CustomBefore/CustomAfter` + `Exists()` 导入 → `$(XxxDependsOn)` 三段链 + 空 Before/After 钩子。

常见坑：可选导入缺 `Exists()`；覆盖 Custom* 属性丢既有钩子；包文件名与 ID 不符；嵌套 Directory.Build.props 不导入父级丢仓库级设置。

## 5. 生成文件纳入构建（源：including-generated-files）

根因：glob 在**求值阶段**展开，构建中生成的文件当时不存在，因此默认 `**/*.cs` glob 收不到它们。

核心配方——在生成文件的目标内手动注册：

```xml
<Target Name="IncludeGeneratedSourceFiles" BeforeTargets="CoreCompile;BeforeCompile">
  <ItemGroup>
    <Compile Include="$(GeneratedFilePath)" />
    <FileWrites Include="$(GeneratedFilePath)" />
  </ItemGroup>
</Target>
```

时机选择：
- 生成 `.cs` 源码 → `BeforeTargets="CoreCompile;BeforeCompile"`（取两者中先执行者，鲁棒）。
- 非代码文件进 `None`/`Content` 并复制到输出 → `BeforeTargets="BeforeBuild"`；太早则退到 `BeforeTargets="AssignTargetPaths"`（None/Content 转换前的"最后一站"）。

规则：生成目录一律 `$(IntermediateOutputPath)`（不要硬编码 `obj\` 或手工拼路径，CI 可能重定向）；每个生成文件加 `FileWrites` 保证 clean 删除；目标内 glob 可捕获生成文件，目标外 glob 只能看到求值期文件。

## 6. Directory.Build.* 组织（源：directory-build-organization）

### 求值顺序与放置

`Microsoft.Common.props` 早导入 `Directory.Build.props` → 工程体与包导入 → `Microsoft.Common.targets` 晚导入 `Directory.Build.targets`。

| `.props` 放 | `.targets` 放 |
|---|---|
| 属性默认值（可被工程覆盖） | 自定义目标 |
| 公共项定义 | 依赖 SDK 属性的晚期绑定值（OutputPath 等） |
| 程序集/包元数据、分析器引用 | 构建后校验、对最终值的条件逻辑 |

⚠️ 单 TFM 工程的属性条件依赖 `$(TargetFramework)` 在 `.props` 中静默失效（ItemGroup/Target 条件不受影响）→ 移到 `.targets`。

### 各文件要点

- `Directory.Build.props`：Nullable、ImplicitUsings、TreatWarningsAsErrors、Company/Authors 等。不放：工程专属 TFM/包引用、构建逻辑、依赖 SDK 值的属性。
- `Directory.Build.targets`：校验目标、晚期属性（如依赖 OutputPath 的 DocumentationFile）。
- `Directory.Packages.props`：`<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>` + `PackageVersion` 列表 + `GlobalPackageReference`（对所有工程生效，适合分析器）。
- `Directory.Build.rsp`：每行一个默认 CLI 参数（`/maxcpucount`、`/nodeReuse:false`、`/consoleLoggerParameters:Summary;ForceNoAlign` 等），msbuild 与 dotnet CLI 均生效。
- 多层级：内层文件顶部 `GetPathOfFileAbove` 显式导入父级；常见布局 repo 根放全局、`src/` 放 IsPackable=true、`test/` 放 IsPackable=false。
- .NET 8+：`<ArtifactsPath>$(MSBuildThisFileDirectory)artifacts</ArtifactsPath>` 自动按项目名分离 bin/obj/publish，天然避免 bin/obj 冲突。

### 组织工作流

审计所有 csproj → 建根 `.props`（共享默认值）→ 建根 `.targets`（自定义目标/晚期属性）→ 建 `Directory.Packages.props` 并去掉工程内 Version → 搭 src/test 层级 → 精简 csproj 只留独有内容 → 验证：`dotnet restore <入口> && dotnet build <入口>`；用 `dotnet msbuild -pp:output.xml MyProject.csproj` 看合并后最终视图（诊断"属性在哪被设/最终值"的首选工具）。

排错速查：文件名大小写（Linux/macOS 严格匹配）；`.props` 值被工程覆盖→移 `.targets`；多层导入不生效→缺 GetPathOfFileAbove；SDK 值在 `.props` 为空→移 `.targets`；CPM 文件必须在工程目录或其上方且命名精确。

## 7. 旧工程现代化（源：msbuild-modernization）

> 边界：这是"把可用的旧式/非 SDK 工程转换为 SDK 风格"的迁移指南；评审既有构建 XML 走第 0 节的编写评审/`msbuild-diagnosis.md` 的反模式目录。

### 识别旧工程

`ToolsVersion` 属性、`Import $(MSBuildToolsPath)\Microsoft.CSharp.targets`、逐文件 `<Compile Include>`、`packages.config`、`Properties\AssemblyInfo.cs`；简单工程 csproj 超 50 行即疑似旧式。

### 迁移检查清单（7 步）

1. 根元素换成 `<Project Sdk="Microsoft.NET.Sdk">`，删 XML 声明、ToolsVersion、xmlns、首尾 Import。
2. `TargetFrameworkVersion` v4.7.2 → `TargetFramework` `net472`（v4.6.1→net461、v4.8→net48；升级 .NET 则 net6.0/net8.0）。
3. 删除全部显式 `<Compile>`/`<Content>` 列表（隐式 glob 接管）；仅保留需要特殊元数据或工程目录外的文件。
4. 删 `AssemblyInfo.cs`，改用工程属性（AssemblyTitle/Description/Company/Product/Copyright/Version）；要保留文件则 `<GenerateAssemblyInfo>false</GenerateAssemblyInfo>`。
5. `packages.config` → `<PackageReference>`（VS 右键迁移或手工）；删 app.config 的 `<runtime>` 绑定重定向节（SDK 自动生成）。
6. 删样板：默认 Configuration/Platform、ProjectGuid、标准 Debug/Release 组、`<Reference Include="System"/>` 等框架引用、`<None Include="packages.config"/>`；只保留与 SDK 默认不同者（如 `OutputType=Exe`）。
7. 启用现代特性：`Nullable=enable`、`ImplicitUsings=enable`。**避免 `LangVersion=latest`**（不同机器 SDK 导致语言版本漂移）；用 `global.json` 钉 SDK 或显式数值 `<LangVersion>12</LangVersion>`。

### 迁移常见问题

- 嵌入式资源在标准位置外：显式 `<EmbeddedResource Include="..\shared\Schemas\*.xsd" LinkBase="Schemas" />`。
- 多目标：`TargetFramework` → `TargetFrameworks`（复数）。
- WPF/WinForms：`<UseWPF>true</UseWPF>` / `<UseWindowsForms>true</UseWindowsForms>`（.NET 5+ 首选标准 SDK + 属性）。
- 测试工程：`IsPackable=false` + Microsoft.NET.Test.Sdk + 框架包。
- 版本集中化：见第 6 节 CPM 与 `nuget.md`。

### 工具

`try-convert`（自动首轮转换，`dotnet tool install -g try-convert`）、`upgrade-assistant`（含 API 变更的完整迁移）、VS 右键 packages.config 迁移。推荐顺序：try-convert 首轮 → 手工清理 → 构建修复 → 开现代特性 → 共享设置并入 Directory.Build.props。
