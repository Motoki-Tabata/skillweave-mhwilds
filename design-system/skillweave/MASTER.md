# Design System Master File

> **LOGIC:** 特定の画面を作るときは、まず `design-system/skillweave/pages/<page-name>.md` を確かめる。
> そのファイルがあれば、その規則が本ファイルより**優先**する。無ければ本ファイルの規則に従う。
>
> 本ファイルは swv の**デザインシステムの唯一の正（SSoT）**である。見た目（配色・フォント・形・動き・部品の見た目）に加え、
> レイアウト・フォーム・状態表現・UI 文言・アクセシビリティの規約もここで定める。他の文書は値や規約を書き写さず、本ファイルを参照する。
>
> - **手で保守する。** ui-ux-pro-max で `--persist --force` を付けて再生成すると、統合した内容が失われる。再生成はしない。
> - **参照は見出し名で書く**（例: 「MASTER.md の Typography」）。節番号は振らない。見出し名を変えるときは、参照元を grep して同時に直す。

---

**Project:** Skillweave（swv）
**Generated:** 2026-10-08（ui-ux-pro-max の生成結果を土台に、合意した方向性で全面的に書き換えた）
**Direction:** 鍛冶場の鉄
**Base Style:** Minimalism & Swiss Style（ダーク）
**Design Dials:** Variance 3/10（整列・控えめ）| Motion 3/10（控えめ）| Density 8/10（高密度）

---

## 適用範囲

- `apps/web/src/main/**` のすべての画面・コンポーネントに適用する。
- トークンの実装は `apps/web/src/main/assets/main.css` に集約する（Tailwind v4 は設定ファイルを持たない）。値の正は本ファイルで、`main.css` は本ファイルに合わせる。
- 本ファイルは「何を守るか」を定める。個々の画面のレイアウトは `specs/NNN-<slug>/screen-design.md` が定め、画面別に本ファイルの規則を上書きする必要があるときだけ `pages/<page-name>.md` を作る。
- TSOD の画面設計（`/tsod-screen-table`）は本ファイルに従う。

---

## 方向性

- **鍛冶場の鉄**: 青みのある鉄灰の面に、熱した鉄の橙を差し色として1色だけ使う。細い罫線と刻印風の小見出しで、装備を鍛えて組む場の空気を**ほのかに**出す。装飾で世界観を語らず、数値と構成が主役の情報ツールであることを優先する。
- **ダークが既定、ライトにも対応する。** ダークの橙は「赤熱した鉄」、ライトの橙は「冷えて焼き色の付いた鉄」とし、同じ役割を明るさを変えて担わせる。
- **PC を主とし、スマホでも同じ情報構造にする。** 幅が狭いときは並びを詰めるだけにし、スマホ専用の別の見せ方は作らない。
- 公式のロゴ・画像・アイコン・フォントは使わない。ゲームの UI の模倣もしない。

---

## Global Rules

### Color Palette

shadcn-vue の変数名に合わせる。値は OKLCH が正で、HEX は参考値（sRGB に変換したもの）。

