# dotnet new 模板引擎

蒸馏自源技能：template-discovery、template-comparison、template-instantiation、template-smart-defaults、template-authoring、template-validation。六节各对应一个源技能，按用户意图选节。

通用事实：`dotnet new` 各次调用走全局互斥——**串行执行**多条 `--help`/`--dry-run`，失败重试一次；模板参数名/选项因模板而异，**只报告当前模板 `--help` 实际输出的选项**，不从别的模板借 flag、不凭记忆填表。用户要求"不创建文件"时，给出的每条命令必须带 `--dry-run`。

## 1. 模板发现（源：template-discovery）

意图→模板速查（推荐类问题先答此表，CLI 失败也要给出答案；检查类问题必须先跑命令再答）：

| 意图 | 模板 | | 意图 | 模板 |
|---|---|---|---|---|
| web api/rest/minimal api | `webapi` | | console/cli | `console` |
| web app/razor pages | `webapp` | | worker/后台服务 | `worker` |
| mvc | `mvc` | | classlib/nuget 包 | `classlib` |
| blazor | `blazor`（server 版 `blazorserver`，wasm 版 `blazorwasm`） | | 测试 | `xunit`/`nunit`/`mstest` |
| grpc | `grpc` | | sln | `sln` |
| maui/移动 | `maui`（需 workload） | | wpf/winforms/winui3 | 同名（winui3 需包） |
| aspire | `aspire-starter`/`aspire`（需包） | | azure functions | `func`（需包） |
| orleans | `orleans`（需包） | | razorcomponent/razorclasslib | 同名 |
| gitignore/editorconfig/nugetconfig/globaljson | 同名 | | signalr | `webapi`/`webapp` |

关键词→参数：auth→`--auth Individual`；windows auth→`Windows`；entra id/azure ad→`SingleOrg`；controllers→`--use-controllers`；aot→`--aot`；net8/9/10→`--framework net8.0/9.0/10.0`；docker 选项各模板不同须 `--help` 确认。

命令序列：`dotnet new search <kw>`（含 NuGet.org）/ `dotnet new list [--language C# --type project] [kw]`（仅已装）→ `dotnet new <t> --help`（参数/默认/约束）→ `dotnet new <t> ... --dry-run`（文件预览，成功则保留全部实际路径、目录树呈现+关键文件一句用途）。用户要求同时查 NuGet → 两个搜索都跑，内置模板说"no install needed — ships with the SDK"，NuGet 结果从输出抄包 ID 给 `dotnet new install <id>`。映射到的 maui/winui3/aspire/func/orleans 不在 `dotnet new list` 时→用 search 找提供方包/workload 再推荐。

呈现：先给"Use `<template>` — 一句理由 + 可直接运行的命令"，再列参数取值、产物结构、前置条件。

## 2. 模板对比（源：template-comparison）

对每个模板**逐个**跑 `dotnet new <t> --help`，按用户决策维度（非表格大小）建对比表：参数（名/类型/默认/选项）、特性支持（auth/AOT/Docker/controllers/interactivity）、可用框架、classifications。模板未安装→报告缺失前置，未经批准不安装。未暴露的选项标 `Not exposed`，不猜。问"生成什么依赖"但不允许建项目→查已装模板包源 `.csproj`（`--help`/`--dry-run` 不显示包引用），不为查依赖建临时工程。

必须以一行 `Recommendation: <template> — 场景化理由（若 <条件> 选另一个）` 收尾，不留无结论的表。

常见对的默认判断（仅用于推荐语，表内证据仍须 `--help`）：JSON/REST 后端→`webapi`；离线无服务器→`blazorwasm`（说明 PWA/service worker 要求）；富交互表单且首响应要有用 HTML→`blazor` Server interactivity；长期后台处理→`worker`（Generic Host 生命周期/DI/优雅停机）；页面型 CRUD→`webapp`，预期大型应用/共享控制器逻辑→`mvc`。

## 3. 模板实例化（源：template-instantiation）

核心：**匹配工作区后尽快收手**——检测 CPM（向上找 `Directory.Packages.props`）与邻居 `.csproj` 的 TFM，两者都镜像到新工程；工作区发现的 TFM 视为显式选择，用 `--framework` 传入且不被 smart-defaults 覆盖，仅在功能冲突时偏离并说明。dry-run → 创建 → 一次 build 即够；状态相关命令严格串行（create 与 build 并行会假失败）。

