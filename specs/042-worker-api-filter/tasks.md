# 042: worker-api-filter タスク

- [ ] T1 [main]       常時許可外の 4 ファイル（`sonar-project.properties`・`apps/web/vitest.config.ts`・`apps/web/package.json`・`design/tech-stack.md`）を書き、`tasks/lessons.md` の解消する 2 項目を消す。1 コミットにする（plan D8）  refs spec §受入基準 AC-9, AC-10
- [ ] T2 [web-agent]  `apps/web/worker/index.ts` の許可の一覧・照合・404・冒頭の説明と、`apps/web/src/test/worker/index.spec.ts` の単体テストと 031 のテストの追従（plan D1〜D7）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10
- [ ] T3 [main]       全体解析（`verify.mjs --sonar`）で `apps/web/worker/index.ts` の issue を確かめる。出たら web-agent を新規起動して直させる（plan D9）  refs spec §受入基準 AC-9
- [ ] T4 [main]       `wrangler dev` と偽の上流で実際の経路を確かめ、結果を `decisions.md` に記録する（plan D10）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-6
