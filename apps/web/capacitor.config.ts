import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android 壳的配置。
 *
 * 刻意保持"纯 WebView + 无原生插件"：这一版只是为了能装到手机上看效果。
 * 真正的原生能力（UsageStats、前台服务、Widget、专注遮罩）是 ROADMAP P6 的事。
 */
const config: CapacitorConfig = {
  appId: 'app.gofor.study',
  appName: 'GoFor',
  webDir: 'dist',
  android: {
    // WebView 里 IndexedDB 可能被系统清掉，先允许混合内容以便本地调试
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
