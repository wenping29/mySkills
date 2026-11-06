#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recurrence>=3 自动 promote 建议（草案）。

反样本册：扫描 error_index.md，定位每条 ERR 对应的单条 .md（errors/ERR-XXX.md），
解析其中 Recurrence-Count / First-Seen / Last-Seen / Tasks 字段，
评估是否满足 promote 硬规则：
    Recurrence-Count >= 3 且 跨 >= 2 个不同任务(Tasks>=2) 且 在 30 天窗口内

正样本册（--success-index 或自动发现 success_index.md）：定位 SUC-XXX.md，
解析 front-matter hit_count / last_hit_at 与正文 Tasks，判据为复用驱动：
    hit_count >= SUC_HIT_THRESHOLD 且 Tasks >= MIN_TASKS
（两册口径有意不同——反册看「复发」，正册看「复用」，禁互相套用。）

仅输出建议，不自动改写规则文件（升格由 Agent 读单条自评裁定并落可撤销处置段；
确需写入规则文件属须用户确认的资产改动）。不跨项目写禁忌不变。
若单条字段缺失，优雅跳过并提示（hit_count 缺失按 0，禁以缺失推定复用）。

退出码：
  0 = 完成（无论有无建议）
  2 = 反册索引缺失
"""
import sys
import os
import re
import argparse
from datetime import datetime

RECURRENCE_THRESHOLD = 3
MIN_TASKS = 2
WINDOW_DAYS = 30
SUC_HIT_THRESHOLD = 3  # 正册看「复用」(hit_count)，与反册「复发」(RC) 口径有意不同，禁互套


def parse_index(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError as e:
        print("[RECUR-PROMOTE] 错误：读取索引失败: %s" % e, file=sys.stderr)
        return None
    for line in lines:
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or not re.match(r"^ERR-\d+$", cells[0]):
            continue
        rows.append({
            "err_id": cells[0],
            "desc": cells[1] if len(cells) > 1 else "",
            "keywords": cells[3] if len(cells) > 3 else "",
            "date": cells[4] if len(cells) > 4 else "",
        })
    return rows


def parse_recurrence(md_path):
    try:
        with open(md_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None

    def field(name):
        # 值后常紧跟全角括号说明（模板：`**Recurrence-Count**：3（复现次数…）`），
        # 取到 `（`/`(`/`【`/`[` 为止并剥尾随标点，避免把说明吞进值里。
        m = re.search(
            r"\*{0,2}%s\*{0,2}\s*[:：]\s*([^\s（(【\[]+)" % re.escape(name), content)
        return m.group(1).strip().rstrip("，,。.；;：:)）】]") if m else None

    return {
        "count": field("Recurrence-Count"),
        "first": field("First-Seen"),
        "last": field("Last-Seen"),
        "tasks": field("Tasks"),
    }


def to_int(v):
    """ERR-235 修法：数字式直接取整；清单式按分隔符计条目数。

    禁直接 int()/取首个数字——`Tasks: 2026-09-16` 之类会被解析成年份 2026，
    使 `tasks >= 2` 被**错值蒙对**（假绿）。
    """
    s = str(v or "").strip().rstrip("，,。.；;：:)）】]")
    if s.isdigit():
        return int(s)
    parts = [p for p in re.split(r"[/，、,；;]+", s) if p.strip()]
    return len(parts) if parts else 0


def to_date(v):
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(str(v), fmt)
        except Exception:
            continue
    return None


def parse_suc_index(path):
    """解析正册索引：`SUC-XXX | 触发关键词 | 标题`（容忍 `年/月/` 前缀）。"""
    if not path or not os.path.isfile(path):
        return None
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s.startswith("|"):
                    continue
                cells = [c.strip() for c in s.strip("|").split("|")]
                if len(cells) < 2:
                    continue
                if not re.match(r"^(?:\d{4}/\d{2}/)?SUC-\d+$", cells[0]):
                    continue
                rows.append({"suc_id": cells[0], "desc": cells[-1]})
    except OSError as e:
        print("[SUC-PROMOTE] 错误：读取正册索引失败: %s" % e, file=sys.stderr)
        return None
    return rows


def find_suc_entry(success_dir, suc_id):
    """定位正册单条：id 含 `年/月/` 前缀 → 按前缀拼；否则先扁平再遍历一层。"""
    if not success_dir or not suc_id:
        return None
    cand = os.path.join(success_dir, suc_id.replace("/", os.sep) + ".md")
    if os.path.isfile(cand):
        return cand
    base_id = suc_id.split("/")[-1]
    cand = os.path.join(success_dir, base_id + ".md")
    if os.path.isfile(cand):
        return cand
    for r, _dirs, fs in os.walk(success_dir):
        if base_id + ".md" in fs:
            return os.path.join(r, base_id + ".md")
    return None


def parse_success_entry(md_path):
    """读正册单条：front-matter hit_count / last_hit_at（机器记账）+ 正文 Tasks。"""
    try:
        with open(md_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None
    parts = content.split("---", 2)
    fm_block = parts[1] if len(parts) >= 3 else ""

    def fm_field(name):
        m = re.search(r"^%s:\s*([^\n]*)$" % re.escape(name), fm_block, re.M)
        return m.group(1).strip() if m else None

    m = re.search(r"\*{0,2}Tasks\*{0,2}\s*[:：]\s*([^\s（(【\[]+)", content)
    tasks = m.group(1).strip().rstrip("，,。.；;：:)）】]") if m else None
    return {
        "hits": fm_field("hit_count"),
        "last_hit_at": fm_field("last_hit_at"),
        "tasks": tasks,
    }


def main():
    parser = argparse.ArgumentParser(description="Recurrence>=3 promote 建议（草案）")
    parser.add_argument("--index", required=True, help="error_index.md 路径")
    parser.add_argument(
        "--errors-dir", default="",
        help="单条 ERR-XXX.md 目录（默认：索引同目录的 errors/）",
    )
    parser.add_argument(
        "--success-index", default="",
        help="正册索引 success_index.md 路径（默认：反册索引同目录或其 success/ 下自动发现）",
    )
    parser.add_argument(
        "--target", default="CLAUDE.md / AGENTS.md / project_memory.md（项目级记忆；具体项目的规则文件名不同则用 --target 覆盖）",
        help="建议 promote 的目标（默认项目级 Agent 记忆；若项目用特定规则文件如 主规则.mdc，用 --target 覆盖）",
    )
    args = parser.parse_args()

    rows = parse_index(args.index)
    if rows is None:
        return 2
    if not rows:
        print("[RECUR-PROMOTE] 索引无 ERR 条目")
        return 0

    errors_dir = args.errors_dir or os.path.join(os.path.dirname(args.index), "errors")
    today = datetime.now()
    suggestions = 0
    print("[RECUR-PROMOTE] 扫描 %d 条 ERR，硬规则：>=%d次 / >=%d任务 / %d天窗口"
          % (len(rows), RECURRENCE_THRESHOLD, MIN_TASKS, WINDOW_DAYS))
    for r in rows:
        md_path = os.path.join(errors_dir, r["err_id"] + ".md")
        rc = parse_recurrence(md_path)
        if not rc or rc["count"] is None:
            continue  # 字段未扩展，跳过
        count = to_int(rc["count"])
        tasks = to_int(rc["tasks"])
        last = to_date(rc["last"]) or to_date(r["date"])
        in_window = (today - last).days <= WINDOW_DAYS if last else False
        ok = count >= RECURRENCE_THRESHOLD and tasks >= MIN_TASKS and in_window
        tag = "[PROMOTE]" if ok else "[skip]"
        print("[RECUR-PROMOTE] %s %s | count=%s tasks=%s last=%s window=%s"
              % (r["err_id"], tag, count, tasks, rc["last"] or r["date"], in_window))
        if ok:
            suggestions += 1
            print("      → 建议写入 %s：防重踩规则（来自 %s：%s）"
                  % (args.target, r["err_id"], r["desc"]))
    suc_suggestions = 0
    suc_index = args.success_index
    if not suc_index:
        base = os.path.dirname(args.index)
        for cand in (os.path.join(base, "success_index.md"),
                     os.path.join(base, "success", "success_index.md")):
            if os.path.isfile(cand):
                suc_index = cand
                break
    suc_rows = parse_suc_index(suc_index) if suc_index else []
    if suc_rows:
        success_dir = os.path.dirname(suc_index)
        print("[SUC-PROMOTE] 扫描 %d 条 SUC，正册判据：hit_count>=%d（复用） / Tasks>=%d"
              % (len(suc_rows), SUC_HIT_THRESHOLD, MIN_TASKS))
        for r in suc_rows:
            md_path = find_suc_entry(success_dir, r["suc_id"])
            se = parse_success_entry(md_path) if md_path else None
            if not se or se["hits"] is None:
                print("[SUC-PROMOTE] %s [skip] | hit_count 缺失（禁以缺失推定复用）" % r["suc_id"])
                continue
            hits = to_int(se["hits"])
            tasks = to_int(se["tasks"]) if se["tasks"] is not None else 0
            ok = hits >= SUC_HIT_THRESHOLD and tasks >= MIN_TASKS
            tag = "[PROMOTE]" if ok else "[skip]"
            print("[SUC-PROMOTE] %s %s | hits=%s tasks=%s" % (r["suc_id"], tag, hits, tasks))
            if ok:
                suc_suggestions += 1
                print("      → 建议升格到 %s：已验证做法（来自 %s：%s）；升格须写回滚点"
                      % (args.target, r["suc_id"], r["desc"]))
    print("[RECUR-PROMOTE] 共 %d 条 ERR 满足 promote 条件；正册 %d 条满足升格条件"
          % (suggestions, suc_suggestions))
    return 0


if __name__ == "__main__":
    sys.exit(main())
