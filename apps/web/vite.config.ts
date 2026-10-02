import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/main', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // API（Spring Boot, 8080）へフォワード。
      // Cookie ベースのセッション認証を前提とするため、フロントと
      // 同一オリジンに見せる（クロスオリジン Cookie の扱いを回避する）。
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
