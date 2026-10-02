// contracts/openapi.yaml から静的 Swagger UI HTML を生成する。
// 前段の `pnpm run contract:bundle`（redocly bundle）が
// contracts/dist/swagger/openapi.json を作っている前提で動く。
//
// CDN 版 Swagger UI ではなく devDependency の swagger-ui-dist を使う理由は
// contracts/README.md「定義書の生成」節を参照。生成後は外部ホストへの参照が
// 一切残らない静的ファイル一式になる。

import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const assetsDir = dirname(require.resolve('swagger-ui-dist/package.json'))
const outDir = join(import.meta.dirname, '..', '..', '..', 'contracts', 'dist', 'swagger')

// openapi.json は直前の `pnpm run contract:bundle` が既に outDir へ書き込み済み。
// 存在確認だけ行い、無ければ実行順序の誤りとして落とす
// （outDir 自体を rmSync で作り直すと、この bundle 出力ごと消えてしまうため行わない）。
if (!existsSync(join(outDir, 'openapi.json'))) {
  throw new Error(
    'contracts/dist/swagger/openapi.json が見つかりません。先に `pnpm run contract:bundle` を実行してください。',
  )
}

mkdirSync(outDir, { recursive: true })

// swagger-ui-dist の資産のうち、表示に必要な3ファイルだけをコピーする
// （absolute-path.js 等のNode向けエントリや index.html 雛形はコピーしない）。
const assetFiles = ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js']

for (const file of assetFiles) {
  copyFileSync(join(assetsDir, file), join(outDir, file))
}

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Skillweave for MH Wilds API</title>
    <link rel="stylesheet" href="./swagger-ui.css" />
    <style>
      body { margin: 0; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="./swagger-ui-bundle.js"></script>
    <script src="./swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: './openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
          // file:// で開く / CORS 未設定の API に対して「Try it out」を
          // 見せると必ず失敗する（CSRF トークンも自動付与されない）ため無効化する。
          // 実 API を試す場合は apps/api を起動し springdoc の /swagger-ui.html を使う。
          supportedSubmitMethods: [],
        })
      }
    </script>
  </body>
</html>
`

writeFileSync(join(outDir, 'index.html'), html)

console.log(`Swagger UI を生成しました: ${outDir}/index.html`)
