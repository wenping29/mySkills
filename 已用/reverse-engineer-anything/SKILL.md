---
name: reverse-engineer-anything
description: 使用 REA 对原生、托管、Electron/JavaScript、打包、固件和浏览器目标进行逆向工程（reverse engineering）。利用已交付构件（shipped artifact）或所请求的运行时证据来解释功能、比较版本、反编译代码或指导重建。普通的源码仓库架构分析请勿使用 REA。
metadata:
  version: "42"
  tool_count: 207
---

# REA

当某个论断依赖于已交付的二进制文件或软件包、反编译结果、被动的应用运行时
证据，或需要与现有源码无法证实的行为进行比较时，使用 REA。对完整源码仓库
进行常规分析时，使用普通的仓库工具，不要运行 REA 的 readiness 或 provider
命令。

## 仅在需要时连接

安装本技能只提供操作说明；它不会注册 REA MCP 服务器、安装分析引擎，
也不会向已在运行的 agent 添加工具。

如果 REA 工具可用且其注册已知未过期，直接处理目标即可。不要在每次调查前
都运行诊断或 setup。使用已连接服务器实际提供的工具列表和输入 schema；
从仓库 main 分支安装的技能可能描述了旧 npm 版本中不存在的能力。当该服务器
未声明保留引用（retained references）时，保留完整的内联 Evidence。

如果工具缺失、调用被客户端阻止，或所需的 provider 不可用，阅读
[连接与恢复](references/connection-and-recovery.md)。诊断观察到的阻碍，
继续可用的受支持工作，修复后再恢复原任务。客户端审批、shell PATH、注册和
引擎可用性各有不同的补救办法；不要对所有问题都重复运行 setup。

1. 诊断时不要更改 REA 或客户端配置。`npx` 可能下载软件包并写入 npm 缓存。
   对 Codex，运行
   `npx -y rea-agents@6.7.0 doctor --client codex --json`。替换为当前受支持的
   客户端：`claude_code`、`claude_desktop`、`codex`、`cursor`、
   `gemini_cli`、`windsurf`、`devin`、`opencode`、`antigravity`、`copilot_cli`、
   `commandcode`、`vscode`、`grok_build`、`omp` 或 `grok_bot`。`grok_bot` 没有本地
   文件注册：doctor 会报告 Grok Bot 聊天步骤，setup 不会
   写入 `mcp.json`。如果客户端未知，使用 `doctor --json` 并
   检查其注册结果，再选择 setup 范围。
2. 区分原因。注册缺失、格式错误或过期需要限定范围的配置修复。
   注册一致但当前会话中没有工具，则需要重启/重连；doctor 无法证明当前
   agent 已连接。provider 缺失只影响需要该 provider 的任务：静态 JavaScript
   检查既不需要 Hopper 也不需要 Ghidra，而 Android 检查另有需自备的
   JADX/Java 前提条件。
3. 若需配置修复，先准备只读计划：
   `npx -y rea-agents@6.7.0 setup --client codex --dry-run --json`。
   使用当前客户端的 ID，展示其确切的目标路径、备份和变更，并在 setup
   写入配置或安装 Hopper 之前获得批准。Setup 通常也会安装配套的内置技能；
   把该替换项纳入待审阅的计划。批准后，用
   `npx -y rea-agents@6.7.0 setup --client codex --yes` 应用相同范围。
   仅当确实需要该单独安装且已明确批准时，才添加 `--install-hopper`。
4. 重启/重连受影响的 agent。确认 REA 工具确实出现在会话中，然后恢复
   原调查。如果仍然缺失，检查客户端的 MCP 启动错误，而不是重复运行 setup。

REA setup 从不安装或升级 Node.js、npm、Homebrew、Java、Ghidra、IDA、
JADX、Kuna、Binwalk 或 Unblob。使用现有前提条件；不要为了修复 MCP 注册
而安装无关软件。对不受支持的客户端，使用版本锁定的 `rea-agents` 包进行
手动 stdio 注册，或继续通过 CLI 操作。

针对操作者提供的 JavaScript 目录树或 ASAR，一个具体的 CLI 回退方案是：

```bash
npx -y rea-agents@6.7.0 analyze-javascript-application /absolute/path/to/app --json
```

无需 MCP 注册或原生引擎。以与 MCP 结果同等的谨慎阅读返回的 Evidence、
图、限制和未知项；CLI 直接返回 Evidence 记录。此回退方案不能证明 MCP
已配置。原生 CLI 任务仍需要其选定的引擎。优先使用已有的 `rea` CLI。
当未安装任何 CLI 且获取 REA 包在授权范围内时，用
`npx -y rea-agents@6.7.0` 代替。配置修复从只读 setup 计划开始；在应用
已授权的变更前展示路径、备份和技能替换。保留现有的审批与目标执行边界。
REA setup 从不安装或升级无关软件，包括 Node.js、npm、Homebrew、Java、
Ghidra、IDA、JADX、Kuna、Binwalk 或 Unblob。

