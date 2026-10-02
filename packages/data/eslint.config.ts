import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import pluginOxlint from 'eslint-plugin-oxlint'

export default defineConfig(
  {
    name: 'package/files-to-lint',
    files: ['**/*.{ts,mts}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**']),

  tseslint.configs.recommended,

  // oxlint --fix を先に実行する前提のルールセット（重複警告を避ける）。
  // 実行順は package.json の lint スクリプトで oxlint → eslint を厳守する。
  ...pluginOxlint.configs['flat/recommended'],
)