| Role | CSS Variable | Dark（既定） | Light |
|------|--------------|--------------|-------|
| 背景 | `--background` | `oklch(0.185 0.010 250)` `#0f1317` | `oklch(0.975 0.004 250)` `#f5f7f9` |
| 面（カード） | `--card` / `--popover` | `oklch(0.220 0.012 250)` `#161b20` | `oklch(1 0 0)` `#ffffff` |
| 一段上の面 | `--muted` / `--secondary` / `--accent` | `oklch(0.260 0.013 250)` `#1f252a` | `oklch(0.945 0.006 250)` `#eaedf1` |
| 装飾の罫線 | `--border` | `oklch(0.320 0.014 250)` `#2e343a` | `oklch(0.890 0.008 250)` `#d7dbe0` |
| 入力部品の枠 | `--input` | `oklch(0.520 0.016 250)` `#626a72` | `oklch(0.600 0.014 250)` `#7a8188` |
| 文字 | `--foreground`（`*-foreground` の既定） | `oklch(0.935 0.005 250)` `#e7eaed` | `oklch(0.210 0.012 250)` `#14191e` |
| 補助の文字 | `--muted-foreground` | `oklch(0.730 0.014 250)` `#a1a9b0` | `oklch(0.470 0.016 250)` `#545c64` |
| 差し色 | `--primary` / `--ring` | `oklch(0.730 0.165 52)` `#f68534` | `oklch(0.560 0.155 45)` `#bb4f0c` |
| 差し色の上の文字 | `--primary-foreground` | `oklch(0.180 0.020 52)` `#190f09` | `oklch(1 0 0)` `#ffffff` |
| 破壊的・エラー | `--destructive` | `oklch(0.660 0.200 15)` `#f34e6a` | `oklch(0.540 0.210 18)` `#cc103d` |
| 警告 | `--warning` | `oklch(0.840 0.150 88)` `#f3c443` | `oklch(0.840 0.150 88)` `#f3c443` |
| 成功 | `--success` | `oklch(0.760 0.140 155)` `#5ccb89` | `oklch(0.560 0.130 155)` `#1a8a51` |
| チャート1 | `--chart-1` | `oklch(0.730 0.165 52)` `#f68534` | `oklch(0.560 0.155 45)` `#bb4f0c` |
| チャート2 | `--chart-2` | `oklch(0.720 0.110 235)` `#57afe0` | `oklch(0.540 0.120 245)` `#2274af` |
| チャート3 | `--chart-3` | `oklch(0.780 0.110 185)` `#55cec0` | `oklch(0.580 0.100 190)` `#018d87` |
| チャート4 | `--chart-4` | `oklch(0.720 0.130 305)` `#b88fe6` | `oklch(0.540 0.150 305)` `#8353b3` |
| チャート5 | `--chart-5` | `oklch(0.840 0.120 120)` `#c0d67a` | `oklch(0.600 0.130 135)` `#5d913c` |

**Color Notes:**

- 色は情報と操作の誘導にだけ割り当てる。背景・面・罫線・文字は鉄灰（色相 250・彩度 0.016 以下）に保つ。
- 差し色（橙）を使うのは、主要ボタン・フォーカスリング・選択中の印・小見出しの印・レベルの充足表示だけ。1画面で橙の面が広くならないようにする。
- 赤（`--destructive`）は橙と明るさが近い（ダークで 1.36:1）。削除ボタンは**枠線だけ**の見た目にし、必ず文言を添える。色だけで区別させない。
- `--warning` は、ライトの背景に対して文字や枠線に使えるコントラストを持たない。どちらのテーマでも薄い背景と左端の太線として使い、文字は `--foreground` にする。
- スキルの種類（武器・防具・シリーズ・グループ）・ランク・スロットの種別は、色分けしない。文字と位置で区別する。公式の配色は使わない。
- チャートの色は、カテゴリの区別（構成 A〜E など）に使う。順番は1から使い、5色を超える比較は作らない。色だけで区別させず、凡例のテキストを必ず併記する。

### Contrast（WCAG 2 のコントラスト比・計算値）

基準: 文字は 4.5:1 以上、UI 部品と境界は 3:1 以上。

| 組み合わせ | Dark | Light | 基準 |
|---|---|---|---|
| 文字 / 背景 | 15.40 | 16.48 | 4.5 |
| 文字 / 面 | 14.30 | 17.71 | 4.5 |
| 文字 / 一段上の面 | 12.83 | 15.08 | 4.5 |
| 補助の文字 / 背景 | 7.80 | 6.34 | 4.5 |
| 補助の文字 / 一段上の面 | 6.50 | 5.80 | 4.5 |
| 差し色の上の文字 / 差し色 | 7.49 | 4.96 | 4.5 |
| 差し色（リング・印） / 背景 | 7.40 | 4.62 | 3 |
| 入力部品の枠 / 背景 | 3.39 | 3.67 | 3 |
| 入力部品の枠 / 面 | 3.15 | 3.94 | 3 |
| 破壊的 / 背景 | 5.43 | 5.27 | 4.5 |
| 破壊的 / 面 | 5.04 | 5.66 | 4.5 |
| 成功 / 面 | 8.53 | 4.37 | 3 |
| チャート1〜5 / 面（最小） | 6.65 | 3.77 | 3 |