## 先按目标选择路由

根据用户提供的目标选择第一个工具。对需要活动目标的原生或归档工作流使用
`open_binary`；target-free 工具自带明确的 path 或 endpoint，不需要它。

- ASAR 或已解包的 JavaScript/Electron 目录树：
  `analyze_javascript_application`。
- 归档/包成员清单（ZIP/APK/IPA/MSIX/AppX 或 DMG）：
  用所提供的本地路径调用 `open_binary`；当其图和发现有助于回答问题时，
  使用 `inspect_artifact`。
- Android APK 代码、类、方法或入向引用：
  `inspect_android_package`，然后在其被声明可用时使用针对性的 Android 工具。
  归档成员清单仍使用上面的归档路由。
- 托管 PE/CLI 程序集：`inspect_managed_artifact`。
- 固件镜像：在其被声明可用时使用 `inspect_firmware_regions`。
  当请求提取时，使用 `extract_firmware`，并由调用方选择一个新的绝对输出目录。
  这些工具在 Linux 上使用调用方提供的 Binwalk/Unblob；参见
  [固件指南](https://github.com/morluto/rea/blob/main/docs/firmware-analysis.md)。
- .NET NativeAOT PE/ELF：原生 Ghidra 分析。原生代码可产出伪代码；
  关于可选的元数据恢复及其支持的主机/布局边界，参见
  `references/native-and-artifacts.md` 中的 NativeAOT 工作流。
- 用户已打开的浏览器页面：`list_browser_targets`。
- agent 必须执行的浏览器操作（点击、输入、导航）：
  用声明的 actions 调用 `capture_browser_scenario`。关于连接/启动
  以及针对性的后续浏览器工具，参见[运行时观测](references/runtime-observation.md)。
- Fiddler Everywhere 流量或原生 `.saz` 捕获：阅读
  [Fiddler 工作流](references/runtime-observation.md#fiddler-everywhere-traffic-debugging)。
  用 `inspect_web_network_capture` 和 `format: "saz"` 检查已保存的 SAZ；
  实时流量需连接 Everywhere 单独的 MCP 服务器。
- 已保留的 HAR/SAZ/原生 mitmproxy/aioquic qlog 捕获：
  `inspect_web_network_capture`。在有用时选择原始记录序号；检查 producer
  字段和字节/数字 sidecar，但不抓取已记录的 URL，也不声称实时归因。
  关于确切的上游 profile 和凭据排除，参见
  [历史捕获](https://github.com/morluto/rea/blob/main/docs/web-network-captures.md)。
  Qlog 支持从 aioquic 1.5.0 JSON 0.3 开始；流覆盖与端点丢失声明不能恢复
  消息体，也不能证明网络丢失。优先使用 detail summary，然后是 kind qlog
  的 trace/stream 分页；对 contribution/range 页面选择一个 trace、stream ID
  和方向。Facts 保留"选择前所有已记录事件"的范围。其他 qlog 布局和
  PCAP 关联不受支持。
- 用户已打开的 Electron 运行时：`list_electron_targets`。
  在尝试 electron-main Inspector 之前，用 `inspect_electron_fuses` 检查打包的
  fuses；`EnableNodeCliInspectArguments` 被禁用意味着应用忽略 `--inspect`。
- 报文字段发现：在为 `inspect_packet_capture` 选择字段之前，
  用 `inspect_packet_fields` 搜索已安装的协议和字段名/类型。查询/分页相关
  记录；注册信息不能证明观测到的流量。
- 已录制的报文捕获：用选定的 TShark 字段、显示过滤器和 decode-as 规则
  调用 `inspect_packet_capture`。需要 Linux、util-linux prlimit 和
  `REA_TSHARK_COMMAND`；参见
  [捕获指南](https://github.com/morluto/rea/blob/main/docs/packet-captures.md)。
  报文数量限制在过滤前统计输入报文。输出默认为 50 个匹配帧；后续页使用
  `match_offset` / `match_limit`，或显式设置 null 限制以获得完整匹配输出。
  跨页保留源摘要（digest）。这不执行实时捕获。
  对地址/DNS/SNI/协议摘要，用 MCP detail summary 调用
  `inspect_pcap_capture`，然后使用保留的 kind pcap 分页。需要 Wireshark 4.x
  的 tshark 和 capinfos，配合 Linux prlimit 或 Windows Job Objects；参见
  [报文摘要](https://github.com/morluto/rea/blob/main/docs/pcap-analysis.md)。
  对地址页面选择一个确切的 DNS question；分页穷尽不能证明网络完整性。
  这读取的是录制文件，不采集流量。
- 解码器发现：用 `inspect_signal_decoders` 搜索已安装的解码器 ID
  或选定解码器的帮助信息，包括通道和选项。在确定设置之前查询并分页相关
  细节；这不扫描硬件。
- 已录制的逻辑/信号轨迹：用明确的解码器、通道和协议设置调用
  `decode_signal_recording`。在带有 util-linux prlimit 的 Linux 上，通过
  `REA_SIGROK_COMMAND` 提供 sigrok-cli 0.7.2；参见
  [录制指南](https://github.com/morluto/rea/blob/main/docs/signal-recordings.md)。
  输出默认为 50 行字面文本；选择注释类并用 `line_offset` / `line_limit`
  分页，或显式设置 null 以获得全部剩余输出。窗口计数是显示行数，
  不是注释数或采样数。跨页保留源摘要。这读取现有文件；不采集硬件信号。
- 明确的本地 WebAssembly 构件：`inspect_wasm_artifact`。
  通过 `REA_WABT_BIN_DIRECTORY` 提供 WABT 1.0.42；保留精确的字节/工具标识和
  解码后的 WAT。明确选择 JavaScript 胶水代码和候选路径，并保留 URL/路径
  的歧义。不做隐式抓取或目标执行；WAT 不是原始源码。参见
  [WASM 指南](https://github.com/morluto/rea/blob/main/docs/wasm-artifacts.md)。
- 明确的本地 EVM 字节码载体：用调用方选定的 `raw` 或 `hex`
  编码调用 `inspect_evm_interface`。保留载体/解码后的摘要，并把选择器、
  参数字符串和可变性视为推断候选；这不执行链上查询或目标执行。要获得
  不含 hex 或重复 stdout 的完整推断接口，先发现支持情况并选择
  `detail: "summary"`；完整 Evidence 以其原始标识保留。用返回的
  `parent_evidence_id` 获取精确函数或 `bytecode_hex`/stdout/stderr 分页。
  候选覆盖不能证明接口完整性。参见
  [EVM 字节码指南](https://github.com/morluto/rea/blob/main/docs/evm-bytecode.md)。
- 内嵌的 Go 编译器、模块或构建设置元数据：用明确的本地文件调用
  `inspect_go_binary`。这一内置的 target-free 检查不需要安装 Go 或反汇编器。
  保留原始模块字节和源码范围；缺少元数据不能证明二进制不是 Go，未解析的
  文本记录仍保持显式。参见
  [Go 二进制指南](https://github.com/morluto/rea/blob/main/docs/go-binaries.md)。
- 内嵌的 cargo-auditable Rust 依赖元数据：用明确的本地 ELF、PE 或
  thin Mach-O 文件调用 `inspect_rust_binary`。这一内置的 target-free 检查
  不需要安装 Rust 或反汇编器。保留包顺序、依赖索引和节（section）文件范围。
  缺失 `.dep-v0` 节只是 null 元数据，不能证明二进制没有依赖。rustc 提交哈希
  是从只读 `/rustc/<40-hex>/` 路径做出的推断。参见
  [Rust 二进制指南](https://github.com/morluto/rea/blob/main/docs/rust-binaries.md)。

- 明确的本地 SQLite 数据库快照：`inspect_sqlite_database`。
  使用提供原生 SQLite 限制的 Node.js 24.x >=24.15 或 26+ 进行检查。先读取
  schema（默认紧凑清单），或在需要行数据时选择一个确切的普通表和
  `columns`。默认为所选表的 schema 和 20 行；要获得完整存储 schema，
  请求 `schema_scope: "database"`。同时保留数据库和已存在的同级 WAL 标识；
  行样本会报告截断且顺序未指定。使用静止（quiescent）快照，而不要假设
  在线的数据库/WAL 对是原子复制的。参见
  [SQLite 指南](https://github.com/morluto/rea/blob/main/docs/sqlite-databases.md)。
- 为离线布局、符号、重定位或静态缓解证据提供明确的 Linux ELF 文件：
  `inspect_binary_layout`。这一 target-free 操作使用调用方提供的 pwntools，
  且不打开反汇编器数据库。保留其原始位置和推断/覆盖限制；参见
  [离线二进制指南](https://github.com/morluto/rea/blob/main/docs/binary-diagnostics.md)。
- 所提供的 Linux x86-64 ELF core：`inspect_recorded_crash`。
  在不打开活动目标的情况下读取每个已记录的线程、原始 note 和与源绑定的
  寄存器。历史 PID 不会选定活动进程。仅当仅凭 core 的映射候选有帮助时才
  请求 `include_debugger_context`；参见
  [已录制崩溃指南](https://github.com/morluto/rea/blob/main/docs/recorded-crashes.md)。
- PE 资源类型/名称/语言树和静态图标组引用：用明确的路径调用
  `inspect_pe_resources`。这一可移植操作不需要活动目标或引擎；不透明载荷
  保留文件范围和 SHA-256。
- 原生可执行文件、库或分析数据库：`open_binary`，然后直接使用
  针对性的分析工具；当元数据或清单上下文有用且所选 provider 可用时，
  调用 `binary_overview`。

对已有的 IDA MCP 配置，用原始输入二进制和 `provider_id: "ida"` 调用
`open_binary`；不要传入 `.idb` 或 `.i64` 数据库。旧版 attached profile
通过 SHA-256 绑定已打开的 GUI 输入，并让其数据库保持打开。现代 headless
profile 创建并关闭一个自有的私有数据库，且不做保存。安装与注册复用
[mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp)；参见
[IDA provider 指南](https://github.com/morluto/rea/blob/main/docs/ida-provider.md)。
打开后可直接进行 `analyze_function`、伪代码或函数/字符串搜索；IDA 不提供
`binary_overview`。在组合更大范围的工作流时，查阅会话可用性。现代直接调用方
和不受支持的 dossier 方面仍属未知；实时 IDA 结果不会从快照重放。

配置 `REA_KUNA_COMMAND` 后，`provider_id: "kuna"` 基于 Kuna 缓存的全程序
导出回答过程列表、查找、伪代码、汇编和 `analyze_function`。调用方/被调用方
使用会话共享的单独无函数体图；`xrefs` 返回精确地址的入向位置并过滤转发
别名。这些查询和清单查找不会触发 C 导出。间接目标仍属未知，可能使关系
覆盖不完整。引用缓存在关闭时失效；新的 CLI 进程会重复原生引用遍历。
类型化引用、CFG、原始内存工具和注释仍不受支持。冷启动的首个答案可能来自
单函数运行（其限制会说明这一点）；汇编需等待导出。对伪代码和汇编，
`raw_result.source` 指明缓存的 `.c`/`.asm` 文件和字节跨度，你可以直接搜索
它们，而不必逐函数调用。参见
[Kuna provider 指南](https://github.com/morluto/rea/blob/main/docs/kuna-provider.md)。

如果用户只说"我的应用"，没有给出名称、路径或本任务已选定的目标，
先询问是哪个应用，再去搜索构件。无关的已保存报告中的路径和附近的测试夹具
不能选定用户的目标。尽可能把一个真实可读的应用名解析为一个明确的已安装
构件；匹配有歧义时要询问。绝不要替用户挑选示例应用。

在 target-free 会话中，用 `open_binary` 绑定任何分析工具作用于活动目标的
归档/包或原生目标。不要调用未声明的工具；用 `{}` 检查 `binary_session`，
并通过其 `result.tool_availability` 了解可用性原因和补救措施。把每组的
`names` 展开为条目，除非该组覆盖，否则继承清单级的客户端要求。在其封闭的
effect 和 annotation 词汇表中，列出的标志为 true，省略的已知标志为 false。
分组名称的并集即完整工具清单；用 `tools/list` 获取规范的工具 schema。
provider 候选事实描述可能的 provider，而顶层会话能力描述当前路由，
`analysis_provider_binding` 指明所选 provider。不要把这些范围视为可互换。

## 摘要优先开展工作

从默认结果开始，使用其内联 Evidence 和图上下文。对大小未知或很大的
JavaScript 应用或 ELF 布局，用 `"detail": "summary"` 调用
`analyze_javascript_application` 或 `inspect_binary_layout`，然后用
`inspect_analysis_view` 检查保留的 `parent_evidence_id`。对模块身份分页并在
请求条目之前选择返回的 `node_id`；单个文件路径可表示多个图角色。在输入
未改变或阻碍未解决时，不要重复相同的分析或被拒绝的调用。当生命周期变化
使该状态有用时，重新检查会话状态。仅当返回结果遗留了具体
问题未解答时，才做针对性的跟进。

如果 MCP 报告带 `details.resource: "transport"` 的
`resource_constraint`，用其报告的同一会话 Evidence 引用调用
`inspect_analysis_view`，获取摘要、一个 section/模块或稳定分页。一旦确定
种子，使用 `trace_application_feature`，或调用 `export_evidence_bundle` 把
完整会话写入所选路径。分析在 ledger 中保持完整；不要仅为请求同样的超大
响应而重复分析。完整 CLI JSON 输出也会流式返回，而不通过单个 MCP 帧。

当保留的父 ID 未知时，用 `detail: "summary"` 调用
`get_evidence_bundle`，并按操作、目标 SHA-256、分析 profile 摘要或规范
过程地址设置精确过滤器。选择其返回的 Evidence ID 用于下一个视图，而不要
请求完整 bundle。`retention: "complete-record"` 表示整条记录已存储；原生
值流截断和未知元数据仍是分开的。对导出的可移植 bundle，使用
`rea inspect-evidence-bundle`，配合包含 `path`、`detail: "summary"`
和相同 `filters` 的 JSON。读取该文件仍需在本地内存预算内校验其全部内容。

客户端也可能在没有 REA 传输错误的情况下截断成功的工具结果。把该预览视为
不完整；当需要完整记录时，用保留的父 ID 获取更小的视图或导出。不要把预览
当作规范 JSON 解析，也不要重复生产者操作。对 JavaScript，在深入大图之前
先阅读[模块视图与跟踪配方](references/javascript-applications.md)；即使经过
摘要分析，宽泛的双向跟踪仍可能展开无关的包含关系。

每个结论都必须区分观察、推断和未知项。引用 Evidence ID，保留限制和不完整
覆盖，绝不暗示静态分析观测到了执行。运行时请求执行声明的目标和生命周期；
不要超出这些字段扩大目标或操作。

在用户请求的调查范围内，直接调用可用的分析工具。REA 不要求授权授予或
逐次调用的审批标志。agent 客户端可以独立要求审批。遵循声明的请求范围和
宿主机实际的访问要求；遇到观察到的客户端策略拒绝时使用恢复指南。

## 规划更大范围的调查

对跨越多个功能或子系统的需求，使用分阶段工作流：

1. 把需求转化为问题清单以及每个答案所需的证据。在再次索要信息之前，
   先从对话和工作区中确定目标身份与约束。
2. 检查当前 REA 会话、构件身份、已保存的分析数据库、书签和既往证据。
   复用匹配的状态；不要打开重复会话或重复相同的分析。
3. 从最小的有用概览或清单开始。让每个问题从其入口出发，经过相关数据
   和状态变化，追踪到其结果。围绕特定假设批量执行相关操作，仅当返回证据
   留下具体缺口时才扩大范围。
4. 当相关打包资源和配置影响问题时，连同代码一起检查它们。使用格式
   感知的清单和解析器；不要仅凭文件名、字符串或布局推断行为。
5. 用结论所需的证据类型加以佐证。仅当静态证据无法回答问题且所需的
   宿主运行时和 OS 访问可用时，才使用运行时观测。对 JavaScript 行为，
   通过可用的浏览器、Electron 或进程捕获工作流，针对实际应用运行探针。
6. 把工作分解为独立的问题。当有并行 worker 可用且问题彼此不依赖时，
   分配互不相同的范围，把 worker 指向现有证据，并要求它们返回来源、结论和
   未解决的缺口。否则按顺序推进。
7. 维护一份简洁的发现 ledger，把每个结论关联到 Evidence ID、
   置信度/证据类型、搜索边界和剩余未知项。更新共享索引或调查报告，以便
   后续轮次复用结果。

结束之前，重访原始清单。根据证据把每个问题标记为已解答、部分解答或
未解决；让有界的否定搜索保持有界，并且在必需问题仍未解决时，不要把大范围
调查描述为已完成。

## 只阅读相关指南

- 原生二进制、托管程序集、归档与提取：
  [references/native-and-artifacts.md](references/native-and-artifacts.md)
- ASAR、已解包的 JavaScript、功能跟踪与版本比较：
  [references/javascript-applications.md](references/javascript-applications.md)
- Android APK 声明、类、方法与静态引用：
  [references/android-applications.md](references/android-applications.md)
- 浏览器/Electron 观测（被动与场景）及静态/运行时对照：
  [references/runtime-observation.md](references/runtime-observation.md)
- Evidence 分页、比较、残余未知项与验证：
  [references/evidence-workflows.md](references/evidence-workflows.md)

## 结束任务

用平实的语言解释发现，并将其与返回的证据关联。当用户要求构建某物时，
使用常规编码工具，并把观测到的行为与设计选择区分开。调查完成后，用
`close_binary` 关闭已打开的原生会话。
