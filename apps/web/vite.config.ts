import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
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

// Tesseract.js の worker・WASM コア・言語データを、固定のパス（ハッシュなし）の静的ファイルとして
// 自オリジンから配信する。tesseract.js は langPath の下の jpn.traineddata.gz を名前で取り、corePath に
// ディレクトリを渡したときだけ SIMD の対応で版を選ぶため、`?url` の import（ハッシュ付き）は使えない。
const require = createRequire(import.meta.url)
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`))
const tesseractFiles: Record<string, string> = {
  'tesseract/worker.min.js': resolve(packageDir('tesseract.js'), 'dist/worker.min.js'),
  ...Object.fromEntries(
    ['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((variant) => [
      `tesseract/core/tesseract-core-${variant}.wasm.js`,
      resolve(packageDir('tesseract.js-core'), `tesseract-core-${variant}.wasm.js`),
    ]),
  ),
  'tesseract/lang/jpn.traineddata.gz': resolve(
    packageDir('@tesseract.js-data/jpn'),
    '4.0.0_best_int/jpn.traineddata.gz',
  ),
}

function tesseractAssets(): Plugin {
  let base = '/'
  return {
    name: 'swv-tesseract-assets',
    configResolved(config) {
      base = config.base
    },
    generateBundle() {
      for (const [fileName, path] of Object.entries(tesseractFiles)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(path) })
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!.slice(base.length)
        const file = tesseractFiles[path]
        if (!file || !(req.url ?? '').startsWith(base)) return next()
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/gzip')
        res.end(readFileSync(file))
      })
    },
  }
}

// 護石の OCR の測定（e2e/measure/charm-ocr）専用の入口。配備用のビルドには入れない。
const ocrMeasureInput =
  process.env.SWV_OCR_MEASURE === '1'
    ? {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'charm-ocr': fileURLToPath(new URL('./e2e/measure/charm-ocr/index.html', import.meta.url)),
      }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), tesseractAssets()],
  build: ocrMeasureInput ? { rollupOptions: { input: ocrMeasureInput } } : undefined,
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
