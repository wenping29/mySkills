# Skills 工作区总览

34 个可复用 skill。2026-11-05 第一批合并去重：原 6 个重构族 skill 合并为 `code-quality`，原 4 个社媒采集 skill 合并为 `social-collect`。同日第二批迁入 `D:\skills\skillsets` 剩余 3 个 skillset（engineering-workflow 17 技能、design-and-docs 19 技能、dotnet 107 技能），合并/蒸馏为 19 个新 skill 并并入 2 个现有 skill。2026-11-06 第三批语言统一：6 个全英文 skill 的 SKILL.md 入口已全部译为中文，全库入口文档无纯英文文件。全部 skill 通过 description 划清触发边界，避免冲突。

> 各 skill 的触发语示例、调用方式与组合流程详见 [使用指南.md](使用指南.md)。

## 技能清单与触发边界

### 编程开发族

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [dev-expert](dev-expert/SKILL.md) | 端到端全栈交付闭环（分析→方案→执行→验证→交付→复盘），Java/PHP/C#、CMS、MySQL | 专项重构 → code-quality；专项测试 → tech-test-automation |
| [code-quality](code-quality/SKILL.md) | 重构、简化、清理代码、代码评审、DDD 分析、架构设计、技术债评估（六步串联，可单步切入）；第二批并入快审/小步重构入口（quick-audit / quick-refactor） | 端到端需求交付 → dev-expert；二进制逆向 → reverse-engineer-anything；.NET 专属迁移 → dotnet-* |
| [tech-test-automation](tech-test-automation/skillsets/tech-test-automation.md) | TDD、测试用例生成、E2E（Playwright/Cypress）、API 测试、QA 测试计划；第二批并入 test-fixing（修既有失败测试）与 webapp-testing（本地 Playwright）（元 skill，子技能 zip 在同目录 `skills/`） | .NET 专属测试框架/迁移 → dotnet-test |
| [git-pushing](git-pushing/SKILL.md) | 仅 commit / push 工作流 | 仓库分析、技术债审计 → code-quality |
| [plan-workflow](plan-workflow/SKILL.md) | 功能规划→实施、PR 审查意见落地、多方案 ensemble 求解（含 agents/ 与 commands/pr.md） | 端到端交付 → dev-expert；通用 PRD → prd-writer |
| [project-toolkit](project-toolkit/SKILL.md) | 仓库文档化、对话历史分析、新项目脚手架 | 教程写作 → tech-tutorial-writer；HTML 图表文档 → visual-documentation |
| [code-operations](code-operations/SKILL.md) | 批量代码执行/审计、代码转换、文件操作；含 execution-runtime（Python API + FastMCP server） | 深度分析/技术债 → code-quality |
| [reverse-engineer-anything](reverse-engineer-anything/SKILL.md) | 对发布产物/安装包/固件做逆向与运行时取证 | 普通源码架构分析 → code-quality |

### .NET 技术栈族（第二批，107 个官方 dotnet/skills 蒸馏为 5 个大技能）

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [dotnet-dev](dotnet-dev/SKILL.md) | C# 语言专家、csharp 重构、P/Invoke、向量化、Web API、EF Core 查询优化、技术选型 | 语言无关深度重构/架构 → code-quality；端到端交付 → dev-expert |
| [dotnet-ui](dotnet-ui/SKILL.md) | Blazor（11 场景）、MAUI（8 场景）、WinForms 组件与交互实现 | 纯视觉风格/配色/品牌 → web-visual-design |
| [dotnet-build](dotnet-build/SKILL.md) | MSBuild 编写/性能/诊断（binlog）、NuGet CPM 与 trusted publishing、SDK 安装、dotnet new 模板 | 语言开发 → dotnet-dev；测试 → dotnet-test |
| [dotnet-test](dotnet-test/SKILL.md) | .NET 测试编写、覆盖率/CRAP 分析、可测性改造、MSTest/xUnit/NUnit/VSTest→MTP 框架迁移 | 跨语言 TDD/E2E/API/QA → tech-test-automation |
| [dotnet-upgrade-diag](dotnet-upgrade-diag/SKILL.md) | .NET 版本升级、Native AOT/可空引用迁移、性能诊断（trace/dump/BDN）、崩溃符号化、net11 新 API | 构建性能/binlog → dotnet-build；测试框架迁移 → dotnet-test |

### 设计与文档生产族（第二批）

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [office-docs](office-docs/SKILL.md) | Word/PPT/Excel/PDF 生成与处理、文档协同撰写（docx/pptx/xlsx/pdf/doc-coauthoring 合并；Trae 内置 office-plugin 可替代，本技能为独立可移植版） | 工程图表/仪表盘 → visual-documentation |
| [visual-documentation](visual-documentation/SKILL.md) | 架构图/流程图/时间线/仪表盘/技术文档 HTML（5 个图表技能合并，共享模板去重） | 品牌/Office 文档 → office-docs；纯教程 → tech-tutorial-writer |
| [web-visual-design](web-visual-design/SKILL.md) | 前端视觉方向、主题配色、品牌规范（frontend-design/theme-factory/brand-guidelines 合并） | 功能交付 → dev-expert；Blazor/MAUI 实现 → dotnet-ui |
| [generative-visual-art](generative-visual-art/SKILL.md) | 海报/画布设计、算法艺术、Slack GIF（canvas-design/algorithmic-art/slack-gif-creator 合并） | 网页 UI → web-visual-design |
| [web-artifacts-builder](web-artifacts-builder/SKILL.md) | 多组件 React/Tailwind/shadcn HTML artifact 构建与单文件打包 | 简单单文件 HTML → 直接生成 |

