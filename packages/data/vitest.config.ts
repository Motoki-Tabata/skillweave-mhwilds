import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/test/**/*.spec.ts'],
    // `pnpm test:coverage` のときだけ有効になる（ローカル限定。閾値は置かない）。
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      // lcov の SF: をリポジトリ直下からの相対パスにして、SonarQube スキャナが解決できるようにする。
      reporter: ['text-summary', 'html', ['lcov', { projectRoot: '../..' }]],
    },
  },
})
