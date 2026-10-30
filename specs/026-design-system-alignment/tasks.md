# 026: design-system-alignment タスク

順序: T1 → T2（plan D3）。契約は変えないので draft の回収は無い。新しい e2e は書かず、既存の e2e は一括検証の `--e2e` で通す。`tasks/lessons.md` の該当項目の始末は区間 E で行う。

- [ ] T1 [main]           委譲の前に、`design-system/skillweave/MASTER.md` の「Component Specs」の冒頭の「生成物は手で編集しない」を直し、「生成部品（`components/ui`）の扱い」の節（トークンで打ち消すもの・ソースを直したもの・`MD_OUTLINE_CLASS`・CLI で上書きしたら直し直す）を足す（plan D1）     refs spec §受入基準 AC-9
- [ ] T2 [web-agent]      `apps/web/src/main/**` の `font-semibold` を `font-bold` にし（D4）、手書きの部品の `shadow-*` を消す（D5）。`components/ui/` は plan D2 の7ファイルだけを直す: Button の `outline`（D6）、オーバーレイ3つの `bg-black/60`（D7）、Title 3つ（D4）。`components/common/mdOutlineClass.ts` の `MD_OUTLINE_CLASS` を足して `AuthControls.vue`・`ResultBuildCard.vue` の `md` 以上のクラス列を置き換え（D8）、`ResultAlert.vue` の `warning` に左端の線を付ける（D9）。`ResultAlert.spec.ts`・`components/ui/button.spec.ts` を書き、`DeleteConfirmDialog.spec.ts` にオーバーレイの1件を足す（D10）。`AuthControls.spec.ts`・`AppDialogOverlay.spec.ts` ほか既存の Web の単体テストを期待値を変えずに通す（plan D2・D4〜D10）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11
