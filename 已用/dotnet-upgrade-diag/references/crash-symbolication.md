# 崩溃日志 .NET 运行时帧符号化（Android / Apple）

蒸馏自源技能 `android-tombstone-symbolication`、`apple-crash-symbolication`。覆盖：Android tombstone 与 Apple 平台 .ips 崩溃日志中 .NET 原生回栈帧（MAUI/Mono/CoreCLR/NativeAOT）解析为函数名+源文件行号。不用于：纯 Java/Kotlin 或纯 Swift/OC 崩溃；logcat 已有托管堆栈的托管异常；两套流程互不混用（tombstone 不走 Apple 流程，反之立即停）。

## 1. Android tombstone（BuildId + llvm-symbolizer）

**输入**：tombstone 文件或 logcat 崩溃输出、`llvm-symbolizer`（Android NDK 或任意 LLVM 14+）、联网下载符号。

**帧格式**：`#NN pc OFFSET /path/to/library.so (optional_symbol+0xNN) (BuildId: HEXSTRING)`。提取帧号、PC 偏移（已是库相对，**绝不加/减库基址**）、库名、BuildId（32–40 hex）。**默认符号化所有线程**（GC/finalizer 线程常有有用 .NET 帧；崩溃线程在最前，其余在 `--- --- ---` 后）。脚本可自动识别带/不带 `backtrace:` 头的帧行并剥 logcat 前缀；解析失败则手工提取 `#NN pc OFFSET lib (BuildId)` 元组。

**.NET 库识别**：`libmonosgen-2.0.so`=Mono（MAUI/Xamarin/解释器）、`libcoreclr.so`=CoreCLR（JIT 模式）、`libSystem.*.so`=BCL 原生件（Native/Globalization/IO.Compression/Security.Cryptography/Net.Security）。**NativeAOT**：无运行时 .so——运行时静态链进应用二进制（如 `libMyApp.so`），需应用自己的调试符号；`libSystem.*` 仍走符号服务器。跳过 libc/libart 等系统库除非用户点名。

**下载符号**（每个唯一 BuildId 一次尝试，404=该构建未发布符号，停）：
```bash
curl -sL "https://msdl.microsoft.com/download/symbols/_.debug/elf-buildid-sym-<BUILDID>/_.debug" -o libmonosgen-2.0.so.debug
file libmonosgen-2.0.so.debug   # 必须显示 ELF ... with debug_info, not stripped
```

**符号化**：`llvm-symbolizer --obj=X.so.debug -f -C 0x<offset>`。输出 `/__w/1/s/` 前缀是 CI 工作区根，有效路径从 `src/runtime/` 起（对应 dotnet/dotnet VMR；旧构建为 `src/mono/`）。未解析帧（`??`）保留原始行含 BuildId 与偏移。

**脚本**：`pwsh scripts/Symbolicate-Tombstone.ps1 -TombstoneFile tombstone_01.txt -LlvmSymbolizer llvm-symbolizer`；旗标 `-CrashingThreadOnly`/`-OutputFile`/`-ParseOnly`（只报库/BuildId/URL 不下载）/`-SkipVersionLookup`。版本识别：拿 BuildId 匹配本地 SDK packs、NuGet 缓存、nuget.org，从 `.nuspec` `<repository commit>` 取源提交（需 llvm-readelf）。

**llvm-symbolizer 查找**：先查 NDK（`$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/*/bin/` 或 `$ANDROID_HOME/ndk/*/...`），再 brew/apt/xcrun。不可用→完成步骤 1–3 后把下载与符号化命令交给用户，**不装 LLVM**。

**常见坑**：logcat 版常缺 BuildId→用 `adb shell readelf -n /path/lib.so`、CI 工件、或 NuGet 运行时包（`~/.dotnet/packs/Microsoft.NETCore.App.Runtime.Mono.android-arm64/<ver>/`）恢复；优先取原始 tombstone `adb shell cat /data/tombstones/tombstone_XX`（必含 BuildId）。GitHub 粘贴把 `#1 pc` 变成 `org/repo#1 pc` 链接→存盘前还原。预发布/内部构建可能不发布符号→找构建工件或运行时包里的未剥离 .so/.so.dbg。多库多 BuildId 分别下载。LLVM 14+ 保证 DWARF 兼容。

