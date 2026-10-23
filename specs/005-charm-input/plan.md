# 005: charm-input 計画

## スタック
- 既存（`design/tech-stack.md` の現行どおり。`apps/web/package.json`・`packages/*/package.json` の版を変えない）: Node 24・TypeScript 6.0.3・Vue 3.5.43・Vue Router 5.3.1・Pinia 4.0.3・Vite 8.3.1・Tailwind CSS 4.3.3・Vitest 5.0.1・jsdom 30.1.1・@vue/test-utils 2.5.1・npm `highs` 1.15.3・`@playwright/test` 1.63.0・`@lucide/vue`・`reka-ui`（版は `apps/web/package.json` のまま）・`yaml` 2.9.1（`packages/data`）
- 依存は足さない。
  - IndexedDB はライブラリを使わずネイティブの API で扱う（decisions.md Q32）。
  - UUIDv7 は自前で実装する（`design/data-model-standard.md`「主キー・採番方針」）。
  - `fake-indexeddb` は足さない。単体テストは保存層を差し替えて行い、実際の IndexedDB は e2e で確かめる（D9）。
- shadcn-vue の CLI は、004 と同じ `shadcn-vue@2.8.2` を `pnpm dlx` で使う。依存には入れない（D15）。
- マスターデータ: `packages/data/dist/master-2026.10.3.json`・`.ja.json`・`.en.json`。版を上げて再生成する（D4）。MHDB のコミットは `c50a1eb` のまま。

## データモデル
- テーブル: なし（ゲート B-2 は該当なし。010 charm-save で作る）。
- 端末の IndexedDB に保存する護石の形は screen-design.md 4 のとおり（`id`・`payload`・`schemaVersion`・`createdAt`・`updatedAt`）。データベースとストアの名前は D8 で決める。
- マスターの JSON の形の変更（DB ではない）: 辞書の項目 `DictionaryEntry` に、任意の `reading?: string` を足す。ja の辞書のスキルの項目だけが持つ（D1）。`MasterBundle` の型は変えない（spec のスコープ外）。

## 決定事項

### マスターデータ（packages/data。data-agent）
- D1: スキルの読みの overlay の書式と、辞書への出し方（decisions.md Q34）。
  - overlay の最上位のキーに `readings` を足す。値は「スキル ID → 読み」の組で、全ファイルを通じて同じ ID は1回だけ書ける。置き場は `packages/data/overlays/readings.yaml`（キーの名前で読むので、ファイル名は規則にしない）。
    ```yaml
    readings:
      sk:850626240: こうげき
      sk:-1689391744: たいじゅつ
    ```
  - 読みは、ひらがな（U+3041〜U+3096）と長音符「ー」だけからなる、空でない文字列にする。記号（「・」「【】」）は読みに含めない。英字のスキル名は読みをひらがなで書く（例: 「ＫＯ術」→「けーおーじゅつ」）。
  - overlay の読み込みで、次をファイル名と行・桁を示すエラーにして生成を失敗させる。既存の `replace` と同じ経路を使う。
    - 存在しない ID。
    - スキル（`sk:`）以外の ID。
    - 同じ ID の重複。
    - 文字列でない値。
  - 読みは ja の辞書のスキルの項目の `reading` に出す。en の辞書と、スキル以外の項目には出さない。`index.ts` の `DictionaryEntry` に `reading?: string`（スキルの ja だけが持つ）を足す。
  - overlay の適用の結果（`OverlayResult`）に読みを持たせ、`generate.ts` が検証の前に ja の辞書へ重ねる。関数の分け方は data-agent が決める。
- D2: 読みの検証（`validate.ts`）。出力の前に、次を違反にする。規則名は `dictionary-reading`。
  - ja の辞書で、すべてのスキル（武器・防具・シリーズ・グループの 179 件）が `reading` を持つ。
  - `reading` が D1 の文字種に合う。
  - en の辞書とスキル以外の項目には `reading` が無い。
  - すべてのスキルに読みを求めるのは、受入基準（すべてのスキルの読みを書く）を検証で守るため。MHDB の更新でスキルが増えたときも、読みを足すまで生成が失敗する。
