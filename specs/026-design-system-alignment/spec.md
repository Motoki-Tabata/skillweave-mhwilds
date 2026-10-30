# 026: design-system-alignment

## 目的 / ユーザーストーリー
このアプリの開発者として、MASTER.md（デザインシステムの唯一の正）と、shadcn-vue の生成部品・既存画面との食い違い（見出しのウェイト・影・オーバーレイの濃さ・警告の帯・outline の枠と面）を解消したい。新しい画面が食い違った書き方を書き写して増やさず、MASTER.md を読めば実装の見た目が分かる状態にするためである（`tasks/lessons.md` 2026-10-26・2026-10-28、open-questions の Q27、009 handoff.md の持ち越し）。利用者から見ると、確認のダイアログの背景の暗さ、outline のボタンの枠と面、警告の帯の左端の線が MASTER.md どおりになる。

用語:
- 生成部品: `apps/web/src/main/components/ui/` にある、shadcn-vue の CLI で取り込んだ部品のソース。
- 手書きの部品: `apps/web/src/main/**` の `.vue`・`.ts` のうち、生成部品以外のもの。
- 警告の帯: `ResultAlert.vue` の `tone="warning"` の表示。

## 受入基準（EARS記法）
- AC-1: THE system SHALL `apps/web/src/main/**` に `font-semibold` を残さず、見出しのウェイトを `font-bold`（700）にしなければならない。生成部品の `CardTitle`・`DialogTitle`・`AlertDialogTitle` も含む（decisions.md Q94）。
- AC-2: THE system SHALL 手書きの部品に `shadow-*` のクラス（`shadow-none` を含む）を残してはならない（decisions.md Q95）。
- AC-3: THE system SHALL `main.css` の `--shadow-*` の打ち消しを保ち、生成部品を含むどの部品にも影を描いてはならない（decisions.md Q95）。
- AC-4: WHEN 生成部品の AlertDialog・Dialog（`AlertDialogContent.vue`・`DialogOverlay.vue`・`DialogScrollContent.vue`）を開いたとき THE system SHALL 背景を MASTER.md「Modals」の `oklch(0 0 0 / 0.6)` で暗くし、`bg-black/80` を残してはならない（decisions.md Q97）。
- AC-5: THE system SHALL 生成部品の Button の `outline` を、ライトとダークの両方で MASTER.md「Buttons」の `.btn-outline`（枠 `--input`・背景は透明・hover で `--muted`）にし、`bg-background`・`dark:bg-input/30`・`dark:hover:bg-input/50` を残してはならない（decisions.md Q96）。
- AC-6: WHERE 画面幅が `md` 以上のとき THE system SHALL ヘッダーの「Discord でログイン」のリンク（`AuthControls.vue`）と、結果の構成の保存のボタン（`ResultBuildCard.vue`）を、AC-5 の `outline` と同じ枠・面・hover にしなければならない（decisions.md Q96）。
- AC-7: WHEN 警告の帯を出すとき THE system SHALL MASTER.md「警告の帯」に合わせて、1px の `--border` の枠と左端の 3px の `--warning` の線を付け、アイコンと文言を併記しなければならない（decisions.md Q27）。
- AC-8: THE system SHALL `ResultAlert.vue` の `info`・`error` の見た目を変えてはならない。
- AC-9: THE system SHALL MASTER.md に「生成部品（`components/ui`）の扱い」の節を足し、トークンで打ち消すもの（角丸・影）と、ソースを直したもの（Title のウェイト・`outline`・オーバーレイの濃さ）を列挙し、shadcn-vue の CLI で上書きしたときは列挙したものを直し直すと書かなければならない（decisions.md Q95・Q97）。
- AC-10: THE system SHALL Web の単体テストで、警告の帯が左端の線と枠のクラスを持つこと、`outline` の variant が AC-5 のクラスを持ち除いたクラスを持たないこと、削除の確認（`DeleteConfirmDialog.vue`）を開いたときのオーバーレイが `bg-black/60` であることを検証しなければならない。
- AC-11: THE system SHALL 見た目以外の挙動（文言・配置・寸法・操作・フォーカスの移り方・`aria-*`）を変えてはならず、既存の Web の単体テスト・Playwright の e2e テストを期待値を変えずに通さなければならない。

## スコープ外
- 上の5点（見出しのウェイト・影・オーバーレイの濃さ・警告の帯・outline）以外の、MASTER.md と生成部品の食い違い（例: MASTER.md「Modals」の面は `--card` だが、生成部品のダイアログは `bg-background`。生成部品の入力欄・ボタンの高さ）
- 生成部品のソースからの `shadow-*` の削除（decisions.md Q95）
- shadcn-vue の CLI による生成部品の更新・追加
- MASTER.md のウェイト・トークンの値の変更（decisions.md Q94）
- PC を主にしたレイアウトの見直し（open-questions.md Q28）
- `tasks/lessons.md` の該当項目（2026-10-26・2026-10-28）の始末（区間 E で行う）
- API・契約・ソルバー・マスターデータの変更

## 契約差分
- なし（画面の見た目だけを変える）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `design-system/skillweave/MASTER.md`（decisions.md Q97 の「生成部品の扱い」の節を足す）

## 依存する機能ID
- 011
