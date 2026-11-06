# 互操作与性能：P/Invoke + SIMD 向量化

蒸馏自源技能 `dotnet-pinvoke` 与 `vectorization`。

## 一、P/Invoke / LibraryImport（dotnet-pinvoke）

从 .NET 调用 native C/C++ 库。覆盖 `DllImport`（.NET Framework 1.0+）与 `LibraryImport`（源生成，.NET 7+）。目标为 .NET Framework 时只能用 `DllImport`；.NET 7+ 新代码优先 `LibraryImport`；需要 native AOT 时 `LibraryImport` 是唯一选项。不用于 COM interop、C++/CLI 混合模式。

**裁剪信号**：单函数只做步骤 1-3；未经要求不迁移 DllImport→LibraryImport；非 Win32 不推荐 CsWin32；native API 不需要函数指针就不生成回调；评审请求用检查清单、不重写可用代码。

**输入**：native 头文件或文档（文档与头文件冲突时**永远信头文件**）、目标框架、目标平台、内存所有权契约（谁分配谁释放）。

### 1. 选 DllImport 还是 LibraryImport

| 方面 | `DllImport` | `LibraryImport`(.NET 7+) |
|---|---|---|
| 机制 | 运行时 marshal | 源生成（编译期） |
| AOT/裁剪安全 | 否 | 是 |
| 字符串 marshal | `CharSet` 枚举 | `StringMarshalling` 枚举 |
| 可用性 | .NET Framework 1.0+ | 仅 .NET 7+ |

### 2. 危险类型映射（多数 bug 来源）

| C/Win32 类型 | .NET 类型 | 原因 |
|---|---|---|
| `long` | **`CLong`** | Windows 32 位、64 位 Unix 64 位；配 `LibraryImport` 需 `[assembly: DisableRuntimeMarshalling]` |
| `size_t` | `nuint`/`UIntPtr` | 指针宽；.NET 8+ 用 `nuint`。绝不用 `ulong`（32 位栈损坏） |
| `BOOL`(Win32) | `int` | 4 字节，不是 `bool` |
| `bool`(C99) | `[MarshalAs(UnmanagedType.U1)] bool` | 必须指定 1 字节 |
| `HANDLE`/`HWND` | `SafeHandle` | 优先于裸 `IntPtr` |
| `LPWSTR`/`wchar_t*` | `string` | Windows UTF-16；跨平台避免（非 Windows 上 wchar_t 常为 UTF-32） |
| `LPSTR`/`char*` | `string` | 必须指定 ANSI 或 UTF-8 |

绝不用 `int`/`long` 映射 C `long`；绝不裸用 `bool` 不加 `MarshalAs`。

### 3. 写声明

```csharp
[LibraryImport("mylib", EntryPoint = "process_records")]
internal static partial int ProcessRecords(
    [In] Record[] records, nuint count, out uint outProcessed);
```

调用约定只在 Windows x86（32 位，Cdecl 与 StdCall 有别）需要显式指定；x64/ARM/ARM64 单一约定无需属性。检测到 win-x86 目标（`<PlatformTarget>x86</PlatformTarget>`、rid 等）时提醒开发者显式声明。托管名与 native 导出名不同必须给 `EntryPoint`。

### 4. 字符串

- 没有安全默认编码；绝不依赖 `CharSet.Auto`。
- Windows API 永远用 `W`（UTF-16）变体；跨平台 C 库通常 UTF-8（`StringMarshalling.Utf8` / `UnmanagedType.LPUTF8Str`）。
- 输出缓冲不要引入 `StringBuilder`。
- marshal 的字符串调用返回后即释放；native 存了指针就要手动管理生命周期（Windows/.NET Framework 首选 `CoTaskMemAlloc/Free`；非 Windows 用 `NativeMemory`；库自带分配器则必须用它的）。

### 5. 内存所有权（恰好一方拥有，双方一致）

- **模型 1 调用方分配、调用方释放（最安全）**：`Span<byte> buffer = stackalloc byte[256]` 传入。
- **模型 2 被调方分配、调用方释放（Win32 常见）**：必须用库自己的 free 函数（如 `FreeString(ptr)`），`finally` 中释放。
- **模型 3 句柄式**：`SafeHandle`。
- 绝不用 `Marshal.FreeHGlobal/FreeCoTaskMem` 释放 `malloc` 内存 = 堆损坏。
- 固定托管对象：同步用 `fixed`；异步/被 native 存指针用 `GCHandle.Alloc(..., Pinned)`，native 完成前保持固定再 `Free()`。

### 6. SafeHandle（不可协商）

