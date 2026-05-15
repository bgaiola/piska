import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: '/piska/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globals: false,
  },
});
