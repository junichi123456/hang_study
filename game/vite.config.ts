/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