- `--border` は装飾の区切り線なので 3:1 を求めない。部品の境界を示す線には `--input` を使う。
- 値を変えたら、この表を計算し直す（OKLCH を sRGB に変換して WCAG 2 の式で求める）。

### Typography

- **和文・欧文: IBM Plex Sans JP**（本文・見出し・ラベルのすべて）。和文と欧文が同じファミリーなので、混植しても形が揃う。
- **数字: Inter**（`font-variant-numeric: tabular-nums` を付ける）。数値は本アプリの主役なので、字形が大きく素直で、桁幅が揃うものを選んだ。
- ウェイトは 400（本文）・500（ラベル・ボタン）・700（見出し・小見出し）の3つだけを使う。
- **Mood:** 工業的・精密・落ち着き
- **Google Fonts:** [IBM Plex Sans JP + Inter](https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;700&display=swap)

```css
font-family: 'IBM Plex Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', 'Noto Sans CJK JP', system-ui, sans-serif;
/* 数値 */
font-family: 'Inter', 'IBM Plex Sans JP', system-ui, sans-serif;
font-variant-numeric: tabular-nums;
```

- 配信は Google Fonts の CDN を使う（和文が文字の範囲ごとに分割され、使う文字の分だけが読み込まれるため）。`display=swap` を付け、読み込み前はフォールバックのシステムフォントで表示する。
- 数値に Inter を当てる範囲: スキルレベル・火力・防御・会心率・スロット数・個数など、比較や読み取りの対象になる数値。文中の数字（「3件」など）は本文のフォントのままでよい。
- 読み込み前と読み込みに失敗したときは、上のフォールバックのシステムフォントで表示が崩れないようにする（iOS は Hiragino 系、Android は Noto Sans CJK JP を明示する。`system-ui` に任せると端末ごとに表示が揺れるため）。

#### Type Scale

| 用途 | サイズ | 行間 |
|---|---|---|
| 基準（本文・入力欄・表） | 14px | 1.5 |
| 補助テキスト（説明・注記・小見出し） | 12px | 1.5 |
| 見出し（画面タイトル） | 20px | 1.4 |
| 小見出し（セクション） | 16px | 1.4 |

- 入力欄の文字は、基準幅（〜767px）で 16px、`md`（768px〜）以上で 14px にする。iOS Safari は、16px 未満の入力欄にフォーカスすると画面を拡大するため。
- 上の4サイズ以外は使わない（Tailwind のクラスでは `text-xs`・`text-sm`・`text-base`・`text-xl` に当たる）。

### Shape

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `0.25rem`（4px） | ボタン・入力欄・カード・ダイアログ |
| 罫線の太さ | 1px | カードの縁・表の行・区切り |
| 強調の線 | 3px | 警告の左端・選択中の行の左端 |

- **影を使わない。** 面の段差は、背景 → 面 → 一段上の面の明るさの差と、1px の罫線だけで表す。ダイアログの下は背景を暗くする（`oklch(0 0 0 / 0.6)`）だけで、ぼかしは使わない。
- 角丸は 4px で統一する。丸いピルの形は、件数のバッジだけに使う。

### Density

*Density: 8/10 — 高密度*

間隔は 4px を基準にする（Tailwind の既定のスケールのまま。独自の間隔トークンは作らない）。

| 対象 | 値 |
|---|---|
| フォーム部品（入力欄・Select・ボタン）の高さ | 40px |
| 操作領域（行内のアイコンボタン・チェックボックスとラジオの行・一覧の選択肢） | 高さ 44px 以上。アイコンボタンは 44×44px |
| 読むだけの表の行 | 約 33px（上下の余白 6px） |
| 表のセルの左右の余白 | 12px |
| カードの内側余白 | 16px |
| セクション間・部品間の間隔 | 16px・8px |

