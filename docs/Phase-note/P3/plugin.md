# P3 · 插件规则

> 总则、现有插件清单、数据契约与不变量在 `docs/PLUGINS.md` §8（机器可读 `PLUGIN_RULES`）。
> 本节只记 P3 落地时容易踩、且指南里没展开的阶段约束。

## 边界

- **功能页一律是插件**：番茄钟 / 作业 / 课表 / 打卡 / 扫描 / 五行为屏 / 单词库都在
  `packages/plugins/src/`，经 `registerScreen` 进侧栏、命令面板、`#/s/<id>`。
  新增功能页先问"能不能做成插件"，不要往 `App.tsx` 的 switch 加分支。
- **core 只保留**：应用外壳/首页布局、打印与模板/校准、扫描几何与坐标清单、数据与备份、插件管理。
  原因见 `DECISIONS/0006`（纸面契约 + 引导悖论），不要因为"顺手"把它们插件化。
- **插件可以 import core/store/ui/plugin-kit**（构建期受信代码），但跨插件只能走 `DataContract`；
  给第三方开 core 写能力必须先有 core 校验的 service facade，不能暴露 `db`。

## UI 扩展与命令

- **UI 只有三档，不给任意 DOM**：主题 token（只挂 `.screen-only`，纸面硬编码）、命名插槽 + shell 变体、
  作用域 CSS（宿主包 `@media screen { @scope }`）。涉及纸面颜色/尺寸的改动一律拒绝。
- **命令与快捷键只有一个注册表**（`HostCommand`）：命令面板、全局快捷键、冲突检测共用；
  冲突在插件目录列出，不静默覆盖；新增快捷键先跑 `findShortcutConflicts`。

## 契约与规则落盘

- **数据契约版本严格相等**（破坏性变更 +1，结构性变更换 id）；`revision()` 只作缓存键，用内容指纹。
- 机器可读 `packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`，人可读 `docs/PLUGINS.md` §8；
  新增/改插件必须同步（或保证规则由 manifest 推导）。
