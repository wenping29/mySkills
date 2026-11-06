# NuGet：CPM 转换与可信发布

蒸馏自源技能：convert-to-cpm、nuget-trusted-publishing。

## 1. 转换为中央包管理 CPM（源：convert-to-cpm）

把包版本集中到 `Directory.Packages.props`，保持行为并产出可评审的前后证据。

### 先选模式

1. **Guard 模式**：范围内任一工程仍用 `packages.config` → 停止，说明 CPM 要求 PackageReference，建议先迁移（见 msbuild-authoring.md 第 7 节），不创建/修改文件。
2. **包维护模式**：用户要"升级/对齐/同步某包版本"——授权的是包编辑而非 CPM 转换。审计范围、解析版本、在现有位置改版本声明、从确立 `global.json` 的目录 restore/build 受影响目标；不建 Directory.Packages.props、不删 Version、不采集转换工件。完成后可推荐 CPM 作为长期方案。
3. **转换模式**：仅当用户明确要求采用/启用/转换 CPM 时走下面的工作流。范围不清只问一次。

### 转换工作流

**① 范围与预检**：解析工程/解决方案范围，显式覆盖全部目标（每个 `.sln`/`.slnx` + 不在任何解决方案内的工程），重叠处去重。CPM 管理范围独立于 CLI 目标确定：共享一套版本策略的工程组，在其最近公共祖先放一个 `Directory.Packages.props`（尊重已有最近文件边界；多个 CLI 目标可共用一个文件）。检查 packages.config（→Guard 停）；检查范围内及祖先是否已有 CPM（已全量启用→报告并停；部分存在→保留，仅在范围含糊时问）。选定一个公共工件目录存 binlog/包快照/报告。.NET 命令必须在确立其 `global.json` 的目录运行，不在无关父目录。

**② 采集基线**：每个目标先确定生效 SDK 一次并选对命令语法；SDK 解析失败→报告前提并停，不改宿主 SDK 或仓库策略。一批命令完成：clean+restore+build（`baseline[-<target>].binlog`）→ 不再度 restore 直接导出解析包清单（`baseline-packages[-<target>].json`）→ 控制台输出保持精简、失败只看错误行、**绝不把 binlog 当文本读**。任一基线失败→停止且不改文件，保留已产出工件。

**③ 定向审计**：基线快照 + 一次扫描工程/.props/.targets，找出：包 ID/解析版本/消费工程、版本冲突、基于 MSBuild 属性的版本、条件 PackageReference、含包引用的导入文件、既有 `VersionOverride`。复杂范围要全部工程全部条目查完，不是找到第一个冲突就停。默认不跑宽泛 `--outdated/--deprecated`；仅当用户要安全信息/需核实已知公告/冲突解法跨大版本时跑一次范围内 `--vulnerable --include-transitive`，记录发现/"无公告"/无法运行的原因；认证或离线导致高危检查不可用→明示不确定并确认策略。呈现冲突：大版本对齐=高风险，小版本/补丁=中风险（无需额外在线扫描即可分级）。用户没给冲突策略（如"取最高版本"）→编辑前停下询问。转换中不把包升到超出范围内已有最高版本。

**④ 建 CPM 文件并改引用**：每个管理范围建/更新 `Directory.Packages.props`（`ManagePackageVersionsCentrally=true`），每包一条按字母排序的 `PackageVersion`，保留必需的 TFM 条件；只删受管 `PackageReference` 的 `Version`，保留条件、空白与其余元数据（PrivateAssets/IncludeAssets/ExcludeAssets/GeneratePathProperty/Aliases）；仅策略需要时用 `VersionOverride`。MSBuild 属性版本：按用户指示内联为字面量 PackageVersion 并删旧属性定义，同一批改完；最终验证前分别确认 1) 范围内无残留 `$(PropertyName)` 引用；2) 无残留 `<PropertyName>` XML 定义——两种检查相互独立。

**⑤ 验证与对比**：全部编辑后一批命令：clean+restore+build（`after-cpm[-<target>].binlog`）→ 导出包清单（`after-cpm-packages[-<target>].json`）→ 逐工程紧凑对比（变化/未变），不打印完整 JSON。解析版本有变且仓库有现成范围内测试命令→`--no-build --no-restore` 跑一次并记录；需大量基建的测试只推荐命令。版本中性转换不强制自动跑测试。CPM 相关错误→只看相关错误行、定点修正、重跑受影响验证；SDK/认证/源/文件锁等环境故障→报告阻塞点而不是改机器。构建成功但测试失败→只判断是否 CPM 包解析所致，证据明确才定点修，否则记录失败与建议。

**⑥ 报告**：最后写 `convert-to-cpm.md`（工件旁），含：每个显式目标与管理范围、具体冲突影响、聚合包对比、风险级别、后续事项、工件用法、检查/改动过的每个共享 `.props/.targets` 文件名。最终回复提及共享文件、风险级别、条件引用与 TFM 如何保留。

