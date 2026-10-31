import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build } = await import(require.resolve('vite', { paths: [resolve('apps/web')] }));

const ROOT = process.cwd();
const OUT = join(ROOT, 'external-plugins');
const SHIM_REACT = join(ROOT, 'tools/external-runtime/react.ts');
const SHIM_JSX = join(ROOT, 'tools/external-runtime/jsx-runtime.ts');

/** 构建期插件源码 → 外部插件包。 */
const PLUGINS = [
  { dir: 'tasks', id: 'gofor.tasks', name: '作业清单', version: '1.0.0', exportName: 'tasksPlugin' },
  { dir: 'checkin', id: 'gofor.checkin', name: '每日打卡', version: '1.0.0', exportName: 'checkinPlugin' },
  { dir: 'timetable', id: 'gofor.timetable', name: '课程表', version: '1.0.0', exportName: 'timetablePlugin' },
  { dir: 'pomodoro', id: 'gofor.pomodoro', name: '番茄钟', version: '1.0.0', exportName: 'pomodoroPlugin' },
  { dir: 'mood', id: 'gofor.mood', name: '三格自评', version: '1.0.0', exportName: 'moodPlugin' },
  { dir: 'diary', id: 'gofor.diary', name: '情绪日记', version: '1.0.0', exportName: 'diaryPlugin' },
  { dir: 'checklist', id: 'gofor.checklist', name: '环境清单', version: '1.0.0', exportName: 'checklistPlugin' },
  { dir: 'toolbox', id: 'gofor.toolbox', name: '自助工具箱', version: '1.0.0', exportName: 'toolboxPlugin' },
  { dir: 'wordbook', id: 'gofor.wordbook', name: '单词库', version: '1.0.0', exportName: 'wordbookPlugin' },
  { dir: 'report', id: 'gofor.report', name: '自我周报', version: '1.0.0', exportName: 'reportPlugin' },
  { dir: 'theme', id: 'gofor.theme.sepia', name: '护眼主题', version: '1.0.0', exportName: 'sepiaThemePlugin' },
  { dir: 'converter', id: 'gofor.converter.text', name: '文本转换', version: '1.0.0', exportName: 'textConverterPlugin' },
];

async function readManifestMetadata(plugin) {
  const source = await readFile(join(ROOT, 'plugins', plugin.dir, 'src/index.ts'), 'utf8');
  const permissions = /permissions:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
  const list = [...permissions.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return { permissions: list };
}

async function buildOne(plugin) {
  const pluginDir = join(ROOT, 'plugins', plugin.dir);
  const outDir = join(OUT, `gofor-plugin-${plugin.dir}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const entryPath = join(pluginDir, 'src/external-entry.ts');
  await writeFile(
    entryPath,
    `export { ${plugin.exportName} as pluginModule } from './index.ts';\n`,
  );

  await build({
    configFile: false,
    root: pluginDir,
    logLevel: 'warn',
    esbuild: { jsx: 'automatic' },
    resolve: {
      alias: [
        { find: /^react$/, replacement: SHIM_REACT },
        { find: /^react\/jsx-runtime$/, replacement: SHIM_JSX },
        { find: /^react\/jsx-dev-runtime$/, replacement: SHIM_JSX },
      ],
    },
    build: {
      outDir: join(outDir, 'dist'),
      emptyOutDir: true,
      target: 'es2022',
      minify: false,
      sourcemap: false,
      lib: {
        entry: entryPath,
        formats: ['es'],
        fileName: () => 'plugin.js',
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  });

  const meta = await readManifestMetadata(plugin);
  await writeFile(
    join(outDir, 'main.cjs'),
    `exports.activate = function activate() {};\nexports.deactivate = function deactivate() {};\n`,
  );
  await writeFile(
    join(outDir, 'package.json'),
    `${JSON.stringify(
      {
        name: `gofor-plugin-${plugin.dir}`,
        version: '0.1.0',
        private: true,
        main: 'main.cjs',
        gofor: {
          id: plugin.id,
          displayName: plugin.name,
          version: plugin.version,
          main: './main.cjs',
          apiVersion: '1',
          capabilities: [
            'command',
            'view-slot',
            'print-template',
            'screen',
            'theme',
            'data',
            'scan',
          ],
          permissions: meta.permissions,
          renderer: './dist/plugin.js',
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`built ${plugin.id} -> ${outDir}`);
}

await rm(OUT, { recursive: true, force: true });
for (const plugin of PLUGINS) await buildOne(plugin);
console.log(`external plugins: ${PLUGINS.length} in ${OUT}`);
