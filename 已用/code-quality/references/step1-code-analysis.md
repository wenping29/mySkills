# 步骤 1：深度代码结构分析（细则）

对目标代码库做超越表面指标的深度理解，输出结构分析报告与复杂度热力图。

**分析维度**
- 架构风格：识别 MVC / Clean Architecture / Layered / Microservices / Hexagonal
- 执行流程：入口点、调用图、执行路径追踪
- 数据流动：数据如何在组件间传输和转换
- 业务规则：从代码中提取验证逻辑与业务约束（validation / constraint / workflow）
- 外部依赖：API、数据库、第三方库（标记关键依赖）
- 数据模型：实体、DTO、值对象及继承/实现关系
- 复杂度：圈复杂度、耦合度、重复代码段与相似逻辑片段

**DDD 模式识别**：聚合根（一致性边界）、实体（有身份）、值对象（不可变）、领域服务（无状态业务逻辑）、仓储（持久化抽象）、领域事件、限界上下文（模块边界）。

> **边界**：本节只做**分析期的模式识别**（代码里有什么）。DDD **设计方法论**（何时建模、统一语言、防腐层、上下文映射）由 dev-expert 的 `references/domain-driven-design.md` 维护，需要时转过去读，勿在本 skill 内展开设计细则。

**支持语言**：Python（AST 深度）、JS/TS（深度）、Rust（深度）、Java/Go（中等）、C/C++（基础）。

**报告要素**：执行摘要（文件数/行数/架构/入口点/模型/规则数）、质量评分（可维护性/可测试性/文档完整性/复杂度）、分级问题清单（严重→主要→次要）、按优先级改进建议、Mermaid 架构图。

```bash
# 完整深度分析
python3 scripts/analyze.py --path /path/to/project --output report.md
# DDD 专项分析
python3 scripts/ddd-analyzer.py --path /path/to/project --output ddd-report.md
# 排除目录
python3 scripts/analyze.py --path . --exclude "node_modules,vendor,target" --output analysis.md
```

深入阅读：`references/best-practices.md`、`scripts/analyze.py`、`scripts/ddd-analyzer.py`
