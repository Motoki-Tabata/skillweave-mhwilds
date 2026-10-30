# 026: design-system-alignment 計画

## スタック
- Web: Vue 3・Tailwind CSS v4・shadcn-vue（reka-ui）・class-variance-authority・Vitest・@playwright/test（`design/tech-stack.md` の現行どおり）。依存も `components/ui/` の部品も足さない。`Select` を使う新規の `.vue` を作らないため、`sonar-project.properties` の抑止の追記は要らない。
- API・契約・ソルバー・マスターデータは変えない（spec §スコープ外・§契約差分）。

## データモデル
- なし

## 決定事項

### 進め方（メイン）
- D1: 委譲の前に、メインが `design-system/skillweave/MASTER.md` を screen-design.md 6 のとおりに直す（T1）。
  - 「Component Specs」の冒頭の「生成物は手で編集しない」を、「見た目はトークンで変え、トークンで変えられないものだけ『生成部品（`components/ui`）の扱い』の節に列挙してソースを直す」の趣旨に直す。
  - 「Component Specs」に「生成部品（`components/ui`）の扱い」の節を足す。トークンで打ち消すもの（角丸: `--radius-*` を `--radius` に、影: `--shadow-*` を `0 0 #0000` に）と、ソースを直したもの（`CardTitle`・`DialogTitle`・`AlertDialogTitle` のウェイト、Button の `outline`、`AlertDialogContent.vue`・`DialogOverlay.vue`・`DialogScrollContent.vue` のオーバーレイの濃さ）を列挙し、shadcn-vue の CLI で上書きしたときは列挙したものを直し直すと書く。あわせて、`md` 以上で outline にする手書きのクラス列（D8 の定数）は `outline` を直したら揃えると書く。
  - 理由: spec AC-9。内容は decisions.md Q95・Q97 と screen-design.md 6 で確定しており、web-agent が標準として読めるよう先に書く（005・007・021 と同じ扱い）。
- D2: `components/ui/` のソースの手直しは web-agent が行う。直してよいのは次の7ファイルだけで、委譲プロンプトに列挙する。`ui/` のほかのファイルは書かせない。
  - `components/ui/card/CardTitle.vue`・`components/ui/dialog/DialogTitle.vue`・`components/ui/alert-dialog/AlertDialogTitle.vue`（D4）
  - `components/ui/button/index.ts`（D6）
  - `components/ui/alert-dialog/AlertDialogContent.vue`・`components/ui/dialog/DialogOverlay.vue`・`components/ui/dialog/DialogScrollContent.vue`（D7）
  - 委譲プロンプトには、`.claude/rules/ui-design.md` の「web-agent は `ui/` を書かない」が自動で読み込まれるが、026 では decisions.md Q97 とゲート C-1 の承認により上の7ファイルに限って書いてよい、と明記する。
  - 理由: 書込許可（`write-scopes.json` の web-agent の `apps/web/src/main/**`）は `ui/` を含む。直しは1行のクラス列の差し替えだが7ファイルにわたり、メインの直接修正の基準（1行の定数化・リネーム程度）を超える。AC-10 の単体テストも web-agent が書くので、直しとテストを同じワーカーに揃える。`ui-design.md` との食い違いは `tasks/lessons.md` 2026-10-30 に起票済みで、規則の改訂は区間の中で行わず、canon-boundary の経路で直す（026 では `.claude/**` を書かない）。
- D3: 委譲は web-agent 1回（T2）。新しい e2e は書かない（見た目以外の挙動を変えないため。既存の e2e は一括検証の `--e2e` で期待値を変えずに通す。spec AC-11）。`tasks/lessons.md` の 2026-10-26・2026-10-28・2026-10-30 の項の始末は区間 E で行う（spec §スコープ外）。

### web（web-agent）
- D4: `apps/web/src/main/**` の `font-semibold` をすべて `font-bold` に置き換える。いまの出現は23か所（`ui/` の Title 3つ、`PickerDialog.vue`・`BuildDialogFrame.vue` の `DialogTitle`、各画面・カードの `h1`・`h2`、`BuildCard.vue` の見出し、`ResultsPanel.vue` の `<p class="text-base font-semibold">`）。クラス列のほかの語と並びは変えない。`DialogTitle`・`AlertDialogTitle` の既定の `text-lg` も変えない（screen-design.md 2.4）。
  - 確認: `grep -rn "font-semibold" apps/web/src/main` が0件（spec AC-1）。
- D5: 手書きの部品の `shadow-*` を消す（spec AC-2）。対象は5ファイルの6か所: `PickerDialog.vue` の `md:shadow-lg`、`BuildDialogFrame.vue` の `shadow-lg`、`AppToaster.vue` の `shadow-md`、`AuthControls.vue` の `md:shadow-xs`（D8 で置き換え）と `DropdownMenuContent` に渡す `shadow-none`、`ResultBuildCard.vue` の `md:shadow-xs`（D8 で置き換え）。`ui/` の `shadow-*` と `main.css` の `--shadow-*` の打ち消しは変えない（spec AC-3・decisions.md Q95）。
  - 確認: `grep -rnE "shadow-" apps/web/src/main --include=*.vue --include=*.ts | grep -v components/ui/` が0件。