### Shadow Depths

使わない（上の Shape を参照）。

---

## Layout

### 対応画面サイズ

最小対応幅は 360px（320px 幅の端末は対象外）。

| 区分 | 幅 | レイアウト | ページ余白 |
|---|---|---|---|
| 基準 | 〜767px | 1カラム | 16px |
| `md` | 768px〜 | 1カラム。コンテンツの最大幅 720px で中央に置く | 24px |
| `lg` | 1024px〜 | 2カラムにしてよい。コンテンツの最大幅 1280px で中央に置く | 24px |

- どの幅でも**ページ全体の横スクロールは発生させない**。収まらない表はその表の中だけで横スクロールさせる（`overflow-x: auto` を表のコンテナに置き、ページ本体には置かない）。
- 方向性の「PC を主とし、スマホでも同じ情報構造にする」に合わせたブレークポイントの見直しは、次に画面設計を行う機能で決め、本表を直す。

### 画面骨格

- ヘッダーは上部に固定する（高さ 48px）。左にサイト名と「非公式の二次創作」のバッジ、右端にログインの導線の場所を1か所だけ確保する。
- マスターデータの出典（リポジトリとコミット）のクレジットは、画面の下端に固定した1行のバー（高さ 32px・12px）に出す。読込中・読込失敗の画面でも出す。
- 一覧から選ぶダイアログは、基準幅ではヘッダーとクレジットのバーのあいだを覆う（二次創作の表記とクレジットを隠さない）。`md` 以上では画面の中央に出す。
- ナビゲーションは、画面が複数になる機能で決める。
- **二次創作である旨を常に見える場所に表記する。** `©CAPCOM` は表記しない（`temp/initial-design.md` §1）。
- ログイン状態による出し分けは1箇所に集約し、コンテンツ側に判定を散らさない。サーバー側でも必ず拒否する（画面の出し分けは導線の整理であって、権限制御そのものではない）。

---

## Component Specs

部品は shadcn-vue の生成物（`apps/web/src/main/components/ui/`）をそのまま使い、見た目はトークンで変える。生成物は手で編集しない。下の CSS は見た目の意図を示すもので、実装はトークンを介する。

### 小見出し（刻印風）

```css
.eyebrow {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
  color: var(--muted-foreground);
}
.eyebrow::before { content: ""; width: 6px; height: 6px; background: var(--primary); }
.eyebrow::after  { content: ""; flex: 1; height: 1px; background: var(--border); }
```

- 小見出しの文言は日本語で書く。英字の飾りのラベル（`SKILLS` など）は使わない。

### Buttons

```css
.btn { height: 40px; padding: 0 16px; border-radius: var(--radius); font-weight: 500; cursor: pointer;
       transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.btn-primary     { background: var(--primary); color: var(--primary-foreground); }
.btn-primary:hover { background: color-mix(in oklch, var(--primary) 88%, var(--foreground)); }
.btn-outline     { background: transparent; color: var(--foreground); border: 1px solid var(--input); }
.btn-outline:hover { background: var(--muted); }
.btn-destructive { background: transparent; color: var(--destructive); border: 1px solid var(--destructive); }
.btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
```

- 主要ボタン（橙の面）は1画面に1つにする。
- hover で位置や大きさを動かさない（`transform` を使わない）。

### Cards

```css
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
```

- カード全体をクリックできるようにする場合だけ、hover で枠線を `--input` に変える。浮き上がる演出はしない。

### Inputs

```css
.input { height: 40px; padding: 0 12px; background: transparent; color: var(--foreground);
         border: 1px solid var(--input); border-radius: var(--radius); }
.input:focus-visible { border-color: var(--ring); outline: 2px solid var(--ring); outline-offset: 0; }
.input[aria-invalid="true"] { border-color: var(--destructive); }
```

### 表（スキル一覧・構成の結果）