### AI 扩展开发族（第二批）

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [claude-api](claude-api/SKILL.md) | Claude/Anthropic SDK 多语言集成参考（模型 id、定价、流式、tool use、缓存、迁移） | 其他 provider（OpenAI/Gemini 等） |
| [mcp-builder](mcp-builder/SKILL.md) | 开发 MCP Server（Python FastMCP / Node MCP SDK） | 消费 MCP 工具 → 直接用 IDE 能力 |
| [skill-creator](skill-creator/SKILL.md) | 可移植场景的技能创建与 eval 优化流程 | Trae 环境内置同名 skill-creator 优先 |
| [internal-comms](internal-comms/SKILL.md) | 内部沟通写作（状态报告、3P update、newsletter、FAQ、事故通报） | 对外营销文案 |
| [academy-guide](academy-guide/SKILL.md) | 仅 Claude 产品学习/课程推荐场景 | 通用技术学习 → tech-tutorial-writer |
| [discernment-nudge](discernment-nudge/SKILL.md) | 对可被据以行动的回答追加 2-3 个核查问题（每会话至多一次） | 常规问答 |

### 文档写作族

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [prd-writer](prd-writer/SKILL.md) | 通用中文 PRD、需求评审、验收标准、RTM | 游戏立项/玩法/数值 → game-product-planning |
| [game-product-planning](game-product-planning/SKILL.md) | 仅游戏领域：立项、玩法拆解、游戏竞品、商业化与合规 | 通用 PRD → prd-writer |
| [tech-tutorial-writer](tech-tutorial-writer/SKILL.md) | 技术教程、培训材料、从零到实战文档 | — |
| [ai-daily-brief](ai-daily-brief/SKILL.md) | AI 日报/周报、情报简报、去重与事实核验 | Agent 产品对比 → ai-coding-agent-landscape |
| [ai-coding-agent-landscape](ai-coding-agent-landscape/SKILL.md) | AI 编程/办公 Agent 竞品拆解与选型对比报告 | — |
| [ming-novel-studio](ming-novel-studio/SKILL.md) | 明末历史小说设定、人物卡、时间线、伏笔 | — |

### 数据采集族

| Skill | 何时用 |
|-------|--------|
| [social-collect](social-collect/SKILL.md) | 统一 CLI 采集公开数据：`xhs-search`（小红书关键词）、`xhs-profile`（博主主页）、`bili-profile`（B站UP主投稿）、`dy-comments`（抖音评论·会话制），导出 CSV。入口 `node cli.js <平台命令> --help` |

### 专项工程族

| Skill | 何时用 | 不用于 |
|-------|--------|--------|
| [mv3-extension-dev](mv3-extension-dev/SKILL.md) | Chrome/Edge MV3 扩展、DNR 规则、上架 | — |
| [gjb5068-geodata](gjb5068-geodata/SKILL.md) | GJB 5068 矢量数据、GeoJSON/OSM 转换、GeoServer 发布 | — |
| [browser-skill](browser-skill/SKILL.md) | 仅当环境存在 `bsk` CLI / Agent Window 且显式要求 BrowserSkill 时 | 一般网页浏览/抓取/前端测试 → 内置 TRAE-browseruse |

## 安装

每个 skill 目录是独立单元，复制到任一 skill 搜索路径即可。目录名与 frontmatter `name` 保持一致（已去除版本后缀）。

```powershell
# 用户级
Copy-Item -Recurse -Force "d:\学习资料\skills\code-quality" "$env:USERPROFILE\.agents\skills\"
# 项目级
New-Item -ItemType Directory -Force -Path ".trae\skills" | Out-Null
Copy-Item -Recurse -Force "d:\学习资料\skills\prd-writer" ".trae\skills\"
```

按需逐个复制，避免把无关 skill 带进项目。

## 合并记录（2026-11-05）

- `code-analyzer` + `agent-git-oracle` + `code-refactoring` + `uncle-bob` + `system-architect` + `simplify` + `tech-code-refactoring` 工作流 → **code-quality**（references/scripts/assets 已随迁）。
- `xiaohs-search` + `xiaohs-profile` + `b-profile` + `dy-comments` → **social-collect**（统一 cli.js，四平台子命令，会话制与计费协议完整保留）。
- `dev-expert-2.2.3` → `dev-expert`；`browserskill-1.0.11` → `browser-skill`。
- dev-expert / prd-writer / game-product-planning / git-pushing / browser-skill 的 description 已加互斥边界说明。
- **重叠内容剥离**：code-quality 改为薄入口 + 六步细则按需加载（`references/step1~6-*.md`）；dev-expert 的 `refactoring.md` 坏味道对照表删除并指向 code-quality，`code-review.md`/`test-generation.md` 顶部加边界说明，`routing.md` 增加跨技能转交规则（纯重构/评审→code-quality，纯测试体系→tech-test-automation）。