- D6: Button の `outline` の variant を `'border border-input bg-transparent shadow-xs hover:bg-muted hover:text-accent-foreground'` にする（spec AC-5）。
  - いまの `'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50'` から、`bg-background`・`dark:bg-input/30`・`dark:border-input`・`dark:hover:bg-input/50` を除き、`border-input`・`bg-transparent` を足し、`hover:bg-accent` を `hover:bg-muted` にする。
  - `shadow-xs` は残す（`ui/` の `shadow-*` は残し、トークンで打ち消す。decisions.md Q95）。`hover:text-accent-foreground` は残す（`--accent-foreground` はライトとダークの両方で `--foreground` と同じ値で、MASTER.md の `.btn-outline` の文字色と一致する）。
  - 削除の確認の「キャンセル」（`AlertDialogCancel.vue` が `outline` を使う）は、この変更でそのまま揃う。
- D7: `AlertDialogContent.vue`・`DialogOverlay.vue`・`DialogScrollContent.vue` のオーバーレイの `bg-black/80` を `bg-black/60` にする（spec AC-4）。クラス列のほかの語（範囲・z-index・アニメーション）は変えない。
- D8: `md` 以上で outline にする手書きのクラス列は、`components/common/mdOutlineClass.ts` の定数 `MD_OUTLINE_CLASS` 1つにまとめ、`AuthControls.vue` のログインのリンクと `ResultBuildCard.vue` の保存のボタンが使う（spec AC-6・decisions.md Q96 の「複製を部品に寄せるかは区間 C で決める」の決定）。
  - 値: `'md:h-10 md:w-auto md:border md:border-input md:px-4 md:hover:bg-muted md:dark:hover:bg-muted'`。
  - 当てはめた結果: `AuthControls.vue` は `cn('size-11', MD_OUTLINE_CLASS)`、`ResultBuildCard.vue` は `cn('size-11 shrink-0', MD_OUTLINE_CLASS)`（`variant="ghost"` と、基準幅の 44×44px・`md` 以上の高さ 40px・左右 16px は変えない）。
  - いまのクラス列から、`md:bg-background`・`md:dark:bg-input/30`・`md:dark:border-input`・`md:dark:hover:bg-input/50`・`md:shadow-xs` を除く。面は ghost のまま透明になる。
  - `md:dark:hover:bg-muted` を付ける理由: ghost の `dark:hover:bg-accent/50` は `dark` の変種（`&:is(.dark *)`）で詳細度が高く、`md:hover:bg-muted` だけではダークの hover が `--accent` の 50% のまま残るため。
  - 寄せる理由: 同じ複製が2か所にあると、`outline` を直したときに片方だけ食い違う（009 のレビュー記録の持ち越し）。`ui/button` の variant に足すと `ui/` の手直しが増え、shadcn の元のソースとの差分が広がるので、手書きの側の定数にする。定数は MASTER.md の「生成部品の扱い」に挙げ、`outline` と揃えて直す対象にする（D1）。
- D9: `ResultAlert.vue` の `warning` のクラスを `'border-l-warning border-l-[3px] bg-warning/15 text-foreground'` にする（spec AC-7）。枠は Alert の既定の `border`（1px の `--border`）のまま、左端だけ 3px の `--warning` にする。`CharmMatchResult.vue` の帯と同じ書き方（`border-l-warning`・`border-l-[3px]`・`bg-warning/15`）にそろえる（screen-design.md 2.1）。余白は変えない（文字の始まりが 2px 右へ寄るのは想定どおり）。コメントの「文字や枠線に色を使わず、薄い背景にする」は、左端の線の意図（色だけで伝えない手がかり）に合わせて直す。`info`・`error` のクラスは変えない（spec AC-8）。
- D10: AC-10 の単体テストは次の3つに置く。
  - `src/test/components/search/ResultAlert.spec.ts`（新規）: `tone="warning"` の要素が `border-l-[3px]`・`border-l-warning`・`border` を持つこと、`tone="info"`・`tone="error"` が `border-l-[3px]`・`border-l-warning` を持たず、`error` が `border-destructive` を持つこと（AC-7・AC-8）。
  - `src/test/components/ui/button.spec.ts`（新規）: `buttonVariants({ variant: 'outline' })` が `border-input`・`bg-transparent`・`hover:bg-muted` を持ち、`bg-background`・`dark:bg-input/30`・`dark:hover:bg-input/50` を持たないこと（AC-5）。
  - `src/test/components/common/DeleteConfirmDialog.spec.ts`（既存に1件足す）: 開いたときのオーバーレイの要素が `bg-black/60` を持ち、`bg-black/80` を持たないこと（AC-4）。既存の2件の期待値は変えない。
  - 既存の Web の単体テスト（`AuthControls.spec.ts`・`AppDialogOverlay.spec.ts` を含む）は期待値を変えずに通す（spec AC-11）。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Component Specs の冒頭の文を直し、生成部品の扱いの節を足す。担当: メイン。時期: T1（委譲の前）。理由: D1・spec AC-9・screen-design.md 6）