必备工件（非临时文件）：每目标 4 件（baseline binlog、after-cpm binlog、两份 packages.json）+ 1 份聚合报告。

效率与禁区：批量独立读写；完整日志/JSON 不进对话；转换模式不装/卸 SDK、不建临时 SDK 选择器、不改 roll-forward、不调 SDK 内部程序集、不杀无关进程；不重复成功命令。

验证清单：基线与转换后构建全部成功且 binlog 齐；受管 PackageReference 无 Version（或有意的 VersionOverride）；每包有正确中央 PackageVersion；条件与元数据保留；前后对比无未解释变化；内联属性无残留引用与定义；报告与全部工件存在。

## 2. NuGet 可信发布 OIDC（源：nuget-trusted-publishing）

GitHub Actions 仓库用 OIDC 短时令牌替代长期 API key 发布到 nuget.org。仅限 GitHub Actions + nuget.org（私有源/Azure Artifacts 不适用）。

安全规则：任何阶段在基建/认证问题上修一次仍失败→停下问用户，不循环；删除/覆盖前必须确认——删 API key secret、删 tag/release、改包 ID 都是单向门（**NuGet 包 ID 永久不可改**）。

### 四阶段

**Phase 1 评估**（先报告再动手）：
1. 找并分类可打包工程——查 `.csproj` **和 `Directory.Build.props`**（元数据常仓库级设置），按优先序：`PackageType=Template`→模板；`PackageType=McpServer`→MCP 服务器（也是 dotnet tool）；`PackAsTool=true`→dotnet 工具；类库（IsPackable=true 或无 OutputType）→库；`Exe+IsPackable=true`→应用包；`Exe` 无 PackAsTool/IsPackable→默认不可发布（问用户）。
2. 结构校验：所有类型需 `PackageId`、`Version`；工具需 `PackAsTool`（`ToolCommandName` 建议）；MCP 需 `PackageType=McpServer` + 包内含 `.mcp/server.json`；模板需 `PackageType=Template` + 内容目录下 `.template.config/template.json`。
3. 找现有发布工作流（`dotnet nuget push`/`nuget push`/`dotnet pack`）。
4. MCP 服务器核对 `.csproj` Version 与 server.json 两处版本字段一致。
5. 报告发现，多工程说明单/多工作流；改工程文件前先征求同意。

**Phase 2 本地验证**（首次发布前必须提及）：`dotnet pack -c Release -o ./artifacts` 验证 .nupkg；工具/MCP 从 artifacts 安装→`--help`→卸载；库则解包检查内容。发布错误会烧掉一个永久版本号。

**Phase 3 nuget.org 策略**（需用户操作，给精确值）：确定 repo owner、repo 名、发布**工作流文件名**（只要文件名如 `publish.yml`，无路径前缀，大小写不敏感；不是工作流内 `name:` 字段）。引导到 nuget.org/account/trustedpublishing → Add policy：Owner/Repository/Workflow File/Environment（仅工作流用了 `environment:` 才填）。策略归个人账户或组织（组织策略覆盖其全部包）。私有仓库策略"临时激活"7 天，首次成功发布后转正。可选推荐 GitHub Environment `release` + 环境 secret `NUGET_USER`=nuget.org 用户名（不是邮箱），可加 Required reviewers 审批门。**用户确认策略已建之前，不得引导删除旧 API key 或实际运行发布**（展示/起草工作流文件可以）。

**Phase 4 工作流**：新建用模板（tag 触发），必须含 `id-token: write` 与 `NuGet/login@v1`；迁移就地改三处：

```yaml
jobs:
  publish:
    environment: release
    permissions:
      id-token: write     # 缺它 NuGet/login 403
      contents: read      # 显式——设 permissions 会覆盖默认
# 步骤：
- name: NuGet login (OIDC)
  id: login
  uses: NuGet/login@v1
  with:
    user: ${{ secrets.NUGET_USER }}
# push 步骤改用：
  --api-key ${{ steps.login.outputs.NUGET_API_KEY }} --skip-duplicate
```

验证发布出现在 nuget.org 后才删旧 API key secret。

### 排障速查

| 问题 | 原因 | 修复 |
|---|---|---|
| NuGet/login 403 | 缺 `id-token: write` | 加到 job permissions |
| no matching policy | 工作流文件名不符 | 核对 nuget.org 上的精确文件名 |
| Push unauthorized | 包不属于策略账户 | 查 nuget.org 策略所有者 |
| Token expired | login 与 push 间隔>1h | NuGet/login 挪近 push |
| temporarily active | 私有仓库首发布未完成 | 7 天内发布 |
| already_exists | 重发同版本 | `--skip-duplicate` |
| Release 422 | tag 已有 release | 确认后删冲突 release |
| 重跑用错 YAML | `gh run rerun` 重放原提交 YAML | 清障碍后重跑，永不重打 tag |
