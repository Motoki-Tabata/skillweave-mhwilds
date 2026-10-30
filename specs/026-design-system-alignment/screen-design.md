# 026 design-system-alignment 画面設計

> 標準: `design-system/skillweave/MASTER.md`（配色・文字・形・部品の正）。`pages/` に 026 の上書きは無い。
> 本書は、026 で見た目が変わる部品と、その部品が出る画面だけを書く。画面の追加・遷移の変更・配置の変更は無い（AC-11）。

## キャンバス URL

https://claude.ai/artifact/TQmige4TUq5sja2aoWWUpo （非公開。作成者以外に共有しない）

- 警告の帯（2.1）・outline のボタン（2.2。通常と hover）・削除の確認のダイアログ（2.6）を、ダークとライトの2列で「いま」と「026 の後」を上下に並べた比較ボード。画面全体は描いていない。ダイアログの本文は「[構成の名前]」などの仮の文言にした。キャンバスと本書が食い違うときは本書が正。

## 0. 前提

- 直すのは MASTER.md との食い違いの5点（見出しのウェイト・影・オーバーレイの濃さ・警告の帯・outline）だけ。MASTER.md の値は変えない（decisions.md Q94）。
- 生成部品（`components/ui/`）は、Title 3つ・Button の `outline`・オーバーレイ3つのソースを直す（decisions.md Q97）。角丸と影は `main.css` のトークンで打ち消したまま（`--radius-*` は `--radius`、`--shadow-*` は `0 0 #0000`）。
- 文言・配置・寸法・操作・フォーカスの移り方・`aria-*` は変えない（AC-11）。例外は 2.1 の警告の帯の左端の線だけ（帯の外形は変えず、内側の文字の始まりが 2px 右へ寄る）。

## 1. 画面一覧

| ID | 画面 | URL | 026 で見た目が変わるところ |
|---|---|---|---|
| S1 | 検索画面 | `/` | 警告の帯（時間切れ・護石の読み込み失敗）、outline のボタン（検索の操作・必須スキル・武器のカード・結果の欄）、`md` 以上の結果の構成の「保存」 |
| S2 | 護石の一覧 | `/charms` | outline のボタン（フォーム・一覧の行）、削除の確認のオーバーレイと「キャンセル」 |
| S3 | 個体差のある武器 | `/weapons` | outline のボタン（フォーム・一覧の行）、削除の確認のオーバーレイと「キャンセル」 |
| S4 | 保存した構成の一覧 | `/builds` | outline のボタン（一覧の行・ログインの案内）、削除の確認のオーバーレイと「キャンセル」 |
| S5 | 保存した構成 | `/builds/:id` | 警告の帯（マスターの版の違い）、outline のボタン、削除の確認のオーバーレイと「キャンセル」 |
| 共通 | ヘッダー | 全画面 | `md` 以上の「Discord でログイン」（「非公式の二次創作」のバッジは Badge の `outline` で、変えない） |
| D | ダイアログ | 各画面の上 | 武器の選択（警告の帯・outline）、構成の名前・ログインが必要（outline）、削除の確認（オーバーレイ・「キャンセル」） |

遷移は変えない。見出しのウェイトと影は、画面の見た目がほぼ変わらない（2.4・2.5）。

## 2. 部品ごとの変更

### 2.1 警告の帯（`ResultAlert.vue` の `tone="warning"`。AC-7・AC-8）

出る場所: S1 の結果の欄（時間切れで0件・時間切れで一部の構成）、S1 の護石のカード（護石を読み込めない）、武器の選択のダイアログ（武器を読み込めない）、S5（マスターの版の違い）。

| 項目 | いま | 026 の後 |
|---|---|---|
| 枠 | 1px の `--border`（Alert の既定） | 変えない（1px の `--border`） |
| 左端 | 1px の `--border` | 3px の `--warning` |
| 背景 | `--warning` を 15% 重ねる（`bg-warning/15`） | 変えない（`bg-warning/15`） |
| 文字・アイコンの色 | `--foreground` | 変えない |
| アイコン | lucide `TriangleAlert` と文言を併記 | 変えない |
| 角丸 | `--radius`（4px。`rounded-lg` をトークンで打ち消し） | 変えない |
| 内側の余白 | 上下 12px・左右 16px（Alert の既定） | 変えない |