- D3: 抽選テーブル（`appraisedCharm`）の検証を足す。オーナーが手で起こしたテーブルの誤りを、照合の関数（D10）が黙って扱わないようにするため。既存の、スキルのレベルとスロットの検査に加えて、次を違反にする。規則名は `appraised-charm`。
  - `groups` の `group` の名前が重複する。
  - `patterns[].skillGroups` の要素が、null でも `groups` にある名前でもない。
  - `skillGroups` の長さが 3 を超える。
  - `slotPatterns` の要素（スロットの並び）の長さが 3 を超える。
  - `groups[].skills` に、武器スキル・防具スキル以外のスキルがある。
  - 鑑定護石のレア度の範囲（5〜8）は検証しない（パイプラインへの移設は spec のスコープ外。decisions.md Q32）。
- D4: マスターの版を `2026.10.3` に上げる（`config.ts` の `MASTER_VERSION`）。読みと、起こせた抽選テーブルを同じ版に含める。
  - `dist/` の再生成は生成物なのでワーカーの書込許可に無い。メインが `pnpm --filter @swv/data run generate` で行う（tasks T5）。生成のコマンドが `2026.10.2` の3ファイルを削除する。
  - 再生成の後、`pnpm --filter @swv/data run generate:check` が一致を返すことを確かめる。
  - `dist.spec.ts` の版の期待値も `2026.10.3` に直す。
- D5: 読みの下書きと、オーナーの確認・抽選テーブルの入力。
  - data-agent が、179 件すべての読みの下書きを `overlays/readings.yaml` に書く（decisions.md Q34）。並びはスキル ID の昇順にし、各行の末尾に `# <ja の名前>` のコメントを付ける（オーナーが確かめやすいように）。
  - data-agent の後に、メインがオーナーに読みの確認を求める（tasks T4）。直しは、オーナーが `readings.yaml` を直接直すか、data-agent を新規起動して直させる。
  - 抽選テーブルは、オーナーが起こせたレア度の分を `packages/data/overlays/appraised-charm.yaml` に直接書く（decisions.md Q3）。メインは T4 で、テーブルを入れるかをオーナーに尋ねる。入れないなら、`appraisedCharm` は空のまま T5 に進む（005 の完了条件にしない）。
  - 後から足すテーブルは、版を上げて再生成する別の作業にする。
- D6: data のテストはフィクスチャで書く。照合の正しさは web のテスト用のテーブルで確かめ、実データのテーブルには依らない（decisions.md Q3）。
  - overlay の読み込み: 読みが辞書に出ること、D1 の各エラーの位置。
  - 検証: D2・D3 の各違反。
  - コミット済みの `dist/`: 版が `2026.10.3` で、ja の辞書のすべてのスキルに読みがあり、en に読みが無い。

### 画面の純粋な部品（apps/web/src/main/lib。web-agent）
- D7: UUIDv7 と日時（`lib/uuidv7.ts`）。
  - RFC 9562 の UUIDv7 を、`Date.now()` のミリ秒と `crypto.getRandomValues` の乱数で作る。小文字の 8-4-4-4-12 の形にする。
  - 時計と乱数の源を引数で差し替えられるようにする（テストで、版の4ビット・variant の2ビット・先頭48ビットの時刻を確かめる）。
  - 同じミリ秒の中の単調増加は保証しない。登録はユーザーの操作の単位で、並びの逆転は実害が無いため。
  - `createdAt`・`updatedAt` は `new Date().toISOString()`（UTC）。
- D8: 端末の保存（`lib/charms/storage.ts`）。
  - データベースの名前は `swv`、版は `1`、ストアの名前は `charms`（`keyPath: 'id'`）。版 1 の `onupgradeneeded` でストアを作る。将来の端末の保存（下書きなど）も同じデータベースにストアを足す。
  - `schemaVersion` は `1`。読み込んだ値の `schemaVersion` が 1 でなければ、その護石を読み飛ばさず「端末への保存（IndexedDB）に失敗しました。」の扱いにする。005 には移行が無いので、黙って捨てない。
  - 型は `StoredCharm`（screen-design.md 4 の形）。インターフェース `CharmRepository` を `list()`・`put(charm)`・`delete(id)` で定める。IndexedDB の実装は `openCharmRepository(factory = globalThis.indexedDB)` で作る。
  - 一覧の並び（ID の降順）は、呼び出し側で並べ直す。
  - 失敗の原因は3つに分け、screen-design.md 3.4 の文言に対応させる。
    - `unavailable`: `indexedDB` が無い、`open` の失敗（`SecurityError`・`InvalidStateError` など）、`blocked`。
    - `quota`: `QuotaExceededError`。
    - `unknown`: それ以外。
  - 例外から原因への変換は純粋な関数にして、単体テストで確かめる。IndexedDB の実装そのものの読み書きは e2e で確かめる（D9）。
