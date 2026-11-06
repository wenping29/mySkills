---
name: office-docs
description: "Office 文档生成与处理合集（docx/pptx/xlsx/pdf/doc-coauthoring 合并版）：Word（.docx/.dotx）创建编辑与修订跟踪，PPT（.pptx/.potx）生成与模板编辑，Excel（.xlsx/.xlsm/.csv）公式与财务模型，PDF 读取/合并/拆分/表单/OCR，以及结构化协同撰写工作流。触发词：Word、PPT、Excel、PDF、docx、pptx、xlsx、文档生成、幻灯片、电子表格、表单填写、协同撰写、office documents。边界：不用于网页 UI 或 HTML 报告（用 web-visual-design）、不用于海报与生成艺术（用 generative-visual-art）、不用于飞书/Google Docs 等在线文档操作。Trae 内置 office-plugin 可替代本技能；本技能为独立可移植版本。"
---

# Office Docs — Word / PPT / Excel / PDF / 协同撰写

按目标格式路由，动手前先读对应 `references/<格式>.md` 全文。所有脚本与参考路径相对本技能根目录；各格式脚本在 `scripts/<格式>/` 下，互不共用。

## 路由表

| 用户意图 | 先读 | 脚本目录 |
|---|---|---|
| Word 文档（.docx/.dotx）创建/编辑/读取/修订/批注 | `references/docx.md` | `scripts/docx/` |
| 幻灯片（.pptx/.potx）创建/编辑/读文本/QA | `references/pptx.md` | `scripts/pptx/` |
| 电子表格（.xlsx/.xlsm/.csv/.tsv）读写与计算 | `references/xlsx.md` | `scripts/xlsx/` |
| PDF 读取/合并/拆分/生成/OCR | `references/pdf.md` | `scripts/pdf/` |
| PDF 填表单 | `references/pdf-forms.md`（先跑 `scripts/pdf/check_fillable_fields.py` 分流） | `scripts/pdf/` |
| PDF 高级用法（pypdfium2/pdf-lib）与排错 | `references/pdf-reference.md` | — |
| 协同撰写文档（PRD/决策文档/RFC/规格） | `references/coauthoring.md` | — |

## 各格式核心流程摘要（细则以 references 全文为准）

### Word（references/docx.md）
- 新建：写 `docx`（npm，预装）脚本；坑：默认 A4、表格需双宽度 DXA、列表用 numbering 配置、`ImageRun` 必带 `type`。
- 编辑：unzip → `scripts/docx/merge_runs.py` 合并碎片 run → 改 `word/document.xml` → zip → `scripts/docx/office/validate.py`（修订跟踪加 `--author`）。
- 修订接受：`scripts/docx/accept_changes.py`；批注：`scripts/docx/comment.py`（六文件交叉链接，需再放置正文标记）。
- 读取：`pandoc -t markdown`；交付前 soffice 转 PDF + pdftoppm 渲染目检。

### PPT（references/pptx.md）
- 新建：`pptxgenjs`（预装）脚本；坑：先设 `pres.layout`、颜色 6 位无 `#`、选项对象勿复用、堆叠图 dataLabelPosition 禁 outEnd。
- 模板编辑：`scripts/pptx/thumbnail.py` 选版式 → `scripts/pptx/add_slide.py` 复制页 → 改 `ppt/slides/slideN.xml` → `scripts/pptx/clean.py` → 内部 zip → `validate.py --original`；结构操作（增删/重排）必须在内容编辑之前完成。
- QA 必做：markitdown 文本核对（含占位符残留 grep）+ validate + 转图逐页目检，文本溢出优先查。
- 设计底线：配色贴合主题、每页至少一个视觉元素、禁标题装饰线与色条、字体宽度按 QA 安全名单选。

### Excel（references/xlsx.md）
- `openpyxl`/`pandas`/`markitdown` 预装；一律写公式不硬编码结果，遵循用户规格字面。
- 含公式必跑 `python scripts/xlsx/recalc.py`：`errors_found` 必须清零；注意其 exit 0 ≠ 无错误，读 JSON 的 `status`。
- 函数兼容性：优先 Excel-2007 代；六个后 2007 函数须 `_xlfn.` 前缀；禁 XLOOKUP/FILTER/SORT 等。
- 财务模型：蓝=输入/黑=公式/绿=跨表/红=跨文件/黄=待填；数字格式与假设注释规范见全文。

### PDF（references/pdf.md）
- 常规：pypdf 合并/拆分/旋转/加密/水印，pdfplumber 提文本与表格，reportlab 生成（上下标用 `<sub>/<super>` 标记，禁 Unicode 字符），qpdf/pdftotext/pdfimages 命令行，pytesseract+pdf2image 做扫描件 OCR。
- 表单：可填字段走 extract_form_field_info → field_values.json → fill_fillable_fields；不可填走结构提取（Approach A）或视觉估计+缩放校准（Approach B），填前必跑 check_bounding_boxes，填后转图验证。
- 高级与排错见 `references/pdf-reference.md`。

### 协同撰写（references/coauthoring.md）
三阶段引导工作流：① Context Gathering（元问题→倾泻上下文→澄清提问）② Refinement & Structure（逐节头脑风暴与迭代编辑）③ Reader Testing（无上下文新会话读文档验证）。用户拒绝则自由协作。

## 依赖
`docx`/`pptxgenjs`（npm 预装）、`openpyxl`/`pandas`/`markitdown`/pypdf/pdfplumber/reportlab（pip 预装）、pandoc、LibreOffice（经各格式 `office/soffice.py` 包装）、Poppler（pdftoppm/pdftotext）。缺什么装什么，勿盲目先装。

## 许可
四个格式技能原始 LICENSE 见 `LICENSES/`（doc-coauthoring 无 LICENSE 文件）。
