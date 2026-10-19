# GoFor 设计系统（Tailwind v4 CSS-first）

> 状态：第一阶段（token + `@gofor/ui` + 共享组件/首页迁移）。
> 后续屏幕迁移时先读这份文档；规则与 `AGENTS.md` 硬性规则 11 配套。

## 1. 为什么没有 `tailwind.config.js`

项目用 **Tailwind CSS v4**，配置方式是 **CSS-first**：

- 设计 token 全部写在 `apps/web/src/styles.css` 的 `@theme` 块里；
- v4 **不会读取** `tailwind.config.js`（JS 配置是 v3 的机制），新建它等于写了一份被忽略的文件；
- 需要扩展扫描范围时用 `@source` 指令（见 §2.3），不是 `content` 数组；
- 自定义动画 keyframes 也写在 `@theme` 里。

所以「严格配置」这件事在本仓库的落点是：**`styles.css` 的 `@theme` + `@gofor/ui` 组件**，
不是一份 JS 配置文件。

## 2. Token 清单（`apps/web/src/styles.css`）

所有 token 都由 `@theme` 生成同名工具类，例如 `--radius-lg` → `rounded-lg`，
`--shadow-card` → `shadow-card`，`--duration-fast` → `duration-fast`。

### 2.1 颜色

| Token | 值 | 用途 / 生成的类名 |
|---|---|---|
| `--color-ink` | `oklch(0.26 0.03 260)` | 主文字、主按钮（`text-ink` / `bg-ink`） |
| `--color-paper` | `oklch(0.975 0.006 90)` | 页面底色（`bg-paper`） |
| `--color-accent` | `oklch(0.55 0.13 255)` | 焦点描边、强调（`outline-accent`） |
| `--color-muted` | `oklch(0.62 0.02 260)` | 次要文字 |
| `--color-line` | `oklch(0.26 0.03 260 / 0.1)` | **统一描边**（`border-line` / `divide-line`） |
| `--color-danger` | `oklch(0.55 0.19 27)` | 错误、危险操作（`text-danger` / `bg-danger/10`） |
| `--color-ok` | `oklch(0.58 0.13 155)` | 成功、已完成（`text-ok`） |
| `--color-warn` | `oklch(0.68 0.14 75)` | 提醒（`text-warn`） |

透明度用 Tailwind 的修饰符：`bg-danger/10`、`hover:bg-ink/90`。

### 2.2 圆角

只保留 4 档实际使用 + `full`。旧代码里的 `rounded` / `rounded-lg` / `rounded-xl` 统一到：

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | `0.25rem` | 极小标签 |
| `--radius-md` | `0.5rem` | 按钮、输入框 |
| `--radius-lg` | `0.75rem` | 卡片、列表、弹层（与旧 `rounded-xl` 视觉一致） |
| `--radius-xl` | `1rem` | 大弹层（少用） |
| `--radius-2xl` | `1.25rem` | 少用 |
| `--radius-full` | `9999px` | 胶囊/圆点 |

### 2.3 阴影

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-card` | `0 1px 2px oklch(0.26 0.03 260 / 0.05)` | 卡片默认，几乎看不见的一层 |
| `--shadow-pop` | `0 12px 32px … / 0.14, 0 2px 8px … / 0.06` | 浮层、模态、命令面板 |
| `--shadow-none` | `0 0 #0000` | 明确去掉阴影 |

**不要再用** `shadow-sm/md/lg/2xl`（Tailwind 默认那套对纸感界面太重）。

### 2.4 动效

| Token | 值 |
|---|---|
| `--duration-fast` | `120ms` |
| `--duration-base` | `180ms` |
| `--duration-slow` | `260ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` |

`duration-*` 工具类实际读取 `--transition-duration-fast/base/slow`，已转接到上面的
`--duration-*`（所以 `duration-fast` 可用，语义仍只有一份）。

进场动画：`animate-fade-in`（遮罩）、`animate-pop-in`（浮层/模态）。

