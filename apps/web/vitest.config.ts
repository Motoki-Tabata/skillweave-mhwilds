import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/test/**/*.spec.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // `pnpm test:coverage` のときだけ有効になる（ローカル限定。閾値は置かない）。
      coverage: {
        provider: 'v8',
        include: ['src/main/**/*.{ts,vue}'],
        exclude: [
          // 生成物（contracts/openapi.yaml から pnpm contract:types で再生成する）
          'src/main/lib/api/schema.ts',
          // shadcn-vue からソースとしてコピーした汎用部品。自前コードの実態を測るため除外する
          // （sonar-project.properties の sonar.coverage.exclusions と揃える）。
          'src/main/components/ui/**',
          // アプリのブートストラップ（配線のみ）。sonar-project.properties と揃える。
          'src/main/main.ts',
          'src/main/App.vue',
        ],
        // lcov の SF: をリポジトリ直下からの相対パス（apps/web/src/...）にして、
        // リポジトリ直下で動く SonarQube スキャナがファイルを解決できるようにする。
        reporter: ['text-summary', 'html', ['lcov', { projectRoot: '../..' }]],
      },
    },
  }),
)
