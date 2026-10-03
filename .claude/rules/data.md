---
paths:
  - packages/data/**
---

# packages/data — マスターデータ生成の規約

- **生成物を直したいときは、生成物ではなく overlay（上書き定義）で直す。** 生成物を直接直しても、次の生成で消えるため。
- **overlay とパイプラインの置き場は、パイプラインを導入する機能で決まる。** 置き場を先取りして作らない。
- **Node の型（`@types/node`）を使ってよい。** `tsconfig.json` の `types` に `node` を含む。
- テストは `src/test/**/*.spec.ts` に置く。
- 検証は `pnpm --filter @swv/data run test:unit`（カバレッジは `test:coverage`）。lint・format・type-check は `CLAUDE.md` の Commands の packages の行に従う。
