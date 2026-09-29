import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // three.js lands in its own lazy chunk (~600 KB raw, ~150 KB gzipped).
    chunkSizeWarningLimit: 800,
  },
});
