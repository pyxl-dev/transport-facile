import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_API_TARGET || 'https://preview.transport-facile.pages.dev'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
})