- 背景は `CharmMatchResult.vue` の帯（`bg-warning/15`）とそろえ、`bg-warning/15` のままにする（decisions.md Q27 の「区間 B で決める」の決定）。MASTER.md の `color-mix(in oklch, var(--warning) 18%, var(--card))` との差は、混ぜる割合の 3 ポイントと色空間の違いだけで、2つの帯が同じ見た目であることを優先する。
- 左端の線で帯の外形（幅・高さ）は変わらない。線が 1px から 3px になる分、アイコンと文言の始まりが 2px 右へ寄る（`CharmMatchResult.vue` と同じ扱い。余白で打ち消さない）。
- `info`・`error` の帯は変えない（AC-8。`error` は `--destructive` の枠のまま、左端も 1px）。

```
┌──────────────────────────────────────┐   ← 1px --border
┃ ⚠  時間の上限で検索を打ち切りました。…    │   ← 左端だけ 3px --warning
└──────────────────────────────────────┘   背景 bg-warning/15・文字 --foreground
```

### 2.2 outline のボタン（`components/ui/button` の `outline`。AC-5）

出る場所: 1 の表の outline のボタンすべて。生成部品の中では、削除の確認の「キャンセル」（`AlertDialogCancel.vue` が `outline` を使う）。

| 項目 | いま（ライト） | いま（ダーク） | 026 の後（両方） |
|---|---|---|---|
| 枠 | 1px の `--border` | 1px の `--input` | 1px の `--input` |
| 面 | `--background` | `--input` を 30% | 透明（下の面がそのまま見える） |
| hover の面 | `--accent`（= `--muted` と同じ値） | `--input` を 50% | `--muted` |
| 文字 | `--foreground` | `--foreground` | `--foreground`（hover も同じ） |
| 高さ・余白・角丸・フォーカスリング | — | — | 変えない |

- ライトでは、カードの上のボタンの面が `--background`（`#f5f7f9`）から透明（カードの `#ffffff`）になり、枠が `--border`（`#d7dbe0`）から `--input`（`#7a8188`）に濃くなる。枠は MASTER.md「Contrast」の「入力部品の枠 / 面」3.94:1 を満たす。
- ダークでは、面の `--input` の 30% が無くなり、hover が `--muted` になる。
- `disabled` の見た目（不透明度 50%）は変えない。

### 2.3 `md` 以上の「Discord でログイン」と構成の「保存」（AC-6）

対象: ヘッダーの「Discord でログイン」のリンク（`AuthControls.vue`）、S1 の結果の構成のカードの「保存」（`ResultBuildCard.vue`）。

- 基準幅（〜767px）は、いまのまま 44×44px のアイコンだけのボタン（ghost）。変えない。
- `md`（768px〜）以上は、2.2 の 026 の後の outline と同じ枠・面・hover にする（枠 1px の `--input`・面は透明・hover で `--muted`）。高さ 40px・左右の余白 16px・アイコンと文言の並びは変えない。
- いまはダークで `--input` を 30% の面、ライトで `--background` の面を持つ。これを無くす。

### 2.4 見出しのウェイト（AC-1）

- 画面タイトル（20px）・セクションの小見出し（16px）・ダイアログのタイトル・構成のカードの見出しなど、いま 600 を指定している見出しを 700 にする。生成部品の `CardTitle`・`DialogTitle`・`AlertDialogTitle` の既定も 700 にする。
- 配信するフォント（IBM Plex Sans JP・Inter）は 400・500・700 だけなので、フォントの読み込み後は、いまも 700 で描かれている。見た目が変わるのは、読み込み前と読み込みに失敗したときのフォールバックのシステムフォントの間だけ（decisions.md Q94）。
- 文字の大きさは変えない（どの画面も `text-base`・`text-xl` を指定して使っており、`DialogTitle`・`AlertDialogTitle` の既定の `text-lg` は画面に出ていない。スコープ外）。