裸 `IntPtr` 异常时泄漏且无双释放保护。继承 `SafeHandleZeroOrMinusOneIsInvalid`，保留无参 `private` 构造（marshal 基础设施需要），`ReleaseHandle()` 调库销毁函数，用法 `using var handle = ...`。

### 7. 错误处理

native 契约要求 OS last-error 时设 `SetLastError = true`，用 `Marshal.GetLastPInvokeError()` 取（`throw new Win32Exception(...)`）。HRESULT API 用 `Marshal.ThrowExceptionForHR(hr)`。

### 8. 回调

- **.NET 8+ 首选 `UnmanagedCallersOnly`** + `delegate* unmanaged<...>`：方法须 `static`、不得向 native 抛异常、参数仅 blittable。
- 旧 TFM/需实例状态：委托 + `UnmanagedFunctionPointer`（仅 Windows x86 需要），委托**必须**存静态字段防 GC 回收——native 存了函数指针而委托被回收 = 崩溃。
- `Marshal.GetFunctionPointerForDelegate` 后指针不 root 委托，native 调用完成前用 `GC.KeepAlive(callback)`。

### 跨平台库加载

简单场景：库名写裸名（默认约定自动加前缀/扩展 → mylib.dll / libmylib.so / libmylib.dylib）。OS 特定 TFM（`net8.0-windows`）才定义了 `WINDOWS/LINUX/MACOS` 符号可用 `#if`；可移植 TFM 用运行时解析器：`NativeLibrary.SetDllImportResolver` + `OperatingSystem.IsWindows()/IsMacOS()`（netstandard 用 `RuntimeInformation.IsOSPlatform`）。

### 迁移 DllImport→LibraryImport（.NET 7+，AOT/裁剪需要时）

1. 类加 `partial`，方法改 `static partial`；2. 换属性；3. `CharSet`→`StringMarshalling`；4. 保留 `SetLastError`；5. 非 x86 删 `CallingConvention`；6. 修 `SYSLIB1054`–`SYSLIB1057`。开启 `<EnableTrimAnalyzer>true</EnableTrimAnalyzer>`、`<EnableAotAnalyzer>true</EnableAotAnalyzer>`。

### 工具

Win32 优先 `Microsoft.Windows.CsWin32`（`NativeMethods.txt` 源生成正确签名）；WinRT 用 CsWinRT；Objective-C 绑定用 Objective Sharpie。

### 评审检查清单

- [ ] 每个签名与头文件逐类型/尺寸一致
- [ ] Windows x86 才指定调用约定
- [ ] 字符串编码显式，无 `CharSet.Auto`
- [ ] 内存所有权有文档且匹配（谁分配/谁释放/用什么分配器）
- [ ] 所有 native 句柄用 `SafeHandle`，无裸 `IntPtr` 逃逸
- [ ] 回调委托被 root
- [ ] 需要 last-error 时 `SetLastError=true`
- [ ] 结构布局匹配 native（packing/对齐/字段序）
- [ ] 跨平台 C `long` 用 `CLong/CULong`（配 LibraryImport 需 DisableRuntimeMarshalling）
- [ ] 无裸 `bool`（显式 `UnmanagedType.Bool` 或 `U1`）

可运行验证：开分析器构建零 SYSLIB 警告；每个跨界结构断言 `Marshal.SizeOf<T>()` == native `sizeof`；已知输入 round-trip 测试；非 ASCII 字符串测编码。

## 二、SIMD 向量化（vectorization）

产出可移植优化：保持标量契约、任何长度内存安全、用测量结果证明复杂度值得。先读官方 SIMD 指南（learn.microsoft.com/dotnet/standard/simd），用其自包含分宽度 dispatch/small-input/loop/remainder 模板，不要退化成宽度检查链。

### 核心规则

1. **用匹配契约的最高层 API 然后停下**：`Span<T>`/`string` 操作、`TensorPrimitives`、张量类型已加速很多操作；LINQ `Sum/Min/Max/Average` 在源暴露底层 span 时也会加速。写显式循环前先点名考虑过哪些框架 API 及为何不适用。
2. **新显式 SIMD 从 `Vector128<T>` 起步**（最宽硬件集上被加速），仅测量支持时才加更宽路径。
3. **平台一致**：优先固定宽度向量类型上的跨平台操作（自动 lower 到目标指令，如 `(v & mask) == Vector128<byte>.Zero` → x86 `ptest`）；架构特定 intrinsics 只用于实测差距，用 `IsSupported` 守卫并保留等价可移植/标量行为。
4. **直接读 `IsHardwareAccelerated`/`IsSupported`/`Count`**：JIT 当常量，缓存无益且掩盖被消除的分支。
5. 位运算与比较混用时加括号显式优先级。