- 行の区切りは `--border` の 1px。縞模様は使わない。
- 数値の列は右揃え・Inter・`tabular-nums`。
- 選択中の行は、左端の 3px の橙の線と `--muted` の背景で示す（色だけにしないため、線の形も併用する）。

### レベルの充足表示

- スキルレベルは、数値（`Lv 3`）と、最大レベル分の小さな四角（8×12px）を並べて示す。満たした分は `--primary` で塗り、満たしていない分は `--input` の枠線だけにする。数値を必ず併記する。

### Modals

```css
.modal-overlay { background: oklch(0 0 0 / 0.6); }
.modal { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
```

### 警告の帯

```css
.note-warning { background: color-mix(in oklch, var(--warning) 18%, var(--card));
                border: 1px solid var(--border); border-left: 3px solid var(--warning);
                color: var(--foreground); border-radius: var(--radius); padding: 8px 12px; }
```

---

## Forms

| 規約 | 内容 |
|---|---|
| ラベル位置 | 入力欄の**上**。`shadcn-vue` の既定構成をそのまま使う |
| 必須表示 | ラベルの右に「必須」バッジ。`※` や色だけの表現は使わない |
| エラー表示 | 該当項目の**直下**に `--destructive` の文字。フォーム先頭に総括メッセージは出さない |
| 検証タイミング | フォーカスを外した時 ＋ 送信時。**入力中は出さない**。チェックボックスとラジオは、変更そのものが確定の操作なので、変更した時点で出してよい |
| 送信中 | ボタンを無効化し、ラベルを「保存中…」に変える（二重送信防止）。ただし、キャンセルとやり直しのできる処理（検索など）は、ボタンを無効にせず「<動詞>し直す」に変えて有効のままにし、「キャンセル」を横に置く（やり直すと前の処理を打ち切るので、二重送信にならない） |

---

## States

| 状態 | 表現 |
|---|---|
| 読込中（300ms未満の想定） | **何も出さない**（ちらつきを避ける） |
| 読込中（一覧） | スケルトン |
| 読込中（ボタン起因） | ボタン内スピナー＋無効化 |
| 操作成功 | トースト（画面右上・数秒で自動的に消える） |
| 項目起因のエラー | 該当項目の直下（Forms の「エラー表示」） |
| 通信・サーバーエラー | トースト（`--destructive`）。ただし、画面の主な機能が使えなくなるエラー（データの読込失敗など）は、消えないインラインの表示にし、原因と次の行動（再読み込みなど）を出す |
| 破壊的操作の確認 | ダイアログ |
| 空 | 「護石が登録されていません」等の文言＋次の操作への導線 |

- トーストの実装には **Reka UI の Toast プリミティブ**を使う。`vue-sonner` 等の追加依存は入れない（依存削減の方針）。

---

## UI Copy

| 規約 | 内容 |
|---|---|
| ラベル | 体言止め（「護石名」「スロット」） |
| メッセージ | 敬体（「保存しました」「入力してください」） |
| 新規登録のボタン | 「登録」 |
| 既存の変更のボタン | 「保存」 |
| 取り消し | 「キャンセル」 |
| 検索の実行 | 「検索」（実行中は「検索し直す」） |
| 読み込みのやり直し | 「再読み込み」 |
| モーダルを閉じるだけ | 「閉じる」 |
| エラー文言 | 原因と次の行動をセットで書く |
| 日時 | `YYYY/MM/DD hh:mm`（ブラウザのローカル時刻で表示する。保存は UTC） |
| 日付のみ | `YYYY/MM/DD` |

**禁止事項**

- 「エラーが発生しました」だけの文言（何をすればよいか分からない）
- 英語のままの表示（「Loading...」「No data」等）

### 用語の統一

ゲーム内の用語（スキル名・部位名など）は、マスターデータの日本語辞書（`packages/data`）の表記に合わせる。UI 独自の言い換えはしない。表記の揺れが見つかったら本節に追記する。

---

## Accessibility

