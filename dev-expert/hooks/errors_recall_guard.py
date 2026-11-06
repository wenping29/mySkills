#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PostToolUse hook (GLOBAL, 非阻断): 写码前自动提示双册命中（对齐 error-ledger 闭环）。

- 反样本册 `error_index.md` → [ERR-RECALL]；正样本册 `success_index.md` → [SUC-RECALL]。
  对本次写操作的「文件名（不含目录）+ 内容」做轻量匹配（只取文件名：完整路径里的泛词
  会让整个目录下的任意写操作常驻误报）。
- 单一召回通道（rules 铁律）：两册由本 hook 一并承担、同一去重口径、**每册独立预算
  MAX_HITS=3**；禁为正册另建第二个提醒类 hook。
- 始终 exit 0（非阻断）；记忆维护类写（`.ai-memory/` 下）直接跳过，避免自噪声。
- 任一册缺失即静默跳过该册（无记忆体系的项目不产生噪声）。

记忆根目录解析顺序（`resolve_index_path` / `resolve_success_index_path`）：环境变量
`AI_MEMORY_DIR` → 环境变量 `PROJECT_ROOT` + `.ai-memory` → 从 cwd 逐级上溯 → 从脚本
位置逐级上溯。
退出码：本 hook 注册在 PostToolUse（Pre 侧无送达通道），始终 0。
"""
import sys
import os
import json
import re

SKIP_MARKERS = (".ai-memory",)
MAX_HITS = 3


SEP_RE = re.compile(r"[/，、,；;]")


def resolve_index_path():
    """解析 `error_index.md` 路径；无法确定时返回 None（静默）。"""
    env_dir = os.environ.get("AI_MEMORY_DIR", "")
    if env_dir:
        cand = os.path.join(env_dir, "error_index.md")
        return cand
    roots = []
    proj = os.environ.get("PROJECT_ROOT", "")
    if proj:
        roots.append(os.path.abspath(proj))
    starts = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    for start in starts:
        d = os.path.abspath(start)
        while True:
            roots.append(d)
            nd = os.path.dirname(d)
            if nd == d:
                break
            d = nd
    seen = set()
    for r in roots:
        if r in seen:
            continue
        seen.add(r)
        cand = os.path.join(r, ".ai-memory", "error_index.md")
        if os.path.isfile(cand):
            return cand
    return None


def resolve_success_index_path():
    """解析正册 `success_index.md` 路径（与反册同根）；无法确定时返回 None（静默）。"""
    names = ("success_index.md", os.path.join("success", "success_index.md"))
    env_dir = os.environ.get("AI_MEMORY_DIR", "")
    if env_dir:
        for n in names:
            cand = os.path.join(env_dir, n)
            if os.path.isfile(cand):
                return cand
        return None
    roots = []
    proj = os.environ.get("PROJECT_ROOT", "")
    if proj:
        roots.append(os.path.abspath(proj))
    starts = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    for start in starts:
        d = os.path.abspath(start)
        while True:
            roots.append(d)
            nd = os.path.dirname(d)
            if nd == d:
                break
            d = nd
    seen = set()
    for r in roots:
        if r in seen:
            continue
        seen.add(r)
        for n in names:
            cand = os.path.join(r, ".ai-memory", n)
            if os.path.isfile(cand):
                return cand
    return None


def _looks_like_keyword(s):
    """触发词判据：含分隔符（触发词常以 / 或逗号分隔）或为长描述串。"""
    return bool(SEP_RE.search(s)) or len(s) > 16


def _split_cells(line):
    """去掉首尾管线后按 `|` 全拆分并 strip（保留列序，供右侧定列取值）。"""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def parse_row(line):
    """解析一行索引 → (err_id, keyword, desc)；非数据行返回 None。

    兼容两种列序：
    - 本技能模板（≥6 列）：`ERR-ID | 一句话描述 | 根因分类 | 触发关键词 | 日期 | Recurrence-Count`
      → 触发词按**右侧定列**取（keyword=cells[-3]），描述用 `|` 回拼 cells[1:-4]；
        故描述内含 `|` 时列序不会左移、触发词不会被顶掉。
    - 精简 3 段：`ERR-ID | 触发关键词 | 描述` → keyword 取 index 1，desc 取 index 2。
    """
    cells = _split_cells(line)
    if len(cells) < 2 or not cells[0]:
        return None
    if len(cells) >= 6:
        return cells[0], cells[-3], "|".join(cells[1:-4]).strip()
    err_id, second = cells[0], cells[1]
    third = "|".join(cells[2:]) if len(cells) > 2 else ""
    # 4~5 段旧写法：第二段为描述，第三段起续接「根因分类 | 触发关键词 …」→ 触发词取 rest[1]
    if third and "|" in third:
        rest = cells[2:]
        keyword = rest[1] if len(rest) > 1 else ""
        if keyword:
            return err_id, keyword, second
    # 3 段（或续接列不含更多列）：沿用「触发词在第二段」口径
    if _looks_like_keyword(second) or not third:
        return err_id, second, third
    return err_id, second, third


def load_triggers(index_path):
    """解析 index 文件，返回 [(err_id, keyword, desc)]。

    - 遇「## 归档区」停止：归档坑不参与召回。
    - 表头行（含 `ERR-ID`）/ 分隔行（`|---`）跳过。
    """
    if not index_path or not os.path.isfile(index_path):
        return []
    out = []
    try:
        with open(index_path, encoding="utf-8", errors="ignore") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                if s.startswith("##"):
                    if "归档" in s:
                        break
                    continue
                if s.startswith("#") or s.startswith(">"):
                    continue
                if s.startswith("|") and ("ERR-ID" in s or "SUC-XXX" in s
                                          or set(s) <= set("|-: ")):
                    continue
                row = parse_row(s.lstrip("|"))
                if row and row[1]:
                    # id 规格过滤：防表头/杂行（如「SUC-XXX」字面量）成为触发词来源
                    if not re.match(r"^(?:\d{4}/\d{2}/)?(?:ERR|SUC)-\d+$", row[0]):
                        continue
                    out.append(row)
    except OSError:
        return []
    return out


WORD_ASCII_RE = re.compile(r"^[0-9a-z_]+$")
MIN_ASCII_BOUNDARY_LEN = 4  # 4~5 字母纯词走词边界匹配（form/table/special…）


def tokenize(keyword):
    """返回 (strong, boundary)：strong 走子串匹配，boundary 走词边界匹配。

    - 仅按分隔符（/，、,；;）切词，**不按空格切**：多词短语（如 CREATE TABLE）
      须保持整体，否则会被劈成 CREATE 后子串命中 imagecreatetruecolor 等致误报。
    - ASCII >=6：子串匹配（self.location / event-stream 等长短语）。
    - ASCII 4~5 且纯字母数字：改为**词边界**匹配，既救回 form/table 这类高频
      触发词，又不会让 create 命中 imagecreatetruecolor。
    - 中文保留 >=2 字：子串误报极低（中文无英文式词缀）。
    """
    strong, boundary = [], []
    for t in re.split(r"[/\，、,；;]+", keyword):
        t = t.strip()
        if not t:
            continue
        low = t.lower()
        if t.isascii():
            if len(t) >= 6:
                strong.append(low)
            elif len(t) >= MIN_ASCII_BOUNDARY_LEN and WORD_ASCII_RE.match(low):
                boundary.append(low)
        else:
            if len(t) < 2:
                continue
            strong.append(t)
    return strong, boundary


def emit(lines, event="PostToolUse"):
    """JSON 契约输出：`hookSpecificOutput.additionalContext` 在 PostToolUse 可达 Agent
    （平台以 <system-reminder> 注入）。`systemMessage` 供 IDE UI。
    **只输出这一个 JSON**，不与裸 print 混排。"""
    msg = "\n".join(lines)
    print(json.dumps({
        "systemMessage": msg,
        "hookSpecificOutput": {"hookEventName": event, "additionalContext": msg},
    }, ensure_ascii=False))


def main():
    try:
        try:
            raw = sys.stdin.buffer.read().decode("utf-8", errors="ignore")
        except Exception:
            raw = sys.stdin.read()
        raw = raw.lstrip("\ufeff")
        if not raw.strip():
            return 0
        data = json.loads(raw)
    except Exception:
        return 0

    tool_input = data.get("tool_input", {}) or {}
    path = (
        tool_input.get("filePath")
        or tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )
    if not path:
        return 0
    norm = os.path.abspath(path).replace("\\", "/").lower()
    # 跳过记忆维护写，避免自噪声
    if any(m in norm for m in SKIP_MARKERS):
        return 0

    content = tool_input.get("content") or tool_input.get("new_str") or ""
    # 只把文件名（含扩展名）纳入匹配，不拼完整路径：路径里的泛词会让该目录下
    # 任意写操作常驻误报。
    hay = (os.path.basename(norm) + "\n" + content).lower()

    # 双册召回：同一去重口径、每册独立预算（单一召回通道，禁拆分）
    buckets = (("ERR", resolve_index_path(), []),
               ("SUC", resolve_success_index_path(), []))
    for _kind, index_path, hits in buckets:
        for row_id, keyword, desc in load_triggers(index_path):
            strong, boundary = tokenize(keyword)
            matched = None
            for tok in strong:
                if tok in hay:
                    matched = tok
                    break
            if matched is None:
                for tok in boundary:
                    if re.search(r"(?<![0-9a-z_])" + re.escape(tok) + r"(?![0-9a-z_])", hay):
                        matched = tok
                        break
            if matched is not None:
                # 索引存在缺描述列的行，提示时以触发词兜底，避免空标题
                hits.append((matched, row_id, desc or keyword))

    lines = []
    if buckets[0][2]:
        lines += ["[ERR-RECALL] 操作可能命中踩坑册触发词「%s」（%s：%s）。" % (t, e, d)
                  for t, e, d in buckets[0][2][:MAX_HITS]]
        lines.append("建议 read_file 对应单条复核（Rules §20 #2 动手前必查，禁全量读 errors/）。")
    if buckets[1][2]:
        lines += ["[SUC-RECALL] 操作可能命中正样本册触发词「%s」（%s：%s）。" % (t, e, d)
                  for t, e, d in buckets[1][2][:MAX_HITS]]
        lines.append("建议 read_file 对应单条复核，并按「命中即复核」验证：实际套用 ⇒ "
                     "Recurrence-Count+1；失效 ⇒ 改 utility 并留痕（禁全量读 success/）。")
    if lines:
        emit(lines)
    return 0  # 非阻断


if __name__ == "__main__":
    sys.exit(main())
