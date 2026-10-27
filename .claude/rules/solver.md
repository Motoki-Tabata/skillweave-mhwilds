---
paths:
  - packages/solver/**
---

# packages/solver — ソルバーの規約

- **純粋関数で書く。** 同じ入力に同じ出力を返し、外部の状態を持たない。
- **マスターデータもユーザーデータも自分で取りに行かない。** 呼び出し側が引数で渡す。取得の経路（ファイル・fetch・DB）に依存すると、Worker・テスト・将来の実行環境のどこでも同じ結果にならなくなる。
- **`src/main` は DOM・Node の型を持たない**（`tsconfig.json` は `lib` が ES2024 のみ、`types` は空）。それらに頼る実装は型検査で落ちる。落ちたら型定義を足して通すのでなく、実装を依存の無い形に直す。テストと測定（`src/test/**`）は、`tsconfig.json` を extends して `types: ["node"]` にした `tsconfig.vitest.json` で型検査する。`sonar-project.properties` の `sonar.typescript.tsconfigPaths` にも `packages/solver/tsconfig.vitest.json` を載せる。
- テストは `src/test/**/*.spec.ts` に置く（main と同じ相対パスの `<名前>.spec.ts`）。例外は、補助の `src/test/support/`、測定の `src/test/**/*.measure.ts`、main に対応しないテストの `src/test/` 直下である。条件の正は `.claude/skills/impact-scope/conventions.md` の「テスト配置・命名規約」節。
- 測定（`*.measure.ts`）は、`--mode measure` の末尾にファイルを指定して実行する。ファイルを指定しないと、置いた測定がすべて走る。describe 名の語だけで分けない（vitest の `-t` は空白や `=` を含む名前に合わせにくい）。ケースを絞るときは環境変数で絞る。
- HiGHS の複数目的は `blend_multi_objectives` を false にし、辞書式にしたい目的はすべて `passLinearObjectives` の補助の目的として優先度付きで渡す。既定の true のままでは優先度が効かない。方式の試作は、本実装で確定する設定と目的の形で測り、同点の順のテストも通す。試作と本実装で測定がずれ、補助の目的を足すと本体の `colCost` が最適化されず同点の順のテストが落ちるため。
- 検証は `pnpm --filter @swv/solver run test:unit`（カバレッジは `test:coverage`）。lint・format・type-check は `CLAUDE.md` の Commands の packages の行に従う。