| 情形 | 动作 |
|---|---|
| 独立简单工程 | 查所请求模板→精确路径创建→build |
| 有邻居工程 | 先读其 TFM，传匹配的 `--framework` |
| 发现 CPM | 创建带 `--no-restore`（模板支持时）→规范化包引用→restore/build 一次 |
| 多工程解决方案 | 逐个按最终路径创建→`dotnet add reference`→`dotnet sln add` 全部→解决方案级 build 一次 |
| 明确要 `.sln` | 查 `dotnet new sln --help`，支持则 `--format sln` |

不预测生成 TFM：用户与工作区都没给→查 `--help` 选项选一个（通常是文档默认）显式传入，创建后核对生成的 `.csproj`。

CPM 适配：创建前向上找 `Directory.Packages.props`；生成后删每个 `PackageReference` 的 `Version`，把版本并入中央 `PackageVersion`（保留无关既有条目）；模板默认版本过旧时**默认保留**（可复现性），仅用户要求才刷新——`dotnet list package --outdated` 确认、限制同 major（跨 major 须用户明确同意）、查 stable 用 NuGet V3 flat-container `index.json`，不擅自选 prerelease。

常用组合：`webapi --auth Individual --aot`、`webapi --use-controllers`、`blazor --interactivity Server`、`grpc/worker --aot`。包管理：`dotnet new install|uninstall <package-id>`。创建后验证：`dotnet build`；console 类简单模板顺带跑一次报告实际输出；CPM 适配后核对 props 条目。创建前输出一行决策：`Creating <t> at <path>; framework=<v> (<user|workspace|template>); CPM=<on|off>.`

## 4. 跨参数智能默认（源：template-smart-defaults）

规则只填空，**永不覆盖用户显式值**（工作区钉的 framework 算显式）：

| 规则 | 默认 | 理由 |
|---|---|---|
| 有 `--aot` 且 `--framework` 未设 | 模板选项中最新的 AOT 兼容框架 | Native AOT 需较新 TFM |
| `--auth` 非 None | **不传** `--no-https` | auth 流程需 HTTPS |
| 有 `--use-controllers` | 不再传 minimal-API 选项 | 两者互斥 |
| 建议命令但要求不写文件 | 追加 `--dry-run` | 命令本身须安全 |

`--aot` 只在 `--help` 列出的模板存在，先确认；没有 `--publish-aot` 模板 flag——发布期 AOT 用 MSBuild 属性 `PublishAot=true`。

必须输出两件套：A. "Defaults applied" 表（每参数一行：值、`Source = user|rule`、理由，显式保留与规则填补都列）；B. 一条最终 `dotnet new` 命令行，**只含实际传的 flag**（决定不传的保持沉默；用户显式要的 flag 即使等于默认值也照传，如 `--auth None`；布尔开关不带 `true`）。

## 5. 模板创作（源：template-authoring）

### 从现有工程 bootstrap

复制源工程到独立模板目录（除非用户要求就地改）→ 建 `.template.config/template.json`（`identity` 反 DNS、`name`、`shortName`、`sourceName`、`classifications`、`tags`）。**核心价值链——逐项从源 `.csproj` 携带**，遗漏须标 ⚠️+原因：SDK 类型（`Microsoft.NET.Sdk.Web` 等）；PackageReference 的 `PrivateAssets/IncludeAssets/ExcludeAssets`；`OutputType`/`TreatWarningsAsErrors`/`Nullable`/`LangVersion`；CPM 参与（有 `Directory.Packages.props` 时生成引用**不带 Version**，自包含模板须把 owning props 打进包且置于生成仓库根）；自定义 build props/targets 与 Directory.Build 约定；仓库约定（目录布局/命名/global.json）。用户要"给我内容"时完整 JSON 必须进最终回复，不停留在最小 stub。

### 结构硬规则（用精确 schema，不发明字段）

| 需求 | 正确写法 | 禁用 |
|---|---|---|
| csproj 内条件 XML | XML 注释指令 `<!--#if (database == "SqlServer") -->…<!--#endif -->` 包住完整元素 | 裸 `#if` 行（XML 直接坏掉） |
| restore 后操作 | `actionId: 210D431B-A78B-4D2F-B762-4ED3E3EA9025` + `primaryOutputs`（工程路径已知时首选），或 `args.files`（**按重命名前的源模板路径匹配**，如 `**/*.csproj`） | run-script 的 `executable` 字段 |
| 限 SDK 宿主 | `host` 约束 `args: [{ "hostname": "dotnetcli", "version": "[10.0.100,)" }]` | `dotnet-cli` 假 ID、`pattern`/`value` 字段、用 host version 表达"活动 SDK 版本" |
| 限活动 SDK 版本 | `sdk-version` 约束，args 用 NuGet 版本范围 | 机器特定的精确补丁号 |
| 打包模板 | pack 工程：`<PackageType>Template</PackageType>`+`IncludeBuildOutput=false`+`NoWarn NU5128`+`<Content Include="templates\**\*" Pack="true" PackagePath="content\"/>`，给完整工程文件不只目录树 | 只描述布局 |