**`prefers-reduced-motion: reduce`**：`styles.css` 里统一把过渡/动画时长压到
`0.01ms`、`scroll-behavior: auto`，并把 `--duration-*` 归零。组件不需要各自写降级。

### 2.5 字号

| Token | 值 | 用途 |
|---|---|---|
| `--text-title` | `1.125rem` (18px) | 错误页/弹层标题 |
| `--text-section` | `0.875rem` (14px) | 区块标题（`Section` 的 h2） |
| `--text-body` | `0.875rem` (14px) | 正文、列表、按钮 md |
| `--text-small` | `0.75rem` (12px) | 次要文字、按钮 sm |
| `--text-caption` | `0.6875rem` (11px) | 说明、元信息 |
| `--text-micro` | `0.625rem` (10px) | 最小注脚 |
| `--text-metric` | `1.25rem` (20px) | 统计数值 |

禁止再写 `text-[11px]`、`text-[10px]` 这类裸像素；新增字号先进 `@theme`。

### 2.6 间距（语义）

| Token | 值 | 用途 |
|---|---|---|
| `--spacing-gutter` | `1rem` | 页面左右留白 |
| `--spacing-section` | `2rem` | 区块之间 |
| `--spacing-card-x` | `1rem` | 卡片水平内边距 |
| `--spacing-card-y` | `0.75rem` | 卡片垂直内边距 |

说明：v4 的 `p-*`/`gap-*` 仍按 `--spacing` 的 4px 刻度生成，语义间距 token 用于
自定义 CSS / 文档约定；常规布局继续用 `p-3`、`gap-3` 这种刻度。

## 3. `@gofor/ui` 组件清单

包位置：`packages/ui`（`workspace:*`，入口 `packages/ui/src/index.ts`）。
一律从包根导入：

```ts
import { Button, Card, Section, StatCard } from '@gofor/ui';
```

| 文件 | 导出 | Props 摘要 |
|---|---|---|
| `button.tsx` | `Button`, `ButtonVariant`, `ButtonSize` | `variant: primary/secondary/ghost/danger`（默认 secondary）、`size: sm/md`（默认 sm）；原生 button 属性；默认 `type="button"` |
| `icon-button.tsx` | `IconButton` | `aria-label` **必填**；`size: sm/md`；仅图标 |
| `card.tsx` | `Card`, `CardTone`, `CardPadding`, `CardElevation` | `as: div/section`、`tone: default/solid/success/danger`、`padding: none/sm/md`、`elevation: none/card/pop` |
| `section.tsx` | `Section` | `title`（h2）、`actions`（右侧操作）、`description`、`as` |
| `field.tsx` | `Field` | `label`、`hint`、`error`、`required`；自动生成 id 并给控件加 `aria-describedby` / `aria-invalid` |
| `input.tsx` | `Input` | `variant: default/flush`（flush 给命令面板）、`invalid`、`ref` |
| `select.tsx` | `Select` | 原生 select + `invalid`、`ref` |
| `textarea.tsx` | `Textarea` | 原生 textarea + `invalid`、`ref` |
| `checkbox.tsx` | `Checkbox` | 原生 checkbox + `invalid`；必须有 `aria-label` 或 `Field` label |
| `badge.tsx` | `Badge` | `tone: neutral/ok/warn/danger`，只读状态 |
| `chip.tsx` | `Chip` | `onClick`（可点，带 `aria-pressed`）、`onRemove`（可移除）、`active`、`disabled` |
| `stat-card.tsx` | `StatCard` | `label` / `value` / `note` |
| `modal.tsx` | `Modal` | `open`、`onClose`、`title`、`footer`、`size`、`closeLabel`；Esc 关闭、关闭后焦点回到触发元素、`role="dialog"` |
| `progress-bar.tsx` | `ProgressBar` | `value` 0–1（自动夹取）、`label`（aria-label） |
| `empty-state.tsx` | `EmptyState` | `title`/`description`/`action`/`children`、`size: sm/md`（虚线框） |
| `divider.tsx` | `Divider` | 水平分隔线（`border-line`） |
| `cn.ts` | `cn`, `focusRing` | 自定义样式时拼接类名 / 统一键盘焦点环 |

