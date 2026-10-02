import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    // openapi-typescript の生成物。contracts/openapi.yaml から再生成されるため対象外にする。
    'src/main/lib/api/schema.ts',
  ]),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    // shadcn-vue のコンポーネントは Button・Card のような単語1つの命名が
    // 標準（ネイティブ HTML 要素と衝突しないため実害はない）。
    name: 'app/shadcn-ui-single-word-names',
    files: ['src/main/components/ui/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  // oxlint --fix を先に実行する前提のルールセット（重複警告を避ける）。
  // 実行順は package.json の lint スクリプトで oxlint → eslint を厳守する。
  ...pluginOxlint.configs['flat/recommended'],
  skipFormatting,
)
