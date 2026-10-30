import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLUGINS_MANIFEST_FILE = 'gofor.plugins.json';

export interface PluginsManifest {
  enabled: string[];
}

export interface InstalledPackage {
  packageName: string;
  version: string;
  id: string | null;
  displayName: string | null;
  apiVersion: string | null;
  hasManifest: boolean;
  enabled: boolean;
}

interface PackageJsonLike {
  name?: unknown;
  version?: unknown;
  gofor?: unknown;
}

function writeJson(filePath: string, value: unknown): void {
  // 先写临时文件再 rename：中途断电不会留下半个 JSON。
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, filePath);
}

export function pluginsDirFor(userDataDir: string): string {
  return join(userDataDir, 'plugins');
}

/**
 * 准备 `userData/plugins`：
 * - `package.json`（私有，不发布，依赖列表就是已安装插件）
 * - `gofor.plugins.json`（enabled 数组）
 *
 * 已存在就不覆盖，避免每次 add 都重置用户状态。
 */
export function ensurePluginsDir(pluginsDir: string): void {
  mkdirSync(pluginsDir, { recursive: true });

  const packageJsonPath = join(pluginsDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    writeJson(packageJsonPath, {
      name: 'gofor-plugins',
      version: '0.0.0',
      private: true,
      dependencies: {},
    });
  }

  const manifestPath = join(pluginsDir, PLUGINS_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    writeJson(manifestPath, { enabled: [] } satisfies PluginsManifest);
  }
}

export function readEnabledPlugins(pluginsDir: string): string[] {
  const manifestPath = join(pluginsDir, PLUGINS_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`plugins/${PLUGINS_MANIFEST_FILE} 不是合法 JSON：${String(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`plugins/${PLUGINS_MANIFEST_FILE} 必须是对象`);
  }
  const enabled = (parsed as { enabled?: unknown }).enabled;
  if (!Array.isArray(enabled)) throw new Error('plugins/gofor.plugins.json 的 enabled 必须是数组');

  const result: string[] = [];
  for (const entry of enabled) {
    if (typeof entry !== 'string' || entry.trim() === '') continue;
    if (!result.includes(entry)) result.push(entry);
  }
  return result;
}

export function writeEnabledPlugins(pluginsDir: string, enabled: readonly string[]): void {
  mkdirSync(pluginsDir, { recursive: true });
  writeJson(join(pluginsDir, PLUGINS_MANIFEST_FILE), {
    enabled: [...new Set(enabled)],
  } satisfies PluginsManifest);
}

function readPackageJson(path: string): PackageJsonLike | null {
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as PackageJsonLike;
  } catch {
    return null;
  }
}

function readString(source: PackageJsonLike, key: 'name' | 'version'): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readManifest(packageJson: PackageJsonLike): {
  id: string | null;
  displayName: string | null;
  apiVersion: string | null;
  main: string | null;
} {
  const raw = packageJson.gofor;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { id: null, displayName: null, apiVersion: null, main: null };
  }
  const manifest = raw as Record<string, unknown>;
  return {
    id: typeof manifest.id === 'string' ? manifest.id : null,
    displayName: typeof manifest.displayName === 'string' ? manifest.displayName : null,
    apiVersion: typeof manifest.apiVersion === 'string' ? manifest.apiVersion : null,
    main: typeof manifest.main === 'string' ? manifest.main : null,
  };
}

/** 依赖列表 + enabled 的并集：依赖里有但未启用的也列出来。 */
export function listInstalledPackages(pluginsDir: string): InstalledPackage[] {
  const packageJsonPath = join(pluginsDir, 'package.json');
  const root = readPackageJson(packageJsonPath);
  const dependencies =
    root &&
    typeof root === 'object' &&
    typeof (root as { dependencies?: unknown }).dependencies === 'object'
      ? ((root as { dependencies?: Record<string, unknown> }).dependencies ?? {})
      : {};

  const enabled = readEnabledPlugins(pluginsDir);
  const names = new Set<string>(enabled);
  for (const name of Object.keys(dependencies)) names.add(name);

  return [...names].sort().map((packageName) => {
    const packageJson = readPackageJson(
      join(pluginsDir, 'node_modules', packageName, 'package.json'),
    );
    if (!packageJson) {
      return {
        packageName,
        version: '—',
        id: null,
        displayName: null,
        apiVersion: null,
        hasManifest: false,
        enabled: enabled.includes(packageName),
      };
    }
    const manifest = readManifest(packageJson);
    return {
      packageName,
      version: readString(packageJson, 'version') ?? '—',
      id: manifest.id,
      displayName: manifest.displayName,
      apiVersion: manifest.apiVersion,
      hasManifest: manifest.id !== null,
      enabled: enabled.includes(packageName),
    };
  });
}
