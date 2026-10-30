# AGENTS.md

> 任何 AI 助手在动手前先读这个文件，再读 `docs/STATE.md`。
> 如果本文件与代码冲突，以本文件为准并提请修改本文件。

## 0.思考语言、回复语言均使用简体中文。

## 1. 使用子代理提高效率

对用户的请求，主session负责把请求拆分为可同时处理的部分分别委派给子代理处理，对于子代理的提交产物，同样新开子代理进行验收。主session仅负责协调各子代理工作和向用户汇报。

子代理委派模板：
```
目标：一句话说清交付物（文件路径 / 退出码 / 验证结论）
环境：JAVA_HOME / ANDROID_HOME / 代理变量 等
允许：可以做哪些操作
禁止：不要改哪些文件、不要 commit、不要重启哪个进程
超时兜底：等多久算失败、失败后要报告什么
报告：期望的字段列表（不要贴长篇日志）
```

## 2. 项目详情

GoFor —— 面向中国高中生的离线优先学习辅助工具。
**纸是主输入端**：每日闭环在纸上完成，屏幕只做"拍照回填"和"每周收银"。

## 技术栈

- TypeScript strict，pnpm workspaces
- React + Vite + Tailwind CSS，UI 用 shadcn 风格（复制到仓库，不安依赖）
- 本地存储 Dexie (IndexedDB)；不要引入 Redux
- 测试 Vitest + Playwright
- 格式化/检查 Biome（`pnpm check`）
- 后端（远期）Hono + SQLite

## 目录

```
apps/web          PWA 宿主（Vite + React）
packages/core     纯领域逻辑：零 UI、零平台 API、零副作用
                  子路径：./config（配置+zod）、./print（版式）、./paper（时间解析）、./domain
packages/store    Dexie 实现（浏览器专用，v1→v8），实现了 core 里的仓储接口；另有内置数据 provider 与备份切片
packages/ui       跨宿主组件（token 样式，19 个组件）
packages/vision   纯图像算法：灰度/Otsu/二值化/单应透视矫正/墨迹占比/找纸/定位点（零依赖，46 测试）
packages/plugin-api  插件契约（manifest / 权限 / 生命周期 / 页面·命令·插槽·主题·数据·内容模块·转换器 / 扫描回填 / OCR·AI）
                   **不依赖 React**：组件用结构类型 `PluginComponent`，宿主再转 ComponentType
packages/plugin-kit  插件与宿主共享的时钟 / 日期 / 打印模板解析 / `useHostData`（只依赖页面 props）
packages/plugins  现有全部功能插件与视图（npm workspace 包 `@gofor/plugins`），按插件子目录组织
e2e/              真实浏览器冒烟（Playwright），产物在 e2e/out/（已 ignore）
docs/             STATE / WORKFLOW / ROADMAP / DESIGN / LATER / DECISIONS / PLUGINS / STANDARD / DESIGN-SYSTEM / Phase-note
```

## 3.整洁性：
 - 填写任何表单/文件均简明扼要，用最少字数精准指出规范/要求，不写废话
 - 开工前先阅读/docs/STANDARD.md并按其要求进行处理
 - 完成修改后及时更新涉及的文档





