import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { silentLogger } from '@gofor/plugin-runtime';
import { afterEach, describe, expect, it } from 'vitest';
import { isLoopbackAddress, startPluginHost } from '../src/index.ts';

const roots: string[] = [];

function makeUserData(): string {
  const root = mkdtempSync(join(tmpdir(), 'gofor-plugin-host-'));
  roots.push(root);
  mkdirSync(join(root, 'plugins'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('plugin-host', () => {
  it('绑定后只允许 loopback 访问 health/snapshot', async () => {
    const host = await startPluginHost({
      userDataDir: makeUserData(),
      host: '127.0.0.1',
      port: 0,
      logger: silentLogger,
    });
    try {
      const health = await fetch(`${host.origin}/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { ok: boolean; allowLan: boolean };
      expect(body.ok).toBe(true);
      expect(body.allowLan).toBe(false);

      const snapshot = await fetch(`${host.origin}/api/plugins/snapshot`);
      expect(snapshot.status).toBe(200);
      expect(await snapshot.json()).toMatchObject({ plugins: [] });
    } finally {
      await host.close();
    }
  });

  it('isLoopbackAddress 只认本机地址', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.20')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