### 2.5 影（AC-2・AC-3）

- 手書きの部品（`PickerDialog.vue`・`BuildDialogFrame.vue`・`AppToaster.vue`・`AuthControls.vue`・`ResultBuildCard.vue`）の `shadow-*` を消す。`main.css` が影のトークンを打ち消しているので、画面の見た目は変わらない。
- 生成部品の `shadow-*` は残し、`main.css` の打ち消しで影を描かない。

### 2.6 オーバーレイ（AC-4）

| 部品 | いま | 026 の後 |
|---|---|---|
| 削除の確認（`AlertDialogContent.vue`。S2〜S5 の削除） | 黒の 80%（`bg-black/80`） | 黒の 60%（`bg-black/60`。MASTER.md「Modals」の `oklch(0 0 0 / 0.6)`） |
| `DialogOverlay.vue`・`DialogScrollContent.vue` | 黒の 80% | 黒の 60%（いまは画面から使っていない） |
| 選択・構成のダイアログ（`AppDialogOverlay.vue`） | 黒の 60% | 変えない |

- ぼかしは使わない（MASTER.md「Shape」）。オーバーレイの範囲・開閉のアニメーションは変えない。
- 削除の確認の背景が、ほかのダイアログ（`AppDialogOverlay.vue`）と同じ暗さになる。

## 3. 幅の見積もり

- 1行に並べる要素・その幅は変わらない。outline の枠はいまも 1px で、`md` 以上の「ログイン」「保存」もいまも 1px の枠を持つ。
- 警告の帯は、外形が変わらず、内側の幅が 2px 狭くなる。最小幅 360px での帯の文言の内幅（いま 約 294px）が 約 292px になり、折り返しの位置が1字ぶん変わることがある。帯は折り返して高さを伸ばす部品なので、はみ出しは起きない。

## 4. 状態

| 部品 | 状態 | 見た目 |
|---|---|---|
| outline | 通常 | 2.2 の 026 の後 |
| outline | hover | 面が `--muted` |
| outline | フォーカス | いまのまま（`--ring` のリング） |
| outline | `disabled` | いまのまま（不透明度 50%） |
| 警告の帯 | 表示 | 2.1 の 026 の後 |
| 削除の確認 | 開いている | 背景を黒の 60% で暗くする |

## 5. 受入基準との対応

| 受入基準 | 対応する箇所 |
|---|---|
| AC-1 見出しのウェイト | 2.4 |
| AC-2・AC-3 影 | 2.5 |
| AC-4 オーバーレイ | 2.6 |
| AC-5 `outline` | 2.2 |
| AC-6 `md` 以上の「ログイン」「保存」 | 2.3 |
| AC-7 警告の帯 | 2.1 |
| AC-8 `info`・`error` を変えない | 2.1 の末尾 |
| AC-9 MASTER.md の節 | 6 |
| AC-10 単体テスト | 画面なし（検証する値は 2.1・2.2・2.6） |
| AC-11 見た目以外を変えない | 0・3 |

## 6. MASTER.md に足す・直す内容（区間 D で書く）

- 「Component Specs」に「生成部品（`components/ui`）の扱い」の節を足す（AC-9）。トークンで打ち消すもの（角丸: `--radius-*` を `--radius` に、影: `--shadow-*` を `0 0 #0000` に）と、ソースを直したもの（`CardTitle`・`DialogTitle`・`AlertDialogTitle` のウェイト・Button の `outline`・`AlertDialogContent.vue`・`DialogOverlay.vue`・`DialogScrollContent.vue` のオーバーレイの濃さ）を列挙し、shadcn-vue の CLI で上書きしたときは列挙したものを直し直すと書く。
- 「Component Specs」の冒頭の「生成物は手で編集しない」は、足す節と食い違うので、「見た目はトークンで変え、トークンで変えられないものだけ『生成部品の扱い』の節に列挙してソースを直す」の趣旨に直す（decisions.md Q97 の決定に合わせる）。
