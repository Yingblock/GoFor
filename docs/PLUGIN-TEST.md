# 删除任意插件后的运行测试

构建期插件在 `plugins/<name>`，由 `@gofor/plugins` 的生成注册表汇总。
删掉一个目录后不能直接 `pnpm build`：pnpm 会在 script 之前校验 workspace 依赖，
先报 `no package named gofor-plugin-*`。用下面的脚本绕过 pnpm 的预校验。

## 步骤

```bash
# 1. 完整目录时先安装（删除插件前）
pnpm install

# 2. 删掉任意一个插件目录，例如
rm -rf plugins/checkin

# 3. 同步注册表 + 直接调 Vite 构建
./plugin-test.sh
# Windows: plugin-test.cmd
# 或：node tools/plugin-test.mjs

# 4. 预览（默认 4174，避免和常驻 4173 冲突）
PORT=4174 ./plugin-test.sh --preview
```

## 预期

- 侧栏不再出现该插件的页面，其余页面正常；
- 打印预览会提示缺失该插件拥有的区块（不会画空框）；
- 扫描回填缺该 handler 时不写库、不标 applied；
- 插件数据不删；恢复目录后重新构建即可回来。

恢复：

```bash
# 把目录放回 plugins/<name>
node tools/sync-plugin-registry.mjs
pnpm install   # 重新链接 workspace 包
pnpm build
```

## 原理

`tools/sync-plugin-registry.mjs` 扫描仍然存在的 `plugins/*/src/index.ts`，重写：

- `packages/plugins/src/index.ts` 的 import 与 `BUILTIN_PLUGINS`；
- `packages/plugins/package.json` 的 `gofor-plugin-*` workspace 依赖。

`tools/plugin-test.mjs` 只调用 node + Vite 二进制，不经过 pnpm 的依赖校验。
