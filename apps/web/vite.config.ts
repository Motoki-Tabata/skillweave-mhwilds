import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const masterDir = fileURLToPath(new URL('../../packages/data/dist/', import.meta.url))

// マスターの版と取得元（クレジット）を設定の評価時に読み、__SWV_MASTER__ として埋め込む。
// 辞書（master-<版>.ja.json など）は除き、本体がちょうど1つでなければ例外にする。
function readMasterInfo() {
  const files = readdirSync(masterDir).filter((name) => /^master-\d+\.\d+\.\d+\.json$/.test(name))
  if (files.length !== 1) {
    throw new Error(
      `${masterDir} の master-<版>.json は1つだけのはずですが ${files.length} 個あります: ${files.join(', ')}`,
    )
  }
  const master = JSON.parse(readFileSync(`${masterDir}${files[0]}`, 'utf-8')) as {
    version: string
    source: { repository: string; commit: string }
  }
  return { version: master.version, source: master.source }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // マスターと辞書を同一オリジンの静的ファイルとして配信する（/<ファイル名> で取れる）。
  publicDir: masterDir,
  define: {
    __SWV_MASTER__: JSON.stringify(readMasterInfo()),
  },
  // highs の ESM ビルドは動的 import を持ち、既定の iife では Worker をビルドできない。
  worker: { format: 'es' },
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