pack 工程的 TargetFramework 只作用于内容包本身，不重定向 templates/ 内工程。

### 完善与本地测试

加参数（string/bool/choice+默认+描述）→ 条件内容 → post-actions（sln add/restore/脚本）→ constraints → classifications。创建类请求**必须**跑完整验证（看 template.json 不算证明）：

```bash
dotnet new install ./template/root
dotnet new mylib --name TestProject --dry-run
dotnet new mylib --name TestProject --output ./test-output
dotnet build ./test-output/TestProject
```

收尾清单：验证零错误；identity/shortName 唯一；参数全有描述与默认；install+dry-run+instantiate+build 全通过；条件内容各组合正确；XML 指令包在注释里且生成工程可解析。

## 6. 模板校验（源：template-validation）

对 `.template.config/template.json` 系统跑 8 类检查，输出=一行判决头（`❌ Not ready — N errors, M warnings` / `⚠️ Publishable but N warnings` / `✅ Ready to publish`）+ 单表（errors→warnings→suggestions 排序，列 Severity/Location/Issue/Fix），**每个 ERROR/WARNING 必须带具体修法**，结尾报总数。

**解析门**：先解析 JSON；语法错→只报 line:col+最小修正片段并停止，绝不从解析失败的文档编造语义发现。

1. **必填字段**：`identity`/`name`/`shortName` 缺失=ERROR；`sourceName` 缺=WARNING（`--name` 不会改名）；`author` WARNING；`description`/`classifications`/`defaultName` SUGGESTION。
2. **identity 格式**：含空格=ERROR（用点/短横）；无命名空间分隔符=WARNING。
3. **shortName 冲突**：与 `dotnet new --help` `Commands:` 节实际列出的子命令同名=ERROR（大小写不敏感；示例 install/uninstall/update/list/search/details/create——**版本可变，读实时输出勿硬编码**；顶层 `dotnet` 动词 build/run/test/publish 不冲突）；单字符=WARNING；string 或数组都要查。
4. **symbols**：缺 `type`=ERROR。parameter：缺 `datatype`=WARNING（默认 string）、缺 `description`=SUGGESTION；choice 缺/空 `choices` 或 `defaultValue` 不在选项内=ERROR、可选且无默认=WARNING；bool/int 的 defaultValue 非法=ERROR；datatype 有效集 `string,bool,choice,int,float,hex,text` 之外=ERROR。computed 缺 `value`=ERROR；generated 缺 `generator`=ERROR，有效 generator：`casing,coalesce,constant,port,guid,now,random,regex,regexMatch,switch,join`。参数名互为前缀（`Auth`/`AuthMode`）=WARNING（表达式解析歧义）。自定义参数帮助出现在 `dotnet new <shortName> --help` 而非全局 help。
5. **sources 条件**：条件串中符号名不带括号（应为 `(symbolName)`）=WARNING。
6. **post-actions**：缺 `actionId`=ERROR；缺 `description`=WARNING；缺 `manualInstructions`=SUGGESTION。
7. **constraints**：缺 `type`=ERROR；缺 `args`=WARNING（host 缺 args=ERROR）。host：args 为数组、每项需 `hostname`（内置：`dotnetcli`,`vs`,`vs-mac`,`ide`,`dotnetcli-preview`；`hostName` 大小写不敏感亦接受）、可选 `version` 用 NuGet 范围语法；`pattern`/`value` 等无关字段=拒绝。`sdk-version`：args 为版本串/数组同语法。
8. **tags**：缺 `tags.language`/`tags.type`=SUGGESTION（影响 list 过滤/分类）。

典型静默故障：shortName="list"→模板永远无法创建；缺 sourceName→`--name` 无效；choice 无默认→体验混乱；非法 datatype→符号被忽略；computed 无 value→实例化抛错；解析失败后继续语义校验→结论全是臆测。
