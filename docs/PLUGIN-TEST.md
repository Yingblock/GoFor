# 删除任意插件后的运行测试

构建期插件在 `plugins/<name>`。`@gofor/plugins` 用 Vite 的 `import.meta.glob`
在构建时扫描这些目录，**没有静态 import 列表，也没有插件 workspace 依赖**：

- 删掉任意 `plugins/<name>` 后，直接 `pnpm build` 就少这个插件；
- 不需要手改 `packages/plugins/src/index.ts` 或 `package.json`；
- 不会再出现「漏删数组项 → `moodPlugin is not defined` → 整页黑屏」。

## 步骤

```bash
# 1. 完整目录时先安装（删除插件之前）
pnpm install

# 2. 删掉任意一个插件目录，例如
rm -rf plugins/mood

# 3. 直接构建
pnpm build

# 4. 预览（默认 4174，避免和常驻 4173 冲突）
cd apps/web && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174
```

也可以继续用 `./plugin-test.sh`（Windows: `plugin-test.cmd`）：它是纯 node + Vite 的直连构建，
在 pnpm 因其他原因做依赖预校验时仍可用。

## 预期

- 侧栏不再出现该插件的页面，其余页面正常；
- 打印预览会提示缺失该插件拥有的区块（不会画空框）；
- 扫描回填缺该 handler 时不写库、不标 applied；
- 插件数据不删；恢复目录后重新构建即可回来。

恢复：

```bash
# 把目录放回 plugins/<name>
pnpm build
```

## 原理

`packages/plugins/src/index.ts`：

```ts
const PLUGIN_MODULES = import.meta.glob('../../../plugins/*/src/index.ts', { eager: true });
```

按目录名排序后导出 `BUILTIN_PLUGINS`。`eager` 只是把模块并进 bundle；插件页面仍由
`registerScreen` 的 `load()` 懒加载。

注意：这 13 个仍是**构建期插件**（React 页面直接 import core/store/ui），和
`userData/plugins` 的运行时无头插件是两条平面，不能互相替代。
