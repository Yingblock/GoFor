// 预加载脚本：只暴露插件系统需要的三个频道 + 任务桥，不暴露 ipcRenderer 本身。
const { contextBridge, ipcRenderer } = require('electron');

const PLUGIN_CHANNELS = new Set([
  'gofor:plugins:snapshot',
  'gofor:plugins:reload',
  'gofor:plugins:run-command',
]);

contextBridge.exposeInMainWorld('goforPluginHost', {
  invoke(channel, ...args) {
    if (!PLUGIN_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`不允许的 IPC 频道：${String(channel)}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /** 监听主进程的任务请求；返回取消订阅函数。 */
  onTaskRequest(handler) {
    if (typeof handler !== 'function') throw new TypeError('handler 必须是函数');
    const listener = (_event, request) => handler(request);
    ipcRenderer.on('gofor:tasks:request', listener);
    return () => ipcRenderer.removeListener('gofor:tasks:request', listener);
  },

  /** 回任务请求的结果；频道名由主进程在请求里给出。 */
  sendTaskResult(resultChannel, message) {
    if (typeof resultChannel !== 'string' || !resultChannel.startsWith('gofor:tasks:result:')) {
      throw new Error('非法的任务结果频道');
    }
    ipcRenderer.send(resultChannel, message);
  },
});
