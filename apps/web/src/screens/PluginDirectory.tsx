import { type JobState, jobStatusLabel } from '@gofor/core/plugin';
import { PLUGIN_API_VERSION, permissionLabel } from '@gofor/plugin-api';
import { Badge, Button, Card, Chip, EmptyState, Textarea } from '@gofor/ui';
import { useRef, useState } from 'react';
import { type ConverterRun, startConverterRun } from '../plugins/converterRunner.ts';
import { usePluginHost } from '../plugins/host.tsx';
import { providerStatusLabel } from '../plugins/providers.ts';
import { describeCssContribution } from '../plugins/uiExtensions.ts';

const SAMPLE_MARKDOWN =
  '# 标题\n\n- **粗体** 与 *斜体*\n- [链接](https://example.com)\n\n```\ncode\n```';

/**
 * 插件目录（P3.5）。
 *
 * 插件随应用构建（npm 包），这里只做**启用/禁用与能力展示**：
 * 权限、数据依赖、打印区块归属、扫描处理器、命令、转换器、OCR/AI、主题。
 * 没有运行时安装/源码加载，也没有卸载——禁用不会删插件数据。
 */
export function PluginDirectoryScreen() {
  const host = usePluginHost();
  const [conversionText, setConversionText] = useState(SAMPLE_MARKDOWN);
  const [job, setJob] = useState<JobState | null>(null);
  const [output, setOutput] = useState('');
  const runRef = useRef<ConverterRun | null>(null);

  const runConverter = (workerId: string) => {
    runRef.current?.cancel();
    setOutput('');
    const run = startConverterRun({
      workerId,
      text: conversionText,
      onState: (state) => setJob(state),
    });
    runRef.current = run;
    void run.promise.then((state) => {
      if (state.status === 'succeeded') setOutput(String(state.result ?? ''));
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <h2 className="text-sm font-medium opacity-60">插件与扩展</h2>
        <p className="text-caption leading-relaxed opacity-45">
          功能插件随应用构建（npm 包），通过同一张注册表提供页面、命令、快捷键、主题、
          插槽、打印区块与扫描回填。禁用只改注册表，插件数据保留。
        </p>
      </header>

      {host.bootstrapError ? (
        <Card padding="none" className="border-danger/30 px-4 py-3 text-small text-danger">
          插件系统启动失败：{host.bootstrapError}
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-section font-medium">已注册插件（{host.plugins.length}）</h3>
          <span className="text-caption opacity-35">
            插件 API v{PLUGIN_API_VERSION} · 随应用构建，禁用只改注册表
          </span>
        </div>
        <div className="space-y-2">
          {host.plugins.map((plugin) => {
            const unavailable = plugin.activationError !== null || plugin.blockedReason !== null;
            return (
              <Card key={plugin.id} padding="none" className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-body font-medium">{plugin.name}</span>
                  <span className="font-mono text-micro opacity-35">{plugin.id}</span>
                  <span className="text-micro opacity-35">v{plugin.version}</span>
                  <Badge tone="neutral">内置</Badge>
                  <Badge tone={plugin.enabled ? 'ok' : 'warn'}>
                    {plugin.enabled ? '启用中' : '已禁用'}
                  </Badge>
                </div>

                {plugin.description ? (
                  <p className="text-caption leading-relaxed opacity-45">{plugin.description}</p>
                ) : null}

                {unavailable ? (
                  <p className="text-caption leading-relaxed text-danger opacity-80" role="alert">
                    {plugin.activationError ?? plugin.blockedReason}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-1">
                  {plugin.permissions.map((permission) => (
                    <span
                      key={permission}
                      title={permission}
                      className="rounded-full bg-overlay px-2 py-0.5 text-micro opacity-55"
                    >
                      {permissionLabel(permission)}
                    </span>
                  ))}
                </div>

                {plugin.consumes.length > 0 ? (
                  <div
                    className="flex flex-wrap items-center gap-2 text-micro opacity-50"
                    data-e2e={`consumes-${plugin.id}`}
                  >
                    <span>依赖数据：</span>
                    {plugin.consumes.map((dependency) => (
                      <span key={dependency.id}>
                        {dependency.id}@v{dependency.version}
                        {dependency.availability.status === 'available'
                          ? ' ✓'
                          : dependency.optional
                            ? '（可选，未安装）'
                            : '（缺失）'}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant={plugin.enabled ? 'secondary' : 'primary'}
                    aria-label={`${plugin.enabled ? '禁用' : '启用'} ${plugin.name}`}
                    onClick={() => void host.setPluginEnabled(plugin.id, !plugin.enabled)}
                  >
                    {plugin.enabled ? '禁用' : '启用'}
                  </Button>
                  <span className="text-micro opacity-30">禁用 / 重装都不会清插件数据</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-section font-medium">数据契约</h3>
        <p className="text-caption leading-relaxed opacity-40">
          插件之间只能通过数据契约交换数据；core 的学习/打卡/作业等也是 provider。 解析顺序：core
          &gt; 已启用插件 &gt; 未安装。
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-card-faint">
          <table className="w-full min-w-[520px] text-left text-caption">
            <thead className="border-b border-line text-micro opacity-40">
              <tr>
                <th className="px-3 py-2 font-normal">契约</th>
                <th className="px-3 py-2 font-normal">提供方</th>
                <th className="px-3 py-2 font-normal">版本</th>
                <th className="px-3 py-2 font-normal">说明</th>
              </tr>
            </thead>
            <tbody>
              {host.dataProviders.map((provider) => (
                <tr
                  key={`${provider.id}@${provider.providerId}`}
                  className="border-b border-line/50 last:border-b-0"
                >
                  <td className="px-3 py-1.5 font-mono">{provider.id}</td>
                  <td className="px-3 py-1.5">
                    {provider.providerId === 'core' ? 'core（内置）' : provider.providerId}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">v{provider.version}</td>
                  <td className="px-3 py-1.5 opacity-50">{provider.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-section font-medium">命令与快捷键（{host.commands.length}）</h3>
        {host.shortcuts.length > 0 ? (
          <p className="text-caption text-danger opacity-80" role="alert">
            快捷键冲突：
            {host.shortcuts
              .map(
                (conflict) => `${conflict.shortcut} 同时被 ${conflict.commandIds.join(' / ')} 使用`,
              )
              .join('；')}
          </p>
        ) : (
          <p className="text-caption opacity-35">没有快捷键冲突。</p>
        )}
        <ul className="rounded-xl border border-line bg-card-faint px-4 py-2">
          {host.commands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between gap-2 py-1 text-caption"
            >
              <span>
                {command.title}
                <span className="ml-2 font-mono text-micro opacity-30">{command.source}</span>
              </span>
              {command.shortcut ? (
                <span className="font-mono text-micro opacity-40">{command.shortcut}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-section font-medium">转换器（Worker）</h3>
        {host.converters.length === 0 ? (
          <EmptyState
            title="没有转换器"
            description="P5-5.12 的 LibreOffice/Office 转换会以插件形式接入。"
          />
        ) : (
          host.converters.map((converter) => (
            <Card key={converter.id} padding="none" className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-body">{converter.title}</span>
                <span className="font-mono text-micro opacity-30">{converter.id}</span>
                <span className="text-micro opacity-40">
                  {converter.from.join(' / ')} → {converter.to}
                </span>
              </div>
              {converter.worker === undefined ? (
                <p className="text-caption leading-relaxed opacity-45">
                  这项转换需要本机桥（Office / LibreOffice）：网页版只能预览，不能转换；
                  请等桌面版或 P5 的本地桥插件。
                </p>
              ) : (
                <>
                  <Textarea
                    aria-label="转换输入"
                    rows={3}
                    value={conversionText}
                    onChange={(event) => setConversionText(event.target.value)}
                    className="font-mono text-caption"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => runConverter(converter.worker ?? '')}
                    >
                      试运行转换
                    </Button>
                    <Button variant="ghost" onClick={() => runRef.current?.cancel()}>
                      取消
                    </Button>
                    {job ? (
                      <span className="text-caption opacity-50" data-e2e="converter-status">
                        状态：{jobStatusLabel(job.status)}
                        {job.error ? `（${job.error}）` : ''}
                      </span>
                    ) : null}
                  </div>
                  {output ? (
                    <pre
                      className="max-h-48 overflow-auto rounded-md bg-overlay px-3 py-2 text-caption whitespace-pre-wrap"
                      data-e2e="converter-output"
                    >
                      {output}
                    </pre>
                  ) : null}
                </>
              )}
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-section font-medium">连接器 / OCR / AI</h3>
        <div className="space-y-1 rounded-xl border border-line bg-card-faint px-4 py-3 text-caption">
          <p className="opacity-50">
            连接器：
            {host.connectors.length === 0
              ? '无（QQ 桥属于 P7，默认关闭）'
              : `${host.connectors.length} 个`}
          </p>
          <p className="opacity-50">
            OCR：{providerStatusLabel(host.ocr.status())}（P4-4.12 接入）
          </p>
          <p className="opacity-50">
            AI：{providerStatusLabel(host.ai.status())}（P8 接入，本阶段没有网络代码）
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-section font-medium">主题与样式</h3>
        <div className="space-y-1 rounded-xl border border-line bg-card-faint px-4 py-3 text-caption">
          <p className="opacity-50">
            当前主题包：
            {host.activeTheme ? `${host.activeTheme.name}（${host.activeTheme.pluginId}）` : '默认'}
          </p>
          {host.themes.length === 0 ? (
            <p className="opacity-40">没有主题包。</p>
          ) : (
            <div className="flex flex-wrap gap-1 pt-1">
              {host.themes.map((theme) => (
                <Chip key={theme.id} active={host.activeTheme?.id === theme.id}>
                  {theme.name}
                </Chip>
              ))}
            </div>
          )}
          {host.css.map((css) => (
            <p key={css.id} className="text-micro opacity-35">
              作用域样式 {css.id}：{describeCssContribution(css)}
            </p>
          ))}
          <p className="text-micro leading-relaxed opacity-30">
            主题只覆盖屏幕层 token；纸面（.print-page）固定白底黑字，启用主题后打印输出不变。
          </p>
        </div>
      </section>
    </div>
  );
}