仅评审时不重写代码；先报正确性与内存安全缺陷，再报性能机会。

### 编写检查清单

- **契约**：先明确空/短输入、重叠、溢出、NaN、带符号零、顺序、异常行为。
- **框架门**：查 TFM 与现有包引用，编译/探测最高层候选 API；小契约适配器不值得重实现。
- **结构**：先 `Vector128<T>` + 标量；测量后才加 `Vector512`→`Vector256`→可选 `Vector<T>`→`Vector128`→标量。每个外层宽度守卫只查自己的 `IsHardwareAccelerated`（泛型元素再查 `IsSupported`），块内长度 ≥ `Count` 走宽度专用 helper，否则走 small-input helper 后返回——不要把长度检查放外层再向窄宽度重复 dispatch。
- **加载/存储**：优先 span 式 `Vector128.Create(span)`/`CopyTo`（JIT 高效、免 pin）；确需按引用走缓冲时用元素偏移 `LoadUnsafe(ref T, nuint)`/`StoreUnsafe`，不用指针。
- **空输入**：起始引用用 `MemoryMarshal.GetReference(span)`/`GetArrayDataReference(array)`，不要索引元素 0。
- **不支持的元素类型**：固定宽度向量只支持基元数值类型，无 `char`/`bool`；用 `MemoryMarshal.Cast`/`As<TFrom,TTo>` 重解释（只改类型不改位）；布尔保持 0/1、字符保持合法 UTF-16，必要时存储前归一。
- **偏移**：证明输入含完整向量后才减 `Count` 或转 `nuint`，否则负值变巨大无符号偏移。
- **托管引用**：不得形成 span 起点前/终点后（含 one-past-end）的引用；保持基引用在范围内，用元素偏移遍历。
- **尾部**：覆盖 0、`Count-1`、`Count`、`Count+1` 及各宽度非倍数。满一个向量后重处理最后完整向量保持向量化：幂等操作直接折叠重叠；非幂等必须用 `ConditionalSelect` 把重复 lane 换成操作单位元再折叠。原地变换先保留原始尾部值再重叠存储。
- **缓冲重叠**：选遍历方向或 staging 策略防止存储破坏未加载值。
- **数值行为**：浮点重结合、NaN/带符号零、checked/unchecked 溢出、字节序。`Native`/`Estimate` 操作会放宽精度/IEEE 边界，仅契约允许且测量支持时用。

```csharp
// 原地逐元素变换的内层安全循环（dispatch 已确认至少一个完整向量）
Span<int> tail = data.Slice(data.Length - Vector128<int>.Count);
Vector128<int> end = Vector128.Create<int>(tail);
Span<int> remaining = data;
while (remaining.Length >= Vector128<int>.Count)
{
    Vector128<int> values = Vector128.Create<int>(remaining);
    Transform(values).CopyTo(remaining);
    remaining = remaining.Slice(Vector128<int>.Count);
}
if (!remaining.IsEmpty)
{
    Transform(end).CopyTo(tail);
}
```

只读归约：主循环后加载同一末段 span，用 `ConditionalSelect` 把已处理 lane 换成单位元。不要为省边界检查换 `LoadUnsafe`/标量尾巴。

### 测试清单

- 跨边界长度、随机值、空输入、支持的重叠、数值边界与标量契约对比；每个实现宽度和标量路径都要有够大与过小输入。
- 每个宽度与标量回退在**独立进程**里跑：x86/x64 CoreCLR 上 `DOTNET_EnableAVX2=0` 关 AVX2、`DOTNET_EnableHWIntrinsic=0` 关硬件 intrinsics（进程级设置，勿在单元测试内改；对已 R2R/AOT 编译的代码无效，确认目标代码是 JIT 的）。
- 不安全加载/存储用 guard-page 边界测试（前向迭代页放缓冲后、后向放前），含非倍数长度；普通数组分配不能可靠暴露越界读。

### 基准

BenchmarkDotNet 测代表性小/大输入后才保留复杂度；同一轮对比标量、`Vector128<T>`、各更宽路径。小输入可能更慢（setup 主导）；加速很少达到理论向量宽倍数。更宽向量不自动更快。无法验证的路径要点名"未验证"，不得只凭默认硬件测试声称成功。

### 评审顺序

1. 标量契约等价（带符号零/NaN/溢出/字节序）→ 2. 是否复用既有加速 API → 3. 幂等/非幂等尾部正确性 → 4. 内存安全/无符号偏移/空输入/重叠缓冲 → 5. 可移植 dispatch 与行为等价回退 → 6. 强制每宽度与标量路径的测试 → 7. 证明显式 SIMD 与更宽路径的基准。