- D9: IndexedDB の単体テストの方法（handoff の要確認事項）。
  - jsdom に IndexedDB は無く、`fake-indexeddb` は依存の追加になる（spec の常時許可外に無い）。そのため、護石のストア（D13）は `CharmRepository` を差し替えられる形にする。
  - 単体テストは、メモリ上の実装（`src/test/support/` に置く）と、失敗を返す実装を渡す。
  - 実際の IndexedDB への保存と、再読み込みの後も残ることは、e2e（Chromium）で確かめる（D18）。
  - `src/test/support/mount.ts` の `mountApp` は既定でメモリ上の実装を渡す。既存のテストが「端末に保存できない」の表示に変わらないようにするため。
- D10: 構造上の制約と照合（`lib/charms/`。decisions.md Q29・Q32・Q33）。
  - DOM と Vue に依存しない純粋な関数にする。016 charm-ocr・017 reverse-lookup から使えるようにするため。
  - 置き場を `packages/*` にしない理由: `packages/solver` は求解に、`packages/data` の入口は型だけに限っている。どちらも使い手はブラウザの `apps/web` だけになる。
  - 入力は、護石の下書き（レア度は未選択を許し、スキルの行は空を許す）、`MasterBundle`、表示名を引く関数。
  - 構造上の制約（`validateCharm`）は、項目ごとのエラーを返す。項目は `rarity`・`skills[i]`・`slots[i]` で、文言は screen-design.md 3.2 の表のとおり。
    - 次の制約は保存の前の検証で使う: レア度の未選択・範囲外、スキルの重複・空の行の下のスキル・現行のマスターに無いスキル・武器と防具以外の種類・最大レベルの超過、空のスロットの下のスロット・スロットの種別と Lv の範囲。
    - 「候補からスキルを選んでください。」（Combobox の入力の状態）は画面の側で出す。
  - 検索の候補に入れるかの判定（`charmEligibility`）は、保存済みの護石に同じ制約を掛ける。外す理由は、screen-design.md 3.3 の「検索対象外の理由」の文言に使う形で返す。
  - 照合（`matchCharm`）は「合格」「テーブル不一致（合わない点の配列）」「未検査」を返す。
    - そのレア度のパターンが1つも無ければ「未検査」にする。
    - パターン p が合うのは、次の2つがともに成り立つとき。
      - 護石の各スキル i が `p.skillGroups[i]` の名前のグループに同じスキルとレベルで含まれる（null や範囲外の枠には入らない）。
      - スロットの並びが `p.slotPatterns` のどれかと、target と Lv の並びで一致する（スロットなしは空の並び）。
    - パターン p の non-null の枠より護石のスキルが少なくても、不一致にしない（decisions.md Q33 は護石が持つスキルだけを照らす）。
    - どれかのパターンが合えば「合格」にする。
  - 合わない点（screen-design.md 3.2 の4つの文言）は、そのレア度のパターンの全体に対して、次の順で決める。
    1. スキル i ごとに、どのパターンにも i 番目の枠（null でない `skillGroups[i]`）が無ければ「スキル<i>の枠は、レア<r>にはありません。」。
    2. 枠はあるが、どのパターンの i 番目のグループにもそのスキルとレベルが無ければ「スキル<i>「<名前> Lv<n>」は、レア<r>のスキル<i>の枠に出ません。」。
    3. スロットの並びが、どのパターンの `slotPatterns` にも無ければ「スロットの並び「<並び>」は、レア<r>にありません。」。並びは「武器用 Lv1・防具用 Lv2」の形で、空なら「なし」。
    4. 1〜3 がどれも出ないのに合うパターンが無ければ、「スキルとスロットの組み合わせが、レア<r>のどのパターンにも当てはまりません。」の1つだけを出す。
  - 照合の結果と検索対象外かどうかは保存しない。表示のたびに現行のマスターで求める（screen-design.md 0）。
