---
name: generative-visual-art
description: "生成式视觉艺术合集（canvas-design + algorithmic-art + slack-gif-creator 合并版）：海报与静态艺术品（设计哲学→画布表达，输出 PNG/PDF）、算法艺术/生成艺术（p5.js 种子随机 + 交互式参数探索）、Slack 优化动图（GIF 构建/校验工具链）。触发词：海报、画布设计、算法艺术、生成艺术、GIF、canvas、algorithmic art、generative art、动图、视觉艺术。边界：不用于网页 UI 与界面设计（用 web-visual-design）、不用于 Office 文档（用 office-docs）；一律原创，不复制既有艺术家作品。"
---

# Generative Visual Art — 画布设计 / 算法艺术 / Slack GIF

按产物类型路由，动手前读对应 `references/<子技能>.md` 全文。附属资源在本技能根目录：`canvas-fonts/`（画布字体库）、`templates/`（算法艺术 HTML/JS 模板）、`core/`（GIF 工具模块）、`requirements.txt`。

## 一、画布设计（全文见 `references/canvas-design.md`）

海报/静态艺术品，输出 .md（哲学）+ .pdf/.png（作品）：

1. **设计哲学**：为一次"艺术运动"写宣言（4–6 段），命名运动（1–2 词），只谈空间/色彩/尺度/构图/层级的视觉表达，反复强调"大师级匠心、仿佛耗费无数小时打磨"，留诠释空间。
2. **推断隐性参照**：把用户主题作为微妙的概念线索织入形式与色彩，内行能感到、外行只见杰作，不点破。
3. **画布表达**：单页、90% 视觉 10% 必要文字；重复图案与精确形状；密集累积的标记/分层图案如科学观测文档；文字绝不溢出、绝不重叠、留足呼吸；文字要写时到 `canvas-fonts/` 找字体，把字体本身当作艺术的一部分。
4. **最后一步（必做）**：不加新图形，只打磨现有构图使其更锐利、更凝聚；输出成品 + 哲学 .md。多页时同风格不同变体成组。

## 二、算法艺术（全文见 `references/algorithmic-art.md`）

p5.js 生成艺术，输出 .md（哲学）+ 单个自包含交互 .html：

1. **算法哲学**：写生成美学宣言（4–6 段）——过程/涌现/种子随机为美，美学活在算法执行而非静态画面。
2. **概念种子**：同画布设计，主题以微妙方式编码进参数与行为。
3. **实现**：**必须先用 Read 读 `templates/viewer.html` 并以其为起点**（FIXED：布局结构、Anthropic 品牌样式、Seed 导航、Regenerate/Reset/Download 按钮；VARIABLE：p5.js 算法、参数对象、参数控件、可选颜色区）。`randomSeed`/`noiseSeed` 保证同种子同输出；除 p5.js CDN 外全部内联，单文件可直接在浏览器/artifact 运行。代码组织原则见 `templates/generator_template.js`。
4. **变体探索**：默认带 seed 导航；可按需生成 100 个 seed 变体或画廊模式。

## 三、Slack GIF（全文见 `references/slack-gif-creator.md`）

工具链在 `core/`（依赖 `pip install pillow imageio numpy`，见 `requirements.txt`）：

- **规格**：emoji 128×128（推荐）、消息 GIF 480×480；FPS 10–30、色数 48–128、emoji 时长 <3s。
- **流程**：`GIFBuilder(w,h,fps)` 逐帧用 PIL 图元生成 → `builder.save(out, num_colors, optimize_for_emoji, remove_duplicates)`；`core.validators` 校验是否达标；`core.easing.interpolate` 做缓动（linear/ease_*/bounce_out/elastic_out/back_out）；`core.frame_composer` 提供渐变背景/圆/星/文字辅助。
- **画质**：线宽 ≥2、加渐变与层次、形状做细节（高光/环/组合），禁 emoji 字体渲染；用户上传图先用 PIL 判断"直接动画化"还是"取灵感"。
- **优化**：仅在用户要求减体积时降帧/降色/缩小/去重。

## 许可
三个原始技能 LICENSE 见 `LICENSES/`。
