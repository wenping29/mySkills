---
name: web-visual-design
description: "网页/界面视觉设计合集（frontend-design + theme-factory + brand-guidelines 合并版）：有主张的视觉方向与反模板化设计、10 套预置主题配色字体（slides/docs/landing 等产物）、Anthropic 品牌规范套用。触发词：UI 设计、配色、品牌、主题、排版、frontend design、视觉风格、字体搭配、branding、theme。边界：不用于功能开发与端到端交付（用 dev-expert）、不用于 Blazor/MAUI 组件实现（用 dotnet-ui）、不用于海报/算法艺术/GIF（用 generative-visual-art）。"
---

# Web Visual Design — 视觉方向 / 主题配色 / 品牌规范

三个分支按需组合：定视觉方向（原创、反模板）→ 选或建主题（配色+字体）→ 套品牌规范。所有路径相对本技能根目录。

## 一、视觉方向（全文见 `references/frontend-design.md`）

以设计工作室设计总监的姿态做有意图、可辨识的设计：

- **先锚定主题**：明确产品/主题对象、受众与首要任务；独特的视觉选择来自对象的行业、材质与语汇。
- **两遍流程**：先出紧凑设计计划——Color（4–6 个命名色值）、Type（字体族与角色）、Layout（一句话描述 + ASCII 线框 + 对齐策略）、Principles（本页独特性的高层指引）；再对照 brief 自审，凡属"任何同类页面都会得到的通用默认"就修订，然后才写代码。
- **避开 AI 生成腔**：奶油底+高对比衬线+陶土色强调、近黑底+荧光点缀、报纸细线零圆角、千篇一律圆角卡片套件、ALL-CAPS eyebrow、中点连缀 meta、`WORD — fragment` 式标签、链接尾箭头等。
- **排版**：1–2 个字体族（两个则须明显不同）；行长 <80 字符；勿只强调标题中一个词、勿全大写标签、勿内容上方加多余排版标签。
- **动效克制**：一次性编排的入场优于散落各处的 fade-slide 与 hover 过渡；响应用户动作的动效欢迎。
- **大胆花在一处**：一个可记忆元素，其余安静守纪律；质量底线（响应式、键盘焦点、reduced motion、对比度）不声张地达到。
- **文案即设计内容**：用户视角命名、主动语态、CTA 说出结果且全程同名、错误给指引不道歉、空屏是邀请。

## 二、主题配色（theme-factory）

10 套预置主题（完整色板 + 标题/正文字体搭配）定义在 `themes/` 目录：Ocean Depths、Sunset Boulevard、Forest Canopy、Modern Minimalist、Golden Hour、Arctic Frost、Desert Rose、Tech Innovation、Botanical Garden、Midnight Galaxy。

使用流程：
1. 展示 `theme-showcase.pdf` 让用户目视挑选（勿改动该文件）。
2. 询问选择并等待明确确认。
3. 读对应 `themes/<主题名>.md`，把颜色与字体一致地套到 deck/页面等产物上，保持对比度与可读性。

都不合适时：按用户描述生成新主题（取一个描述字体/色彩气质的名字），展示确认后套用。

## 三、品牌规范（brand-guidelines）

Anthropic 官方品牌，适用于任何需要"Anthropic 外观"的产物：

- **主色**：Dark `#141413`（正文/深底）、Light `#faf9f5`（浅底/深底上的文字）、Mid Gray `#b0aea5`、Light Gray `#e8e6dc`。
- **强调色**：Orange `#d97757`（主）、Blue `#6a9bcc`、Green `#788c5d`——非文本形状按橙/蓝/绿循环使用。
- **字体**：标题 Poppins（24pt 及以上，回退 Arial），正文 Lora（回退 Georgia）；按背景深浅智能选字色，保持文字层级。

## 许可
三个原始技能 LICENSE 见 `LICENSES/`。
