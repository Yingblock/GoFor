# 0019 — 打印模板由插件注册，core 不再内置模板

日期：2026-10-31
状态：**已实现**

## 决定

- `PluginContext.registerPrintTemplate(template)` 新增；需要 `print.template` 权限。
- `HostSnapshot.printTemplates` 汇总所有启用插件注册的模板。
- core 删除 `BUILTIN_TEMPLATES` / `CALIBRATION_TEMPLATE` / `paperFor(id)`；
  `materialize`/`layout` 仍是 core，但模板数据来自插件。
- `PrintTemplate` 增加 `density: 'day' | 'week'`，纸张密度不再靠模板 id 判断。
- 分配：
  - tasks：我的一天、本周计划、口袋卡、考试倒计时、校准页
  - checkin：打卡卡
  - mood：三格自评
  - timetable：今日课表
- 模板解析函数改为显式接收 `templates` 注册表：
  `resolvePrintTemplate(id, paper, templates, customs)`、
  `printTemplateChoices(templates, customs)`。
- App / PrintScreen / TemplateEditor / Scan 全部使用 `host.printTemplates`。
- 没有任何插件模板时显示“没有可用模板”，打印页为空，不回退到内置模板。

## 影响

- 禁用 tasks 后，属于 tasks 的 day/week/index/countdown/calibration 模板消失；
  checkin/mood/timetable 的模板仍可用。
- 所有模板数据仍由各插件自己注册，core 只做排版/校验。
- 外部插件 bridge 同步支持 `registerPrintTemplate`。

## 测试

核心模板测试使用 `templates.testFixtures.ts`（仅测试数据）；运行时不再有内置模板。
