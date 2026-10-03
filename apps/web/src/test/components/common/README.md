# components/common（テスト）

`src/main/components/common` の単体テストの置き場所。

- `src/main` と同じ相対パスに `<名前>.spec.ts` で置く（`*.test.ts` は使わない）。import は `@/` の別名を使う（配置の正は `.claude/skills/impact-scope/conventions.md`「テスト配置・命名規約」節）
- ダイアログ系の spec は `afterEach` で `wrapper.unmount()` を明示的に呼ぶ（`.claude/rules/web-vue.md`）