- D11: スキル名の検索（decisions.md Q34。`lib/text.ts`）。
  - `matchesSkillQuery(name, reading, query)` を足す。入力・名前・読みをそれぞれ正規化し、名前か読みのどちらかに部分一致すれば一致にする。読みが無ければ名前だけで照らす。
  - 正規化は、既存の `normalizeForSearch`（NFKC と小文字化。全角と半角の同一視）の後に、カタカナ（U+30A1〜U+30F6）をひらがなに寄せる。空の語はすべてに一致する。
  - 武器の検索（`WeaponDialog`）は既存の `matchesQuery` のまま変えない（武器名の読みとかなの同一視は spec のスコープ外）。
  - D2 のスキルのダイアログ（`SkillDialog`）と、護石の入力の Combobox の両方が `matchesSkillQuery` を使う。読みは master のストアから辞書の `reading` を引く。
- D12: 検索の要求と構成の表示（`lib/solver/`）。
  - `buildSolverRequest` の検索条件に `charms: SolverCharm[]` を足し、そのまま `SolverRequest.charms` に渡す（空なら護石なしで解く）。
  - 候補は、ストアの護石のうち `charmEligibility` が通るものすべて（未検査・テーブル不一致を含む）。`StoredCharm` の `id` と `payload` から作る。
  - 検索の要約（`SearchSummary`）に、送信した時点の候補の件数を足す。
  - 構成の表示（`buildView.ts`）は、`BuildLookup` に護石を ID で引く関数を足す。引く先は、送信した時点の候補（要求の `charms`）を ID で引ける形にして、検索の状態に持つ。検索の後に護石を編集・削除しても、表示中の結果を変えないため（screen-design.md 2.3）。
  - 構成の表示には、護石の節（レア度・スキルのチップ・スロット）を足す。持ち主が護石のスロットの Lv も、その護石の `slots` から引く（004 では `null` だった）。

### 画面と状態（apps/web/src/main。web-agent）
- D13: 護石のストア（`stores/charms.ts`）。
  - S1 と S2 が共有する。状態は次の4つ: 読込中、読込済み、端末に保存できない（原因）、読み込みの失敗（原因）。
  - 最初に使われたときに1回だけ `CharmRepository` を開いて一覧を読む。
  - 登録・上書き・削除は、保存に成功してからストアの一覧を変える。失敗は、screen-design.md 3.4 の文言でトーストに出す。
  - 一覧の並びは ID の降順。
  - 返す値: 候補の件数、検索対象外の件数と理由、各護石の照合の結果（現行のマスターで計算するゲッター）。
  - `CharmRepository` の作り方は、ストアの外から差し替えられるようにする（D9）。
- D14: 画面のファイルの置き場（目安）。
  - `views/CharmsView.vue`: S2。
  - `components/charms/`: 入力フォーム・スキルの行・照合の結果・一覧の行・削除の確認（D3）。
  - `components/common/AppNav.vue`: ナビの行。
  - `components/common/AppHeader.vue`: テーマの切り替えを足す。
  - `components/search/CharmCard.vue`: S1 の「護石」カード。
  - 既存の `BuildCard.vue`・`SkillDialog.vue`・`SearchView.vue`・`ResultsPanel.vue`（要約）に追従する。
  - 定数（鑑定護石のレア度 5〜8・スロットの選択肢と表示名「武器用」「防具用」・照合の結果の表示名）は `constants/` に置く。
  - ルートに `/charms`（名前 `charms`、`CharmsView` を遅延読み込み）を足す。
  - ページのタイトル（「装備検索 | SkillWeave」「護石 | SkillWeave」）は、ルートの `meta.title` と `router.afterEach` で `document.title` に書く。`index.html` の `<title>` は最初の表示用に今のまま残す。