## 4. 迁移规则

1. **新代码必须用 `@gofor/ui`。** 不要在屏幕里重新手写按钮、卡片、弹层、表单控件。
2. **必须自定义时，优先复用现有类名**：
   - 描边 `border-line`、分隔 `divide-line`
   - 圆角只用 `rounded-sm/md/lg/full`
   - 阴影只用 `shadow-card` / `shadow-pop` / `shadow-none`
   - 字号只用 §2.5 的 `text-*`
   - 动效 `transition duration-fast ease-standard`（或 `duration-base`）
   - 焦点环复用 `focusRing`
3. **禁止**：`text-[Npx]`、`border-black/[0.0x]`、`shadow-2xl`、裸 `#hex`/`oklch(...)`
   写进 `className`（token 已经覆盖）。
4. 需要新 token 时改 `apps/web/src/styles.css` 的 `@theme`，并在本文档补一行。
5. **不要动 e2e 依赖的文本/aria-label**（「拍照录入」「打印 checklist」「数据只在这台设备上」
   「立即备份」「从备份导入」「今日课表」「打卡提示」「完成 xxx」等）。迁移只换样式类。
6. 组件位于 `packages/ui` 时，Tailwind 扫描不到 pnpm 软链接包 → 已在 `styles.css` 用
   `@source "../../../packages/ui/src"` 显式纳入；新增 UI 包位置时同样要加 `@source`。

### 迁移示例

```tsx
// 旧：每处手写一套
<section>
  <h2 className="mb-3 text-sm font-medium opacity-50">统计</h2>
  <div className="rounded-xl border border-line bg-card-soft px-4 py-3">…</div>
</section>

// 新：组件 + token
<Section title="统计">
  <Card>
    <StatCard label="今日作业" value={`${done}/${tasks.length}`} />
  </Card>
</Section>
```

## 5. 当前迁移状态

**全部迁移完成（2026-10-20）**：`apps/web/src` 与 `packages/ui/src` 不再用
`bg-white*` / `border-black*` / `text-black` 这类原生色；统一走 `@theme` token
（`bg-card` / `bg-card-soft` / `border-line` / `bg-overlay` / `bg-strong` / `text-on-strong` / `bg-scrim`）。
新增页面照抄现有组件即可，不需要再逐个迁移。

## 6. 深色主题（P2-2.16）

- 三态：跟随系统 / 浅色 / 深色；存在 `localStorage['gofor.ui.theme']`，
  入口在侧栏底部（折叠态只留图标）。
- 实现只改 `<html data-theme="light|dark">`，颜色全在 `styles.css`：
  `:root[data-theme="dark"]` 覆盖同一批 `--color-*` 变量；组件不感知主题。
- 新增颜色时**先加 token**，再在浅色与深色两处各写一次，禁止在组件里写死颜色。
- 语义色约定：
  | token | 用途 |
  |---|---|
  | `ink` / `paper` | 正文前景 / 应用背景 |
  | `card` / `card-soft` / `card-faint` | 实心卡片 / 半透明卡片 / 更淡的底 |
  | `line` / `line-strong` | 描边 / 选中描边 |
  | `strong` / `on-strong` | 实心按钮背景 / 其上的文字 |
  | `overlay` | 悬停、表头等淡底 |
  | `scrim` | 模态/抽屉遮罩 |
- **纸面不跟主题**：`.print-root` / `.print-page` 固定 `color:#111`，背景仍为白；
  深色下打印预览看起来仍是白纸黑字。
- 首屏在 `index.html` 内联脚本里先设好 `data-theme`，避免深色启动闪白。