**验证**：debug 文件 not stripped；至少一个 .NET 帧解析出函数名；路径含 `mono/metadata/`、`mono/mini/` 等可识别结构。**停止信号**：无 .NET 帧→报告解析结果停；全部解析→呈现回栈，不追进源码、不尝试构建/调试运行时；404→每 BuildId 一次即停，报未符号化帧。

## 2. Apple .ips（Mach-O UUID + dSYM + atos）

**输入**：`.ips`（iOS 15+/macOS 12+ JSON 格式）、`atos`（Xcode CLT）、可选连接设备取日志。

**格式门禁**：第一行必须是合法 JSON。**非 .ips（Android tombstone、旧版 `.crash` 文本）立即停**——报告格式不符，不尝试任何符号化、不切换其他工具。

**解析**：两段式——行 1 metadata（app_name/bundleID/os_version/slice_uuid），其余合并为 crash 主体。关键字段：`usedImages[N]`（name/base 加载地址/uuid/arch）、`threads[N].frames[M]`（imageOffset+imageIndex；帧地址=`base+imageOffset`）、`exception.type/signal`、**`asi`**（常含托管异常类型与消息，根因可能直接可见）、`lastExceptionBacktrace`、`faultingThread` 索引。坑：部分文件有大小写冲突重复键 `vmRegionInfo`/`vmregioninfo`，解析前重命名小写者；`asi` 可能缺失。

**库识别**：`libcoreclr`/`libmonosgen-2.0`/`libSystem.Native` 等以 `.framework` 交付，名字可能无 `.dylib` 后缀→**子串匹配**；应用二进制可能在 usedImages 出现两次不同 UUID。桥函数：`xamarin_process_managed_exception`（托管异常转 NSException）、`xamarin_main`、`mono_jit_exec`、`coreclr_execute_assembly`。NativeAOT 同 Android：运行时在 app 二进制内，`libSystem.*` 独立。macOS 共享框架安装时镜像路径可能带版本号；iOS 路径在 bundle 内无版本→靠 UUID 匹配 SDK packs/符号服务器推断。

**解读顺序**：先 `asi` → 崩溃线程（先解释 #0/#1 再谈其他）→ `lastExceptionBacktrace`。跨线程上下文（GC/线程池）只用于验证不作因果证据。

**dSYM 定位**（按序）：① 符号服务器自动下载 `.dwarf`：`https://msdl.microsoft.com/download/symbols/_.dwarf/mach-uuid-sym-{UUID小写无横线}/_.dwarf`，转 bundle：`mkdir -p libcoreclr.dSYM/Contents/Resources/DWARF && cp _.dwarf .../DWARF/libcoreclr`；② 构建输出 `bin/Debug/net*-ios/ios-arm64/<App>.app.dSYM/`；③ SDK packs `Microsoft.NETCore.App.Runtime.<rid>`；④ NuGet 缓存同包；⑤ `dotnet-symbol --symbols -o out <dylib>`。**始终 `dwarfdump --uuid` 与日志 UUID 精确核对**。

**符号化**：
```bash
atos -arch arm64 -o X.dSYM/Contents/Resources/DWARF/binary -l <usedImages.base> <addr1 addr2 ...>
```
`-o` 指 bundle **内部** DWARF 文件；arch 取 `usedImages[].arch`（常 arm64，可能 arm64e）；一次传多地址批处理。剥 `/__w/1/s/` 前缀。

**脚本**：`pwsh "$SKILL_DIR/scripts/Symbolicate-Crash.ps1" -CrashFile MyApp.ips`（自动解析/找 dSYM/下载/符号化）。先 `-ParseOnly` 快速概览（不需 atos）。旗标：`-CrashingThreadOnly`/`-OutputFile`/`-SkipVersionLookup`/`-SkipSymbolDownload`/`-SymbolCacheDir`/`-DsymSearchPaths`。

**取设备日志**：`idevicecrashreport -e /tmp/crashlogs/`（libimobiledevice）后按名找 `.ips`；或 Xcode > Devices and Simulators > View Device Logs；Mac Catalyst `~/Library/Logs/CrashReporter/`；macOS `~/Library/Logs/DiagnosticReports/`。

**验证**：UUID 匹配；至少一帧解析出函数名；路径含 `src/coreclr/`、`mono/metadata/` 结构。**停止信号**：dSYM 缺失/UUID 不匹配→报未符号化帧+UUID+地址，建议找回原始构建工件；atos 不可用→给出手工命令，**不装 Xcode**；全部解析→呈现回栈+简要崩溃分析（崩溃线程/异常类型/疑似区域），用户要深挖才继续。
