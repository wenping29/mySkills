---
name: visual-documentation
description: 生成自包含的单文件 HTML 可视化文档，支持五种模式：架构图、流程图、时间线、仪表盘、技术文档。当用户请求架构图(architecture diagram)、系统架构文档、流程图(flowchart)、流程/决策图、时间线(timeline)、甘特图、路线图、项目排期、仪表盘(dashboard)、KPI/数据图表、监控界面，或 technical doc、HTML diagram、API 文档时使用。不用于：品牌宣传物料或 Office 文档（转 office-docs）；纯文字教程（转 tech-tutorial-writer）。
---

# Visual Documentation（可视化文档）

将五种 HTML 可视化文档模式合并为一个技能：架构图 / 流程图 / 时间线 / 仪表盘 / 技术文档。所有产出均为单文件 HTML（内联 CSS + SVG），可直接在浏览器打开。

## 模式路由

| 用户意图 | 模式 | 基础模板 | 组件模板 |
|---|---|---|---|
| 系统架构、项目总览、数据流+部署文档 | 架构图 | `assets/architecture_base_template.html` | `assets/architecture_components.html` |
| 流程、决策树、工作流可视化 | 流程图 | `assets/base_template.html` | `assets/flowchart_components.html` |
| 项目排期、路线图、甘特图、里程碑 | 时间线 | `assets/base_template.html` | `assets/timeline_components.html` |
| 指标看板、KPI、数据图表 | 仪表盘 | `assets/base_template.html` | `assets/dashboard_components.html` |
| API 文档、开发者文档、代码示例 | 技术文档 | `assets/base_template.html` | 无（模式说明见下） |

## 共享资产使用说明（统一约定）

- **基础模板**：复制对应模板文件，替换 `[DOCUMENT_TITLE]` / `[PROJECT_NAME]` 等占位符，在注释标记处填充内容区块。架构图使用独立模板，其余四种模式共用 `assets/base_template.html`。
- **组件模板**：`assets/*_components.html` 内含该模式的节点/卡片/图表 HTML+CSS 片段，按需摘取拼入正文。
- **设计系统**：`references/design_patterns.md` 定义配色（渐变背景 `#667eea→#764ba2`、语义色板）与布局模式，所有模式通用，只遵循一次。
- **SVG 库**：`references/svg_library.md` 提供箭头、节点、连线等 SVG 片段，绘图时优先复用。
- **语义色约定**：蓝 `#4299e1`（数据/进行中/POST）、橙 `#ed8936`/`#f59e0b`（处理/决策/警示）、绿 `#48bb78`（成功/完成/GET）、红 `#e53e3e`（失败/删除）、灰 `#718096`（计划）、紫 `#9f7aea`（AI）。

## 模式工作流

### 1. 架构图（architecture）

完整示例参考 `references/example_architecture.html`。

1. 分析项目（README、代码结构），提取目的、数据源、处理逻辑、技术栈、输出。
2. 基于 `assets/architecture_base_template.html` 创建六个区块：业务背景（目标/用户/价值/指标）、数据流（SVG：源→处理→输出）、处理流水线（多阶段可视化）、系统架构分层（数据/处理/服务/输出）、功能特性（功能性+非功能性）、部署（模式/前置/流程）。
3. 数据流 SVG 按左（蓝·数据源）中（橙·处理）右（绿·输出）布局，箭头用 `marker-end` 连接。
4. 输出 `[project]-architecture.html`。

### 2. 流程图（flowchart）

1. 将流程拆解为步骤，识别决策点。
2. 节点类型：开始/结束（圆角矩形，绿/红）、处理（矩形，蓝）、决策（菱形，橙）、箭头连线带分支标签、可选泳道分组。组件片段见 `assets/flowchart_components.html`。
3. 垂直或水平布局，节点间距保持约 100px。
4. 输出 `[process]-flowchart.html`。

### 3. 时间线（timeline）

1. 从项目提取任务、起止日期、阶段。
2. 计算时长百分比，按阶段分组（季度或自定义）。
3. 结构：时间线头部（项目名/日期范围/完成度）→ 各阶段甘特横条 → 里程碑列表（红色左边框标记）。状态色：绿=完成、蓝=进行中、灰=计划。组件片段见 `assets/timeline_components.html`。
4. 输出 `[project]-timeline.html`，保持响应式布局。

### 4. 仪表盘（dashboard）

1. 提取指标与数据。
2. 结构：KPI 卡片网格（指标名/数值/变化百分比/趋势箭头，涨绿跌红）→ SVG 柱状/饼/折线图 → 进度条 → 数据表格。组件片段见 `assets/dashboard_components.html`。
3. 语义色：绿（正向）、红（负向）、蓝（中性）。
4. 输出 `[name]-dashboard.html`。

### 5. 技术文档（technical-doc）

无独立组件模板，直接按下列片段模式编写：

1. 提取 API 端点、方法、参数。
2. 区块：概览（用途/特性/技术栈）、快速开始（安装/配置/上手）、API 参考、代码示例、架构图（可选，复用模式 1 的 SVG 画法）、工作流。
3. **端点卡片模式**：`<div class="endpoint">` 左边框蓝色高亮，内含 `<h3>` 方法+路径（方法按语义着色：GET 绿、POST 蓝、DELETE 红）、描述、Request/Response 代码块。
4. **代码块模式**：`<pre><code>` 深色背景 `#1e1e1e` / 文字 `#d4d4d4`，横向可滚动；行内代码浅灰底圆角。
5. 输出 `[system]-docs.html`。

## 通用要求

- 单文件自包含：不引用外部 CSS/JS/图片；字体用 system-ui 族。
- 使用真实项目数据，不编造指标。
- 同一文档内配色、间距、圆角风格保持一致。
