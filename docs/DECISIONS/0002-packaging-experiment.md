# 0002 — 一次性打包试验：Electron 壳与 Capacitor 壳

日期：2026-xx
状态：**临时偏离已记录**（不是架构决定，用完即弃）
相关：`docs/DESIGN.md` §7.4「不做 Electron」、`docs/ROADMAP.md` P6「Android 原生」

## 背景

用户要求"把现在的安卓和 windows 应用打包出来看一下"，而当时的产物只有 PWA。

按 DESIGN §7 的原定方案：

- Windows → PWA（Edge/Chrome「安装此应用」），**不做 Electron**
- Android → PWA 先行，原生能力（Capacitor + Kotlin）排到 P6

也就是说，**原方案里此刻本来就没有 .exe 和 .apk**。为了满足"想看一眼真机上的应用"这个临时需求，这次做了两个壳。

## 决定

只做**最小可运行的壳**，明确不承担任何产品架构职责：

| 产物 | 实现 | 位置 |
|---|---|---|
| Windows 便携版 | Electron v33 + 内置 127.0.0.1 静态服务，加载同一份 `dist` | `tools/package-windows/` |
| Android APK | Capacitor 8 纯 WebView，**零原生插件** | `apps/web/android/` |

## 为什么两个壳都复用同一份 `dist`

这是唯一值得保留的经验：**"一个 web 产物 + 多个壳"这条设计真的能跑**。
桌面和安卓加载的是完全相同的 JS/CSS，没有任何分叉。后续加 Tauri 也只是第三个壳。

## 明确的后果与代价

- **Electron 不进产品架构**：它只是 `tools/` 下的一次性脚本，`pnpm` 依赖里没有 electron。
  正式桌面渠道仍是 PWA。
- **Capacitor 只做了壳**：没有 UsageStats、没有前台服务、没有 Widget、没有专注遮罩。
  P6 真正开始时，是在这个工程上加 Kotlin 插件，而不是重写。
- **APK 是 debug 签名**，只能自用；给别人装需要先决定签名密钥怎么保管。

## 什么时候该删掉 Electron 壳

满足任意一条就删：

1. Edge/Chrome 的 PWA 安装已经能满足日常使用
2. 决定做 Tauri 桌面版（那时它取代 Electron）
3. 距离上次使用超过一个月

## 何时升级 Capacitor 壳

只有当 P6 开始做原生能力时。在那之前，这个壳的价值仅限于"能在手机上点开"。

## 教训

文档写了「不做」，但用户直接要求时，正确做法是**做 + 记 ADR**，
而不是让代码和文档静默分叉。下次遇到同类情况，先写 ADR 再动手。