- D15: 部品は shadcn-vue の `combobox`（スキルの選択）と `alert-dialog`（D3）を足す（screen-design.md 0）。
  - メインがリポジトリ直下から `apps/web` で `pnpm dlx shadcn-vue@2.8.2 add combobox alert-dialog` を実行してコピーする（`.claude/rules/ui-design.md`）。
  - CLI の後に `apps/web/package.json` と `pnpm-lock.yaml` の差分を確かめる。CLI が依存を足した・上げたら元に戻す。新しい依存が要るなら、停止してユーザーに提示する。
  - コピーした部品の `lucide-vue-next` の import は `@lucide/vue` に書き換える。
  - CLI が既存の部品（`button` など）を上書きしようとしたら上書きしない。
- D16: テーマの切り替え（decisions.md Q26・screen-design.md 2.1）。
  - `lib/theme.ts` に、現在のテーマの読み取り（`<html>` の `dark` クラス。`index.html` の先行スクリプトが反映済み）と、切り替え（クラスの付け外しと `localStorage` の `swv-theme` への `light`／`dark` の書き込み）を置く。
  - `localStorage` の失敗は握りつぶす。その場の切り替えは効かせる。
  - OS の設定（`prefers-color-scheme`）は読まない。`index.html` の先行スクリプトは変えない。
- D17: トーストに `tone`（`'default' | 'destructive'`）を足す。書き込みの失敗のトーストを `--destructive` で出すため（screen-design.md 3.4）。既存の呼び出しは既定の `default` のまま。
- D18: web の単体テスト（`apps/web/src/test/<main と同じ相対パス>/`）。
  - `lib/`: UUIDv7、原因の変換、`validateCharm`・`charmEligibility`・`matchCharm`、`matchesSkillQuery`、`buildSolverRequest` の護石、`toBuildView` の護石の節と護石のスロットの Lv、テーマ。
    - 照合はテスト用の抽選テーブルで確かめる。合格、未検査、合わない点の4種、複数のパターンのどれかで合格する場合を含める。
  - ストア: 一覧の並び、登録・上書き・削除、書き込みの失敗でストアが変わらないこと、端末に保存できないときの状態、候補の件数と検索対象外。メモリ上の実装と失敗を返す実装を使う。
  - 画面: S2 の入力と各エラーの文言と位置、最初の不正な項目へのフォーカス、照合の結果の3種と確認のチェック、登録と編集のモード、一覧の表示と状態のラベル、削除の確認とフォーカス、端末に保存できないときのフォームの無効。S1 の護石カードの4つの状態、要約、構成カードの護石の節、D2 の読みでの検索、ヘッダーのテーマの切り替え、ナビの `aria-current`。
  - テスト用ルーター（`src/test/support/mount.ts` の `newRouter`）に `/charms` のルートを足す。ナビのリンクが、ルートの無いテスト用ルーターで既存のテストを落とさないようにするため。
  - Combobox・AlertDialog・Select のテストは、`.claude/rules/web-vue.md` の後始末とタイムアウトの節に従う。

### e2e（apps/web/e2e。e2e-agent）
- D19: e2e の流れ。ビルドした web を `vite preview` で起動し、API・DB は起動しない。実際のマスター・HiGHS・Chromium の IndexedDB を使う。
  - 要素はロール・ラベル・見出しの文言（screen-design.md）で探し、`data-testid` は足さない。
  - スキルの名前は、テストから `node:fs` で `packages/data/dist/` の ja の辞書を読んで決める（004 の `e2e/support/masterData.ts` のやり方）。
  - (a) 護石を登録する → 一覧に出る → 再読み込みの後も一覧に残る → ナビで検索画面へ行く → 候補の件数が出る → 検索する → 構成カードに、その護石のレア度・スキル・スロットが出る。
    - 構成がその護石を確実に使うように、目的を「空きスロットの最大化」にし、防具用のスロットを持つ護石にする。採る条件は e2e-agent が実データで確かめて決める。
  - (b) 同じスキルを2つ入れて「登録」を押すと、保存されず、後の行の直下に「スキル<j>と同じスキルです。…」が出て、一覧の件数が変わらない。
  - (c) 読みでの検索は、ひらがなで入力して漢字のスキル名の候補が出ることを、(a) のスキルの選択の中で確かめる。読みは辞書の `reading` から取る。
  - 各テストは新しいブラウザコンテキストで始める（Playwright の既定）。IndexedDB はテストの間で共有されない。

