// 外部插件 renderer：组件/主题/数据/扫描 handler 都在这里实现。
// React 由宿主通过 window.__GOFOR_HOST__.React 提供，避免每个插件重复打包。
const React = globalThis.__GOFOR_HOST__?.React;

export function HelloScreen(props) {
  const host = props.host;
  const [entries, setEntries] = React.useState(null);
  const [scan, setScan] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    host?.data
      ?.query('hello.entries')
      .then((value) => {
        if (alive) setEntries(value);
      })
      .catch(() => {
        if (alive) setEntries(null);
      });
    return () => {
      alive = false;
    };
  }, [host]);

  return React.createElement(
    'div',
    { style: { display: 'grid', gap: 10 } },
    React.createElement('h2', null, 'Hello 外部插件'),
    React.createElement('p', null, '这个页面来自 userData/plugins，不是构建期插件。'),
    React.createElement('p', null, `插件 id：${props.pluginId}`),
    React.createElement(
      'p',
      null,
      `数据契约 hello.entries：${entries ? JSON.stringify(entries) : '未取到'}`,
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: async () => {
          const summary = await host.applyScan(
            [
              {
                targetId: 'hello/1',
                label: 'Hello 测试格',
                kind: 'checkbox',
                ink: 1,
                selected: true,
                payload: 'hello:1',
                owner: 'plugin-hello',
              },
            ],
            '2026-10-31',
          );
          setScan(summary);
        },
        style: { justifySelf: 'start', border: '1px solid currentColor', borderRadius: 6, padding: '2px 8px' },
      },
      '测试扫描回填',
    ),
    scan ? React.createElement('pre', null, JSON.stringify(scan)) : null,
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => host?.navigate('home'),
        style: { justifySelf: 'start', border: '1px solid currentColor', borderRadius: 6, padding: '2px 8px' },
      },
      '回到首页',
    ),
  );
}

export const themes = {
  'plugin-hello/theme': {
    id: 'plugin-hello/theme',
    name: 'Hello 主题',
    tokens: {
      '--color-accent': 'oklch(0.58 0.16 20)',
      '--color-paper': 'oklch(0.98 0.01 30)',
    },
  },
};

export const data = {
  'hello.entries': {
    query: async () => [{ id: 'hello-1', text: '来自外部插件的数据' }],
    revision: async () => 1,
  },
};

export const scanHandlers = {
  'plugin-hello/scan': async (results) => ({ handled: results.length, skipped: 0 }),
};

export function HelloSlot() {
  return React.createElement('span', null, 'Hello 外部插槽');
}
