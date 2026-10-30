## 存储约定

- **`liveQuery` 里只能只读**。任何写操作都会抛 `ReadOnlyError` 并白屏。
  需要「读+修复」的场景（如配置迁移）用 `currentConfigOrDefault`，且只在启动时调一次；
  运行期读用 `readConfig`。
- 打印层 `PrintLayer` 必须渲染在 `.screen-only` 之外，否则打印时被一起隐藏 → 白纸。
- **Dexie 的版本号一旦发布就冻结。** 新增表必须新开 `version(N+1)`，
  绝不能往已有版本的 `stores({...})` 里加一行——Dexie 只按版本号决定跑不跑升级，
  停在旧版本的浏览器库不会补建表，运行时会直接报「表不存在」。
- **新增表必须同时进 `BACKUP_SLICES`。** 备份（一键导出 JSON）和迁移都靠这张注册表，
  漏一张表意味着"备份成功、恢复少一半数据"。加了表就在 `store.test.ts` 补一条往返用例。
  `exportAll` / `importAll` 不许再写死表名（P1 就漏过 5 张表）。
- **数据只在本机时，任何"新存一类东西"的功能都要想一遍丢了怎么办。**
  现在的兜底是：启动时 `navigator.storage.persist()`、`backup.reminderDays` 到了提醒备份、
  导入导出有 e2e 覆盖。详见 `docs/DESIGN.md` §15。