### 構成・文書（メインが書く）
- D20: `design-system/skillweave/MASTER.md` に、screen-design.md 6 の内容を足す（委譲の前・T1）。
  - Layout の「画面骨格」: ナビの行と、ヘッダーのテーマの切り替え。
  - Component Specs: 照合の結果の表示（合格・未検査・不一致の帯と確認のチェック）と、一覧の状態のラベル。
  - UI Copy の用語: スロットの種別は「武器用」「防具用」と書く。
- D21: `design/master-data.md` に、次を足す（委譲の前・T1）。data-agent が書式の正として読むため。
  - 「6. overlay の書式と検証」: 最上位のキー `readings` の書式（D1）と、読みと抽選テーブルの検証（D2・D3）。
  - 「7. 出力」: ja の辞書のスキルの項目の `reading`。
- D22: 常時許可外の変更を書く時期。
  - 委譲の前（T1・T2）: `MASTER.md`（D20）、`design/master-data.md`（D21）、`components/ui/` の部品のコピー（D15）。
  - data-agent とオーナーの確認の後（T5）: `packages/data/dist/` の再生成（D4）。読みの下書き（data-agent の成果）とオーナーの確認ができるまで書けないため。
- D23: 検索時間の見積もり（handoff の要確認事項。3 秒の基準は 004 decisions.md Q20）。
  - 2026-10-23 に、003 の測定ハーネスを一時ファイルに写して Node で測った（コミットしていない）。条件は、実データ `2026.10.2`、件数 10、防御力の最大化、乱数で作ったレア8の護石（スキル 1〜3 個の半分を必須スキルから選び、スロット 0〜3 枠）。各3回の時間は次のとおり。

    | ケース | 護石 0 件 | 護石 30 件 | 護石 80 件 |
    |---|---|---|---|
    | k=6 解あり | 293〜421 ms | 297〜301 ms | 363〜367 ms |
    | k=10 解あり | 322〜331 ms | 243〜248 ms | 362〜366 ms |

  - 護石の数による伸びは小さい。004 のブラウザの測定（護石なし・件数 10 で最大 1422.0 ms）は Node の約 4 倍だったので、80 件でもブラウザで 2 秒以下と見積もる。
  - 005 では測定のハーネスを足さず、`design/tech-stack.md` も直さない（spec の受入基準に測定が無いため）。

### 進め方の注意
- D24: 並列にしない。今回のタスクはすべて pnpm workspace を検証する役割なので、`tsod-build/SKILL.md`「委譲」の条件により直列にする。
- D25: web の委譲は3回に分ける（T6・T7・T8）。1回の委譲の差分を、レビューできる大きさにするため。同じ領域なので、順に実行する。
  - T6: `lib/` の純粋な部品とそのテスト。
  - T7: 護石のストアと S2。
  - T8: C1・S1・D2 の変更。
- D26: `apps/api/gradlew.bat` の作業ツリーの変更は 005 の前からあり、005 では触らない（コミットに含めない）。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（ナビの行・テーマの切り替え・照合の結果と状態のラベル・「武器用」「防具用」の用語を足す。担当: メイン。時期: T1。理由: D20・screen-design.md 6）
- `design/master-data.md`（overlay の readings の書式、読みと抽選テーブルの検証、ja の辞書の reading を足す。担当: メイン。時期: T1。理由: D21）
- `apps/web/src/main/components/ui/`（shadcn-vue の CLI で combobox・alert-dialog をコピーし、アイコンの import を @lucide/vue に書き換える。担当: メイン。時期: T2。理由: D15・.claude/rules/ui-design.md）
- `packages/data/dist/master-2026.10.3.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T5。理由: D4）
- `packages/data/dist/master-2026.10.3.ja.json`（同上の ja の辞書。担当: メイン。時期: T5。理由: D4）
- `packages/data/dist/master-2026.10.3.en.json`（同上の en の辞書。担当: メイン。時期: T5。理由: D4）
- `packages/data/dist/master-2026.10.2.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T5。理由: D4）
- `packages/data/dist/master-2026.10.2.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T5）
- `packages/data/dist/master-2026.10.2.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T5）
