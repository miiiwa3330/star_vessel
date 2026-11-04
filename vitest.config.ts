import { defineConfig } from 'vitest/config';

// テストは Cloudflare の実行環境を使わない純粋な関数だけなので、vite.config.ts（cloudflare プラグイン入り）とは分ける
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
