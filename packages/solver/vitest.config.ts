import { defineConfig } from 'vitest/config'

// 時間の測定（`pnpm measure`）は通常のテスト実行（CI を含む）から分ける。
// `--mode measure` のときだけ `*.measure.ts` を対象にする。
export default defineConfig(({ mode }) => {
  const measure = mode === 'measure'
  return {
    test: {
      include: [measure ? 'src/test/**/*.measure.ts' : 'src/test/**/*.spec.ts'],
      // テストを書いたら外す（plan 決定事項 14。T6）。それまではテストが0件でも成功させる。
      passWithNoTests: true,
      ...(measure && { testTimeout: 600_000, hookTimeout: 600_000 }),
      // `pnpm test:coverage` のときだけ有効になる（ローカル限定。閾値は置かない）。
      coverage: {
        provider: 'v8',
        include: ['src/main/**/*.ts'],
        // lcov の SF: をリポジトリ直下からの相対パスにして、SonarQube スキャナが解決できるようにする。
        reporter: ['text-summary', 'html', ['lcov', { projectRoot: '../..' }]],
      },
    },
  }
})
