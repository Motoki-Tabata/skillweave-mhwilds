---
paths:
  - packages/solver/**
---

# packages/solver — ソルバーの規約

- **純粋関数で書く。** 同じ入力に同じ出力を返し、外部の状態を持たない。
- **マスターデータもユーザーデータも自分で取りに行かない。** 呼び出し側が引数で渡す。取得の経路（ファイル・fetch・DB）に依存すると、Worker・テスト・将来の実行環境のどこでも同じ結果にならなくなる。
- **`tsconfig.json` は DOM・Node の型を持たない**（`lib` は ES2024 のみ、`types` は空）。それらに頼る実装は型検査で落ちる。落ちたら型定義を足して通すのでなく、実装を依存の無い形に直す。
- テストは `src/test/**/*.spec.ts` に置く。
- 検証は `pnpm --filter @swv/solver run test:unit`（カバレッジは `test:coverage`）。lint・format・type-check は `CLAUDE.md` の Commands の packages の行に従う。
