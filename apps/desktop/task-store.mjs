import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';

const REQUEST_CHANNEL = 'gofor:tasks:request';
const RESULT_PREFIX = 'gofor:tasks:result:';
const TIMEOUT_MS = 5000;

function waitForRenderer(win) {
  if (win.isDestroyed()) return Promise.reject(new Error('窗口已关闭'));
  if (!win.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      win.webContents.removeListener('did-finish-load', onLoaded);
      win.removeListener('closed', onClosed);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onClosed = () => {
      cleanup();
      reject(new Error('窗口已关闭'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('渲染进程未加载，无法读写任务'));
    }, TIMEOUT_MS);
    win.webContents.once('did-finish-load', onLoaded);
    win.once('closed', onClosed);
  });
}

/**
 * 主进程 → 渲染进程的请求/响应桥。
 *
 * 主进程读不到 IndexedDB，所以 TaskStore 只是转发：渲染进程收到
 * `gofor:tasks:request` 后做实际读写，再往同一条 requestId 的结果频道回包。
 * 协议与参考实现见 `apps/desktop/README.md` 与 `docs/PLUGIN-RUNTIME.md`。
 */
function request(win, kind, payload) {
  // 先等窗口加载完成再开始 5s 计时，否则冷启动会把"还没加载"误判成"没接线"。
  return waitForRenderer(win).then(
    () =>
      new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const resultChannel = `${RESULT_PREFIX}${requestId}`;
        const onResult = (_event, message) => {
          clearTimeout(timer);
          ipcMain.removeListener(resultChannel, onResult);
          if (message?.ok !== true) {
            reject(new Error(message?.error ?? '渲染进程返回的任务 IPC 失败'));
            return;
          }
          resolve(message.value);
        };
        const timer = setTimeout(() => {
          ipcMain.removeListener(resultChannel, onResult);
          reject(
            new Error(
              '渲染进程 5s 内没有响应任务 IPC；web 侧需要安装 runtimeBridge（见 docs/PLUGIN-RUNTIME.md）',
            ),
          );
        }, TIMEOUT_MS);

        ipcMain.once(resultChannel, onResult);
        win.webContents.send(REQUEST_CHANNEL, { requestId, resultChannel, kind, payload });
      }),
  );
}

export function createRendererTaskStore(getWindow) {
  return {
    async getTasks() {
      return await request(getWindow(), 'tasks:list', {});
    },
    async updateTask(id, patch) {
      await request(getWindow(), 'tasks:update', { id, patch });
    },
  };
}
