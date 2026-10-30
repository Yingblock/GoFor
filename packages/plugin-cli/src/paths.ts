import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

export interface UserDataOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * 与 Electron `app.getPath('userData')` 对齐的默认目录。
 *
 * Electron 的规则是 `appData/<应用名>`；打包后的应用名是 `GoFor`
 * （`package.json` 的 productName），所以三个平台都用这个末级目录。
 * `GOFOR_USER_DATA` 可覆盖（也用于测试/绿色版）。
 */
export function defaultUserDataDir(options: UserDataOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  const override = env.GOFOR_USER_DATA;
  if (override !== undefined && override.trim() !== '') return override;

  if (platform === 'win32') {
    const appData = env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
    return win32.join(appData, 'GoFor');
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'GoFor');
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'GoFor');
}
