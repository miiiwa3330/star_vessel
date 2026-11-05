import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// cloudflare()：開発サーバーの中で Worker（worker/index.ts）も動かし、/api/ をそこへ回す
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: { target: 'es2023' },
  // Web Worker を ES モジュールで出す（satellite.js 7 の WebAssembly 版が、Worker の中でトップレベルの await を使うため）
  worker: { format: 'es' },
});