**WCAG 2.2 レベル AA 相当を設計時の判断基準とする。** 適合宣言や第三者監査は行わない（コストに見合わないため）が、次の5点は標準として守る。

1. 文字と背景のコントラスト比は **4.5:1 以上**。UI 部品・境界線は **3:1 以上**（値は Contrast の表）。
2. **情報を色だけで伝えない。** 色には必ず文字・形・位置のいずれかを併記する。
3. **キーボードだけで全操作ができる。** 護石の手入力を素早く行えるため、実利も大きい。
4. **フォーカス位置が常に見える。** `--ring` によるフォーカスリングを消さない。
5. フォームの入力欄には必ず `<label>` を関連付ける（プレースホルダをラベル代わりにしない）。

---

## Style Guidelines

**Style:** Minimalism & Swiss Style（ダーク）＋ 鍛冶場の鉄

**Keywords:** 鉄灰・赤熱・刻印・罫線・整列・高密度・数値が主役

**Best For:** 情報量の多い表と、構成の比較が中心の画面

**Key Effects:** 150〜200ms の色の変化だけ。罫線と明るさの差で階層を作る。

### Page Pattern

**Pattern Name:** ツール画面（作業領域が主）

- 画面の上にヘッダー、下にクレジットのバーを置き、その間を作業領域にする（骨格は Layout の「画面骨格」）。
- 作業領域は「条件（入力）」と「結果（表・比較）」の2つのまとまりで構成する。PC では左右に並べ、狭い幅では上下に積む。
- 宣伝用のヒーロー・大きな画像・装飾のイラストは置かない。

---

## Motion

- 状態の変化（hover・選択・開閉）は 150〜200ms の `ease` で、色と不透明度だけを変える。
- 出現の演出（スクロールで表示する・ずらして表示するなど）は使わない。新しい結果は即座に置き換える。
- `prefers-reduced-motion: reduce` のときは、トランジションを 0ms にする。
- アニメーションのライブラリは入れない（CSS のトランジションと `tw-animate-css` だけで足りる）。

---

## Anti-Patterns (Do NOT Use)

- ❌ 公式のロゴ・画像・アイコン・フォント、ゲーム UI の模倣
- ❌ 背景・面・罫線への有彩色（鉄灰以外）
- ❌ 影・ぼかし・グロー・グラデーションの面
- ❌ 紫や青のグラデーションなど、方向性と無関係な流行の装飾
- ❌ 英字の飾りのラベル（`SKILLS`・`BUILD` など）
- ❌ 赤と橙だけで意味を区別すること
- ❌ hover で位置・大きさを動かす演出

### Additional Forbidden Patterns

- ❌ **アイコンとしての絵文字** — アイコンは lucide に統一する
- ❌ **クリックできる要素に `cursor: pointer` が無い**
- ❌ **レイアウトがずれる hover**
- ❌ **コントラスト不足の文字**（4.5:1 未満）
- ❌ **見えないフォーカス**

---

## Pre-Delivery Checklist

UI のコードを出す前に確かめる。

- [ ] ダークとライトの両方で表示を確かめた
- [ ] 色はトークンだけを使い、色の値を直書きしていない
- [ ] 差し色の面（主要ボタン）は1画面に1つ
- [ ] 比較・読み取りの対象の数値に Inter と `tabular-nums` が当たっている
- [ ] 色だけで情報を伝えていない（文言・形・位置を併記している）
- [ ] フォーカスリングが見える
- [ ] `prefers-reduced-motion` で動きが止まる
- [ ] 360px・768px・1024px・1440px でページ全体の横スクロールが出ない
- [ ] 固定のヘッダーとクレジットのバーの下に内容が隠れていない

---

## 関連ドキュメント

- [`apps/web/src/main/assets/main.css`](../../apps/web/src/main/assets/main.css) — トークンの実装
- [`design/tech-stack.md`](../../design/tech-stack.md) — 技術スタックの選定理由（shadcn-vue + Reka UI + Tailwind v4）
- [`design/data-model-standard.md`](../../design/data-model-standard.md) — データモデル設計標準
