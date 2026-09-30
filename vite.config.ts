import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4317,
    strictPort: false,
    proxy: { '/api': 'http://127.0.0.1:4318' },
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**', '**/docs/**'] },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
