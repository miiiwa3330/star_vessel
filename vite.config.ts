import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2023' },
  test: { include: ['src/**/*.test.ts'] },
});
