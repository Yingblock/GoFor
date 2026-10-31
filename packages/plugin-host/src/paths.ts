import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

/** 与 Electron `app.getPath('userData')` 对齐；插件宿主不依赖 Electron。 */
export function defaultUserDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GOFOR_USER_DATA;
  if (override !== undefined && override.trim() !== '') return override;
  const home = homedir();
  if (process.platform === 'win32') {
    return win32.join(env.APPDATA ?? win32.join(home, 'AppData', 'Roaming'), 'GoFor');
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'GoFor');
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'GoFor');
}
