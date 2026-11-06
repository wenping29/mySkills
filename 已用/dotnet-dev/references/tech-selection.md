# .NET AI/ML 技术选型

蒸馏自源技能 `technology-selection`。用于 .NET 8+ 应用的 AI/ML 能力选型与实现（ML.NET、Microsoft.Extensions.AI、Microsoft Agent Framework、GitHub Copilot SDK、ONNX Runtime、OllamaSharp）。不用于：目标 .NET Framework 的项目、纯数据工程/ETL（无 ML/AI 成分）、需要自定义深度学习训练循环（用 Python PyTorch/TensorFlow 训练后导出 ONNX 供 .NET 推理）。

**先选型，再只交付任务所要求的内容**：要计划/对比/架构（或说"不写代码"）就只给计划，不擅自脚手架/构建/运行。

## 步骤 1：任务分类决策树

| 任务类型 | 技术 | 理由 |
|---|---|---|
| 结构化/表格：分类、回归、聚类、异常检测、推荐 | **ML.NET**(`Microsoft.ML`) | 确定性（固定种子）、无云依赖、专用 |
| 自然语言理解/生成/摘要/推理（单提示→响应，无工具） | **LLM via MEAI**(`IChatClient`) | 语言能力，无需编排 |
| Agentic：多步工具/函数调用、agent 循环、多 agent | **Microsoft Agent Framework**(`Microsoft.Agents.AI`) 基于 MEAI | 需要 `IChatClient` 没有的编排/工具派发/迭代控制 |
| GitHub Copilot 扩展/定制开发工作流 agent | **GitHub Copilot SDK**(`GitHub.Copilot.SDK`) | 集成 Copilot agent 运行时 |
| 生产环境跑预训练/自定义模型 | **ONNX Runtime**(`Microsoft.ML.OnnxRuntime`) | 硬件加速、格式无关推理 |
| 本地/离线 LLM 推理 | **OllamaSharp** | 隐私敏感、air-gap、成本受限 |
| 语义搜索、RAG、向量存储 | **MEVD**(`Microsoft.Extensions.VectorData.Abstractions`) + provider（Azure AI Search、Milvus、MongoDB、pgvector、Pinecone、Qdrant、Redis、SQL） | provider 无关向量搜索 |
| 文档摄取/分块/入向量库 | **Microsoft.Extensions.AI.DataIngestion**(preview) + MEVD | 解析、分块、嵌入、upsert |
| 既要结构化预测又要自然语言推理 | **混合**：ML.NET 打分 + LLM 解释层 | ML.NET 可复现；LLM 加解释 |

**关键规则**：ML.NET 擅长的表格任务绝不用 LLM（更慢、更贵、不确定）。

## 步骤 1b：库层次

| 层 | 库 | 何时用 |
|---|---|---|
| 抽象 | `Microsoft.Extensions.AI`(MEAI) | 永远是地基。单提示响应与简单有界函数调用直接用 `IChatClient` |
| Provider SDK | `Azure.AI.OpenAI`/`OpenAI`/`Azure.AI.Inference`/`OllamaSharp` | 经 `AddChatClient` 藏在 MEAI 后面的具体 provider |
| 编排 | `Microsoft.Agents.AI`(prerelease) | 多步工具使用、持久 agent 循环、多 agent 工作流 |
| Copilot | `GitHub.Copilot.SDK` | 仅 Copilot 平台扩展 |

规则：从 MEAI 起步；provider 藏进 `AddChatClient`（业务逻辑不直接调 provider）；多步/持久 agent 用 Agent Framework 而非手写循环；同一工作流绝不混裸 `HttpClient` 调 OpenAI 与 MEAI。**不用 Accord.NET（已归档）**；新项目优先 MEAI + Agent Framework（除非既有 Semantic Kernel 资产是需求）。AI/ML 服务经 DI 注册；密钥来自 user-secrets/env/Key Vault——绝不硬编码。

## 步骤 2：分支要点（计划与实现都必须覆盖）

- **ML.NET**：`new MLContext(seed: …)`（可复现）；`TrainTestSplit` + 在留出集评估；报告真实指标（Micro/MacroAccuracy、LogLoss、AUC/F1 或 RMSE/R²）；服务用 `PredictionEnginePool<TIn,TOut>`（绝不用单例 `PredictionEngine`，非线程安全）。
- **LLM(MEAI)**：依赖经 `AddChatClient` 注册的 `IChatClient`；`ChatOptions` 设 `Temperature` 与 `MaxOutputTokens`；加重试/超时（`RetryingChatClient`/Polly）；钉住带日期的模型版本；密钥安全来源——**绝不硬编码 `sk-…`**；非确定输出用 schema 校验 + 回退。
- **Agentic(Agent Framework)**：`Microsoft.Agents.AI` 基于 `IChatClient` 编排（绝不手写循环）；设 `MaximumIterations` 与 token/成本上限；每个工具用清晰 schema（`AIFunctionFactory.Create`）；记录每一步（不记原始敏感内容）。
- **RAG/嵌入**：**语义分块**（非固定尺寸）；`IEmbeddingGenerator` 且**缓存嵌入**（别每次查询重嵌入）；用 MEVD + 用户指定 provider（如 pgvector）存储/查询；按**最低相似度**过滤；每个答案保留**来源归属**；尊重用户指定的 UI/存储；只用真实存在的 NuGet 包。

**深度选择**：计划/对比/架构类问题只凭本文件回答，**不打开分支参考**；要写实现代码才读对应分支参考（混合则读 Classic ML + LLM 两篇）。源仓库各分支参考：classic-ml / llm / agentic / rag / copilot / onnx / ollama。

## 验证清单

- [ ] 选型遵循决策树——ML.NET 能做的任务没用 LLM
- [ ] 只产出所要求内容（计划请求得到计划而非代码）
- [ ] AI/ML 服务经 DI；配置经 `IOptions<T>`；密钥来自安全来源
- [ ] 所选分支要点全部满足
- [ ] 实现后构建并跑既有测试

## 反模式对照

| 反模式 | 纠正 |
|---|---|
| 表格分类用 LLM | 用 ML.NET |
| LLM 调用无重试/超时 | `RetryingChatClient` 或 Polly |
| key 提交进 `appsettings.json` | user-secrets/env/Key Vault |
| Accord.NET 或无理由默认 Semantic Kernel | ML.NET；新工作优先 MEAI + Agents.AI |
| 手写 `IChatClient` 多步工具循环 | `Microsoft.Agents.AI`（`MaximumIterations`、工具派发） |
| 单提示响应用 Agent Framework | 直接 `IChatClient` |
| 业务逻辑里裸 HttpClient/OpenAI SDK 与 MEAI 并存 | 单一抽象层，依赖 `IChatClient` |
| ASP.NET Core 里单例 `PredictionEngine` | `PredictionEnginePool<TIn,TOut>` |
| RAG 不分块或不做相关性过滤 | 语义分块 + 最低相似度阈值 |
| 在 .NET 从零自建神经网络 | 预训练模型经 ONNX Runtime 或 LLM API |
