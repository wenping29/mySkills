# Quick Refactor — 小步安全重构

> 源自 engineering-workflow/code-refactor。定位：跨文件的小步、机械式安全重构——批量重命名标识符、替换废弃模式、更新 API 调用。需要系统性重构（坏味道分析→手法选型→行为等价验证）时走本 skill 六步主线（尤其 step4/step6）。

## 适用场景

- "把 getUserData 重命名为 fetchUserData"
- "把所有 var 替换成 let/const"
- "更新所有对 /api/auth/login 的调用到 v2 路径"

不适用：提取方法/类、消除重复逻辑、架构级调整 → 走六步主线。

## 模式选择

- **1-9 个文件**：用原生工具（Grep + Edit `replace_all=true`）
- **10+ 个文件**：改用脚本化批量转换（如 AST/正则批量重命名工具），避免逐文件编辑耗尽上下文

## 核心流程（Find → Replace → Verify）

### 1. 找出全部出现点

```
Grep(pattern="getUserData", output_mode="files_with_matches")                    # 定位文件
Grep(pattern="getUserData", output_mode="content", -n=true, -B=2, -A=2)          # 带上下文核对
```

### 2. 逐文件替换

```
Edit(file_path="src/api.js", old_string="getUserData", new_string="fetchUserData", replace_all=true)
```

- `old_string` 必须精确匹配（含空白、引号）
- `replace_all=true` 替换全部；`false` 只替换第一处（多处时失败）

### 3. 验证

```
Grep(pattern="getUserData", output_mode="files_with_matches")   # 应返回空
```

然后运行 lint / 测试确认无回归。

## 典型工作流

**重命名函数**：Grep 找全 → 报告范围（"5 个文件 15 处"）→ 逐文件 `replace_all` → 复查 Grep → 建议跑测试

**替换废弃模式**：`Grep(pattern="\\bvar\\s+\\w+", -n=true)` → 分析是否被重新赋值（是→`let`，否→`const`）→ Edit 替换 → `npm run lint` 验证

**更新 API 调用**：Grep 定位 URL/调用点 → Edit `replace_all` 替换 → 建议跑集成测试

## 安全检查点

1. **先找全再动手**：任何替换前完成全库搜索，不漏文件
2. **逐处核对上下文**：确认每处匹配语义一致，不误伤同名字符串
3. **告知范围**：向用户报告"将改 N 个文件 M 处"再执行
4. **边界情况**：
   - 字符串/注释中的同名文本 → 询问用户是否一并更新
   - 导出 API / 公共接口重命名 → 警告破坏性变更
   - 大小写敏感 → 明确 Grep/Edit 是否加 `-i`
5. **改完必测**：每完成一组替换立即跑 lint/测试，不通过不进入下一组

## 回滚策略

- **改前建恢复点**：确保工作区干净（`git status`），大批量重构前先提交当前状态或建分支
- **小步提交**：一类改动一个 commit（如"重命名 X"与"替换模式 Y"分开提交），失败时可精确 `git revert` 单个 commit
- **验证失败即回退**：Grep 复查或测试发现非预期改动，立即回退该 commit/文件，重新分析匹配范围后再做，禁止在错误状态上继续叠加
- **不混入功能改动**：quick refactor 只做机械替换，行为/逻辑变更一律走六步主线
