# 步骤 2：技术债务与架构反模式审计（细则）

基于 git 历史与代码结构评估债务分布，输出技术债报告与重构优先级排序。

- **热点分析**：分析 git 历史，识别频繁修改的热点文件；高变更频率 × 高复杂度 = 债务累积区
- **反模式检测**：循环依赖、上帝类（God Object）、过度耦合、特性依恋（Feature Envy）、逻辑泄漏点
- **腐化评估**：标记风险最高的模块和函数，评估重构优先级（紧急且重要 → 仅重要 → 仅紧急）
- **Commit Wisdom**：总结大型架构转变提交背后的"为什么"，还原创始决策上下文
- **认知负担**：高亮增加阅读成本的"脏代码"区域

**常用 git 取证命令**

```bash
# 变更热点：按修改次数排序
git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -20
# 结合时间窗口看某文件的演化密度
git log --since="6 months ago" --oneline -- path/to/file | wc -l
# 大型架构转变提交
git log --grep="refactor\|migrate\|rewrite" --oneline
```

输出：技术债务评估报告 + 重构优先级排序清单。
