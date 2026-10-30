# P3.8 core / domain 分层清理：文件去向

> 决策见 `docs/DECISIONS/0009`。

## 搬到 `@gofor/domain`（新包 `packages/domain`）

| 原位置 | 新位置 |
|---|---|
| `packages/core/src/timetable/` | `packages/domain/src/timetable/` |
| `packages/core/src/stats/` | `packages/domain/src/stats/` |
| `packages/core/src/habits/` | `packages/domain/src/habits/` |
| `PomodoroRun` 类型（原 `core/pomodoro/machine.ts`） | `packages/domain/src/pomodoro/index.ts` |

内部引用改为 `@gofor/core/config`、`@gofor/core/domain`；domain 只依赖 core。
消费者（`apps/web`、`@gofor/store`、checkin/checklist/diary/mood/report/timetable/pomodoro）
改 import 并加 `@gofor/domain` 依赖。

## 下沉到插件包

| 原位置 | 新位置 |
|---|---|
| `core/src/pomodoro/machine.ts` + test | `plugins/pomodoro/src/machine.ts` + test |
| `core/src/wellbeing/exercises.ts` + test | `plugins/toolbox/src/wellbeing.ts` + test |
| `core/src/content/wordbook.ts` + test | `plugins/wordbook/src/wordbook.ts` + test |

三个插件包加 `"test": "vitest run"` 与 vitest devDependency。

## `plugin-kit` 拆分

| 原位置 | 新位置 |
|---|---|
| `plugin-kit/src/format.ts` | `core/src/print/format.ts`（`todayLabel`） |
| `plugin-kit/src/printTemplate.ts` | `core/src/print/templateResolution.ts` |
| `plugin-kit/src/clock.ts` | 保留（调试时钟，`TODO(debug-clock)`） |
| `plugin-kit/src/useHostData.ts` | 保留（React hook，不能进 plugin-api） |

`apps/web/src/{format,print/template}.ts` 继续做兼容 shim，指向 `@gofor/core/print`。

## 结果

- `packages/core/src`：`config` / `domain` / `paper` / `plugin` / `print` / `scan`。
- 单测 574 不变：core 253 / domain 140 / store 48 / vision 46 / plugin-runtime 17 / CLI 12 / 插件包 58。
- web 产物不变：index 756KB、扫描 chunk 423KB、CSS 35KB。
