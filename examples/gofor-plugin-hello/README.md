# gofor-plugin-hello

GoFor 运行时插件 v2 示例：页面 + 主题 + 插槽 + 数据契约 + 扫描 handler。**这个目录不是 monorepo 的 workspace 成员**，有自己的
`package.json` 与锁文件，演示第三方插件的物理形态。

## 结构

```
package.json       插件清单在 gofor 字段（id / main / apiVersion / capabilities / renderer）
tsconfig.json      只编译主进程入口；Node 20 的 require 需要 CommonJS
src/index.ts       activate 注册一个命令 + 一个视图插槽
renderer.mjs       渲染进程入口（ESM）：HelloScreen / 主题 / data / scanHandlers / 插槽组件
dist/index.js      pnpm build 产物（gofor.main 指向它）
```

## 本地试装

```bash
# 1. 构建入口（需要先有 @gofor/contracts）
pnpm install
pnpm build

# 2. 装进 GoFor 的插件目录（GoFor 的 userData/plugins）
cd "<userData>/plugins"
pnpm add /absolute/path/to/examples/gofor-plugin-hello

# 3. 把包名写进 gofor.plugins.json（或走 gofor plugin add 的正规包名）
#    { "enabled": ["gofor-plugin-hello"] }

# 4. 重启 GoFor，或在应用内调用 reloadPlugins()
```

`gofor plugin add` 只接受 `gofor-plugin-*` 包名，所以本地 `file:` 试装要手动
`pnpm add` 再改 enabled。示例的 `@gofor/contracts` 用 `file:` 指向仓库里的契约包；
正式发布时改成 `^0.1.0`，然后：

```bash
gofor plugin add gofor-plugin-hello
```

## 约定

- 入口导出 `activate(api)`，可选 `deactivate(api)`；不能 import Dexie/core 内部模块。
- 主进程的 `registerViewSlot(slotId, component)` 只登记元数据；组件由渲染进程按
  `gofor.renderer` 懒加载，导出名必须等于 `component.displayName`（或 `component.name`）。
- 能力必须声明：`command` / `view-slot` / `print-template`，注册未声明的能力会激活失败。
