/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the project under /world_DG/; `vite preview` must match the build.
  base: command === 'build' || isPreview ? '/world_DG/' : '/',
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // The three.js chunk is ~1.8 MB but lazy-loaded after the shell paints (see App.tsx).
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        // three.js is most of the bundle; keep it in its own long-cached chunk.
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