## 合并记录（第二批，2026-11-05，源自 `D:\skills\skillsets`）

- **engineering-workflow 17 技能 → 4 新增 + 2 并入**：code-auditor/code-refactor → code-quality（quick-audit/quick-refactor 入口）；test-fixing → tech-test-automation；architecture/flowchart/timeline/dashboard/technical-doc 5 图表技能 → **visual-documentation**（4 份相同 base_template/design_patterns/svg_library 去重为一份）；code-execution/code-transfer/file-operations + execution-runtime → **code-operations**；feature-planning/review-implementing/ensemble-solving + agents/commands → **plan-workflow**；codebase-documenter/conversation-analyzer/project-bootstrapper → **project-toolkit**。`_upstream/` 元数据未迁移。
- **design-and-docs 19 技能 → 3 合并 + 7 独立 + 1 并入**：docx/pptx/xlsx/pdf/doc-coauthoring → **office-docs**（脚本按 `scripts/<格式>/` 组织）；frontend-design/theme-factory/brand-guidelines → **web-visual-design**；canvas-design/algorithmic-art/slack-gif-creator → **generative-visual-art**；webapp-testing → tech-test-automation；独立迁入 web-artifacts-builder、claude-api、mcp-builder、skill-creator、internal-comms、academy-guide、discernment-nudge；template-skill 未迁移。
- **dotnet 107 技能 → 5 蒸馏**：微软 dotnet/skills 仓库 plugins/ 全部技能按主题蒸馏为 **dotnet-dev**（9）、**dotnet-ui**（20）、**dotnet-build**（30）、**dotnet-test**（30）、**dotnet-upgrade-diag**（18），每个含触发词路由表 + 主题化 references；未复制 .github/eng/tests/experiment yaml 等工程噪音。
- **与 Trae 内置能力的边界**：office-docs vs 内置 office-plugin（本库为独立可移植版）；skill-creator vs 内置同名（Trae 环境内置优先）；browser-skill vs 内置 TRAE-browseruse（沿用第一批规则）。
- 源目录 `D:\skills\skillsets` 保持只读，未修改或删除。

## 翻译记录与语言规范（第三批，2026-11-06）

- **已译为中文的 6 个 SKILL.md 入口**：claude-api、reverse-engineer-anything、mcp-builder、discernment-nudge、web-artifacts-builder、internal-comms。附属 references/scripts/examples 按决策保留英文，按需查阅。
- **翻译规则**：frontmatter `name` 与目录名一致不动；`license` 保留原文；`description` 中文化但保留英文触发词（Claude、MCP、artifact 等专有名词原文），确保自动匹配不受影响；代码块、命令、文件路径、URL、示例一律不译不改；标题层级与段落顺序保持，不增删内容。
- **全库语言约定**：SKILL.md 入口正文以中文为主，技术术语可保留英文或"中文（English）"形式；新增/迁入 skill 若入口为纯英文，需按上述规则翻译后入库。

## 校验

```powershell
Get-ChildItem -Directory "d:\学习资料\skills" | ForEach-Object {
  $f = Join-Path $_.FullName "SKILL.md"
  if (-not (Test-Path $f)) { "{0,-28} MISSING SKILL.md" -f $_.Name; return }
  $text = Get-Content -Raw $f
  $name = [regex]::Match($text, '(?m)^name:\s*"?([^"\r\n]+)"?').Groups[1].Value.Trim()
  "{0,-28} name={1}" -f $_.Name, $name
}
```

预期：34 个 skill，`name` 与目录名一致（`tech-test-automation` 的入口为 `skillsets/` 下的工作流文档）。

语言扫描（入口不应为纯英文，预期无输出）：

```powershell
Get-ChildItem -Directory "d:\学习资料\skills" | Where-Object { $_.Name -notin @('.trae','.screenshots') } | ForEach-Object {
  $f = Join-Path $_.FullName "SKILL.md"
  if ((Test-Path $f) -and ((Get-Content $f -Raw -Encoding UTF8) -notmatch '[\u4e00-\u9fff]')) { "FULL-ENGLISH: $($_.Name)" }
}
```

## 蒸馏原则

1. 只提炼可复用方法、结构、检查清单，不复刻原始文档。
2. 不写入任何账号、密码、Token、密钥、身份证号、手机号、公司名、服务器地址。
3. 涉及军事、历史、合规、数据安全的内容，保留"需授权/需法务确认"的边界提示。
4. 示例数据用占位符，不引用真实业务数据。
5. 每个 skill 的 `description` 含中英文触发词与"不用于"边界，便于自动匹配且互不抢触发。
6. SKILL.md 入口以中文为主；迁入纯英文入口时按"翻译记录与语言规范"一节翻译，附属参考文档可保留英文。
