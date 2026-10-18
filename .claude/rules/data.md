---
paths:
  - packages/data/**
---

# packages/data — マスターデータ生成の規約

- **生成物を直したいときは、生成物ではなく overlay（上書き定義）で直す。** 生成物を直接直しても、次の生成で消えるため。
- **overlay の置き場は `packages/data/overlays/*.yaml`、パイプラインの置き場は `packages/data/src/main/pipeline/` である。** overlay の書込は data-agent の常設の書込許可に含まれる（許可の正は `.claude/skills/impact-scope/write-scopes.json`）。
- **マスターデータの情報源・ID 規則・overlay の書式と検証・出力の正は `design/master-data.md` である。** 同ファイルの「情報源」「ID 規則」「overlay の書式と検証」「出力」の各節を見る。内容は本ファイルへ書き写さない。
- **Node の型（`@types/node`）を使ってよい。** `tsconfig.json` の `types` に `node` を含む。
- テストは `src/test/**/*.spec.ts` に置く。
- 検証は `pnpm --filter @swv/data run test:unit`（カバレッジは `test:coverage`）。lint・format・type-check は `CLAUDE.md` の Commands の packages の行に従う。
