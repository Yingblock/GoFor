import type { AiProvider, OcrProvider } from '@gofor/plugin-api';

/**
 * 3.6：OCR / AI 只定接口 + 「未配置」默认实现。
 *
 * 本阶段**不写任何网络代码**：provider 存在是为了让 P4/P8 接进来时有位置，
 * 而不是让现在的界面假装有 AI。调用方拿到 `not-configured` 必须显示未配置，
 * 不能吞掉错误或返回空字符串。
 */
export const notConfiguredOcr: OcrProvider = {
  id: 'host.none',
  name: '未配置 OCR',
  status: () => ({ status: 'not-configured' }),
  async recognize() {
    throw new Error('OCR 尚未配置：P4-4.12 接入本地或 BYOK 云端 provider');
  },
};

export const notConfiguredAi: AiProvider = {
  id: 'host.none',
  name: '未配置 AI',
  status: () => ({ status: 'not-configured' }),
  async complete() {
    throw new Error('AI 尚未配置：P8 接入，本阶段不发起任何网络请求');
  },
};

export function providerStatusLabel(status: ReturnType<OcrProvider['status']>): string {
  switch (status.status) {
    case 'ready':
      return `已就绪：${status.name}`;
    case 'not-configured':
      return '未配置';
    case 'unavailable':
      return `不可用：${status.reason}`;
    default:
      return '未知';
  }
}
