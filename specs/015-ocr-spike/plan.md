# 015: ocr-spike 計画

## スタック
- Web: Vue 3・Vite 8.3.5・Vitest（jsdom）・@playwright/test 1.64.1（Chromium）。版は `design/tech-stack.md` の現行どおり。
- 追加する依存（`apps/web` の dependencies。完全一致の版。D1）:
  - tesseract.js 7.0.0（2025-12-15・Apache-2.0）
  - tesseract.js-core 7.0.0（2025-12-15・Apache-2.0。tesseract.js 7.0.0 の要求 `^7.0.0` と同じ版）
  - @tesseract.js-data/jpn 1.0.0（2023-09-04・MIT。`4.0.0_best_int/jpn.traineddata.gz`（約 2.0 MB）だけを使う）
- マスターデータ: `packages/data/dist/master-2026.10.4.json`・`master-2026.10.4.ja.json`（変更なし。スキル 179 件のうち、照合の候補は armor 71・weapon 66 の 137 件。D5）
- UI 部品は足さない（画面を持たない）。

## データモデル
なし

## 決定事項

### 依存と自オリジンからの配信（AC-1・AC-4）
- D1: 依存は上の「スタック」の3つを、委譲の前にメインがリポジトリ直下で追加する（T1）。
  - tesseract.js-core も直接の依存にする。D2 のプラグインが `apps/web` から tesseract.js-core のファイルを解決するため（pnpm の分離では、推移的依存は `apps/web` から解決できない）。版は tesseract.js の要求と同じ 7.0.0 にして、lockfile 上で1つにまとめる。
  - tesseract.js の postinstall（`opencollective-postinstall || true`。寄付の案内の表示だけ）は、`pnpm-workspace.yaml` の `allowBuilds` に `tesseract.js: false` を足して遮断し、理由をコメントで残す（既存の `@scarf/scarf`・`vue-demi` と同じ書き方）。書いたら `cat` で中身を確かめる。
  - `ERR_PNPM_TRUST_DOWNGRADE` が出たら、`.claude/rules/pnpm-workspace.md` の手順に従い、例外を足す前にユーザーに提示する。
  - 同じコミットで `design/tech-stack.md` の「Web（apps/web）と packages」の表に3行（版・公開日・ライセンス・用途）を足す。
- D2: worker・WASM コア・言語データは、`apps/web/vite.config.ts` に置く小さなプラグインで、固定のパスの静的ファイルとして配信する（T1 でメインが書く）。
  - 配信するファイル（パスは `BASE_URL` からの相対）:
    - `tesseract/worker.min.js` ← `tesseract.js/dist/worker.min.js`
    - `tesseract/core/tesseract-core-lstm.wasm.js`・`tesseract-core-simd-lstm.wasm.js`・`tesseract-core-relaxedsimd-lstm.wasm.js` ← `tesseract.js-core` の同名ファイル（WASM を内包した版。tesseract.js が実行時に SIMD の対応を見て1つを選ぶ。LSTM 専用でない版と `.wasm` 単体は配信しない）
    - `tesseract/lang/jpn.traineddata.gz` ← `@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz`
  - build では `generateBundle` で `emitFile`（`fileName` を上の固定のパスにする）、dev では `configureServer` のミドルウェアで同じパスに同じファイルを返す。元のファイルは `createRequire(import.meta.url).resolve('<パッケージ>/package.json')` のディレクトリから読む。
  - 固定のパス（ハッシュなし）にする理由: tesseract.js は `langPath` のディレクトリの下の `jpn.traineddata.gz` という名前で言語データを取り、`corePath` にディレクトリを渡したときだけ SIMD の対応で版を選ぶため。Vite の `?url` の import ではファイル名にハッシュが付き、この2つが成り立たない。版は lockfile で固定する。版を変えたときのブラウザのキャッシュの破棄は 018 pwa-offline で扱う。
- D3: `createWorker` には、既定の取得先（jsDelivr）を使わせないため、3つのパスを必ず明示する。
  - `createWorker('jpn', OEM.LSTM_ONLY, { workerPath: \`${BASE_URL}tesseract/worker.min.js\`, corePath: \`${BASE_URL}tesseract/core\`, langPath: \`${BASE_URL}tesseract/lang\`, workerBlobURL: false, gzip: true, cacheMethod: 'none' })`
  - `workerBlobURL: false`: Blob の URL を経由せず、worker を自オリジンの URL から直接起動する。
  - `cacheMethod: 'none'`: 言語データを IndexedDB に保存しない。初期化の時間は毎回、初めて開いたときの読み込みになる。端末への保存（オフライン）は 018 で扱う。
  - tesseract.js は `lib/ocr` の中で動的 import する（既存の画面のバンドルに入れない）。

### lib/ocr の形（AC-1〜AC-3・AC-5）
- D4: `apps/web/src/main/lib/ocr/` に置く。ファイルの分け方は次を目安にし、画像を使わずに検査できる部分（照合・行の解釈・スロットの判定）を、Tesseract.js と canvas に依存しない純粋な関数に分ける。
  - `types.ts`: `CharmReadResult` ＝ `{ skills: (SkillLevel | null)[]; slots: (Slot | null)[]; lines: string[] }`。`null` は読み取れなかった行（AC-3）。並びは画面の表示順。`lines` は認識した生の文字列（不一致の調査用）。`skills`・`slots` の形は `lib/charms/types.ts` の `CharmDraft`（レア度を除く）と同じにし、016 で入力の下書きへそのまま渡せるようにする。完全一致の判定は `null` を含まないことが前提。
  - `match.ts`（D5）・`parse.ts`（認識した文字列 → `skills`）・`slots.ts`（D7）・`preprocess.ts`（D6）・`reader.ts`（Tesseract.js の配線。D3）・`index.ts`（公開する入口）。
  - 公開する入口: `createCharmReader(bundle: MasterBundle, dictionary: MasterDictionary): Promise<CharmReader>`。`CharmReader` は `read(image: Blob): Promise<CharmReadResult>` と `terminate(): Promise<void>` を持つ。画像は `Blob` で受け、ブラウザ内（`createImageBitmap` と canvas）だけで扱い、どこへも送らない（AC-5）。
- D5: スキル名の照合（AC-2・AC-3）。
  - 候補: `bundle.skills` のうち `kind` が `armor`・`weapon` で、ja 辞書に名前があるもの（`series`・`group` は護石に付かないので除く）。マスター 2026.10.4 で 137 件、名前の重複なし。
  - 正規化: 認識した文字列と候補名の両方を NFKC にし、空白を除く。行の文字列からは、Lv の部分（`Lv` と続く数字）を除いてから照合する。
  - 距離: 編集距離（Levenshtein）。最小の距離 d の候補がちょうど1つで、d が「その候補の正規化後の長さ ÷ 3 の切り捨て」以下のときだけ、その候補のスキルの ID にする。それ以外（最小が同点で複数・しきい値を超える）は `null`。しきい値は改善（D14）の前後で変えない。
  - 実データに当てはめた例（マスター 2026.10.4）:
    - 「体力回復量UP」（半角で認識）→ NFKC で「体力回復量UP」、候補「体力回復量ＵＰ」も NFKC で同じ → d = 0 で `sk:-1235658624`。
    - 「納刀衡」→「納刀術」（長さ 3・しきい値 1）d = 1 で `sk:-1073401280`。
    - 「体衛」→「体術」（長さ 2・しきい値 0）d = 1 で `null`（2文字の名前は完全一致だけを受ける）。
  - Lv: 行の中の `Lv`（NFKC 後に大文字・小文字を区別しない）に続く数字を整数にし、1 以上かつそのスキルの `maxLevel` 以下なら採る。読めない・範囲外は、その行を `null` にする（スキル名だけ合っていても推測で埋めない）。
  - 行の扱い: スキル欄の認識結果の、空白だけでない行を1行＝1スキルとして上から並べる。照合か Lv のどちらかに失敗した行は `null` として位置に残す。画面の Lv の表記が `Lv` と数字でない（目盛りの表示など）と T2 の画像で分かったときは、web-agent が T3 の中で解釈の規則を画像に合わせて決め、完了報告に書く（spec の受入基準は変わらない）。
- D6: 画像の切り出しと前処理（改善の前）。
  - 読み取り範囲（スキル欄・スロット欄）は、画像の幅・高さに対する比率の矩形として定数で持つ。値は T2 でオーナーが置いた画像を web-agent が Read で見て決め、根拠（どの画像のどの欄か）をコメントに書く。解像度の違いはスコープ外（Q114）。
  - 改善の前の前処理は、矩形の切り出しとグレースケール化だけにする。スキル欄は Tesseract の PSM 6（1つの文字のまとまり）で1回認識する。
- D7: スロットの読み取り（AC-1〜AC-3）。スロットはアイコンで表示されるため、スロット欄の各スロットの位置の画素から「スロットの有無・武器用か防具用か・Lv」を判定する規則を、`slots.ts` に純粋な関数として置く（入力は RGBA の画素の配列と幅・高さ）。
  - 判定に使う特徴（色相・明るさ・図形の画素数など）としきい値は、T2 の画像を web-agent が見て決め、定数とコメントで残す。アイコンの中に数字があれば、その部分だけ Tesseract で数字（`1234` の許可リスト）を読んでもよい。
  - 公式のアイコンの画像やその切り抜きを、テンプレートとしてリポジトリに入れない（憲法）。
  - スロットが無い位置は配列に入れない。スロットがあるのに別か Lv を判定できない位置は `null` にする（AC-3）。
- D8: 単体テスト（AC-6。`apps/web/src/test/lib/ocr/`。画像を使わず CI で動く）。
  - `match`: 実データのマスターと ja 辞書（`packages/data/dist/` を `import.meta.dirname` から読む。前例は `src/test/constants/weaponTypes.spec.ts`）で、D5 の3つの例と、最小が同点のときに `null` になること。
  - `parse`: 認識した文字列（複数行）から、並びを保った `skills` を返すこと。未知の名前・Lv なし・Lv が `maxLevel` 超えの行が `null` で位置に残ること。全角の `Ｌｖ３` を読めること。
  - `slots`: 合成した画素の配列で、有無・別・Lv の判定と、判定できない位置が `null` になること。
  - `reader`: `vi.mock('tesseract.js')` で、`createWorker` に D3 の3つのパス（自オリジンの相対）・`workerBlobURL: false`・`cacheMethod: 'none'` が渡ること（AC-4 の単体側の確認）と、認識結果の文字列が `parse` に渡って結果になること。
  - 時間と精度は検査しない（AC-15）。

### 測定（AC-7〜AC-11・AC-15）
- D9: 画像と正解ラベルの置き場（AC-7）。
  - 画像: `apps/web/e2e/measure/charm-ocr/images/`（`.gitignore` で除外。T1）。拡張子は `.png`・`.jpg`・`.jpeg`・`.webp`。
  - 正解ラベル: `apps/web/e2e/measure/charm-ocr/labels.json`（コミットする）。キーは画像のファイル名、値はスキルとスロットを画面の表示順に並べたもの。レア度は持たない（Q116）。スキル名は ja 辞書の表記どおり（全角の「ＵＰ」もそのまま）。例:

    ```json
    {
      "charm-001.png": {
        "skills": [{ "name": "体力回復量ＵＰ", "level": 2 }, { "name": "納刀術", "level": 1 }],
        "slots": [{ "target": "weapon", "level": 2 }, { "target": "armor", "level": 1 }]
      },
      "charm-002.png": {
        "skills": [{ "name": "体術", "level": 3 }],
        "slots": []
      }
    }
    ```
  - 画像と `labels.json` はオーナーが用意して置く（スキル数・スロットがばらける護石で 20 枚以上。Q114）。メインは `labels.json` だけをコミットする（T2）。
- D10: 測定用のページ。`lib/ocr` を画面なしでブラウザから呼ぶため、測定専用の HTML を `apps/web/e2e/measure/charm-ocr/index.html` に置く（T4。e2e-agent）。
  - インラインの module スクリプトで `@/lib/ocr` と `@/lib/solver/masterData` の `fetchMasterData` を import し、`window.swvCharmOcr` に次の2つを出す。
    - `init(): Promise<{ initMs: number }>`: マスターと辞書を取得した後、`createCharmReader` の呼び出しから完了までを `performance.now()` で測る（初期化の時間。マスターの取得は含めない）。
    - `read(base64: string, mime: string): Promise<{ result: CharmReadResult; ms: number; width: number; height: number }>`: `Blob` を作った後、`reader.read` の呼び出しから完了までを測る（1枚の認識時間。Playwright の往復を含めない）。
  - `apps/web/vite.config.ts`: 環境変数 `SWV_OCR_MEASURE` が `1` のときだけ、`build.rollupOptions.input` に `index.html` とこのページの両方を入れる（T1）。配備に使う `pnpm build` には入らない。
  - `apps/web/playwright.config.ts`: `webServer` の環境変数に `SWV_OCR_MEASURE=1` を足す（T1）。e2e と measure は同じ `webServer` を共有するので、e2e のビルドにもこのページが入るが、Playwright のビルドは配備物ではないので扱いを分けない（分けると `reuseExistingServer` のときに中身の違うサーバーを使い回すおそれがある）。
- D11: 測定（`apps/web/e2e/measure/charm-ocr.measure.ts`。T4。e2e-agent）。
  - 事前の検査（AC-8）: ブラウザを開く前に、画像の置き場が無い・正解ラベルのある画像が 20 枚未満・正解ラベルの無い画像がある、のどれかなら、理由を出力して失敗する。ラベルのスキル名が ja 辞書に完全一致で無いときも、ラベルの誤りとして失敗する。画像の無いラベルは数えず、警告を出力する。
  - 通信の検査（AC-10）: `page.goto` の前に `context.on('request')` で全リクエストを記録し、最後に、オリジンが `baseURL` と違うもの（`data:`・`blob:` は除く）があれば失敗する。あわせて、`tesseract/worker.min.js`・`tesseract/core/` 配下・`tesseract/lang/jpn.traineddata.gz` へのリクエストを記録できたことを確かめ、どれかが記録に無ければ「監視が worker の通信を捉えていない」として失敗する（検査が素通りになるのを防ぐ）。
  - 読み取り: 画像を Node 側で読んで base64 で `read` に渡し、ラベルと比べる。比較はスキル（ID と Lv）・スロット（別と Lv）の並びと数の完全一致で、`null` は不一致（Q110・Q115）。
  - 出力（AC-9・AC-11）: 画像ごとに完全一致の可否・不一致の項目（例: `skills[1]: expected 納刀術 Lv1, got null`）・認識時間・認識した生の行。全体に、完全一致率・認識時間の最大・初期化の時間・画像の枚数と解像度・合否（完全一致率 90% 以上かつ最大 3000 ms 以下で PASS）。既存の measure と同じく、合否では失敗にしない（結果を記録に残すため）。失敗にするのは事前の検査・通信の検査・ラベルの誤りだけ。
  - 実行: `pnpm --filter @swv/web exec playwright test --project=measure e2e/measure/charm-ocr.measure.ts`。CI の検証コマンドは measure を実行せず、vitest は `src/test/**/*.spec.ts` だけを読むので、時間と精度は CI で検査されない（AC-15。`ci.yml` は変えない）。

### 測定の記録と結論（AC-11〜AC-14）
- D12: 測定と記録は、T4 の後に T5 でメインが行う（ハーネスと画像がそろうまで書けないため）。`design/tech-stack.md` に新しい節「Tesseract.js の護石の読み取りの測定（015 ocr-spike・<日付>）」を足し、結論（合否と Tesseract.js の採否）・条件（対象の画面・画像の枚数と解像度・前処理）・測定環境（Node・OS・CPU・メモリ・Chromium の版）・Tesseract.js・tesseract.js-core・言語データの版（`4.0.0_best_int`）・全体の完全一致率・認識時間の最大・初期化の時間・不一致の傾向を記録する（AC-14）。画像ごとの表は不一致の画像だけを載せる。
- D13: 合格なら、T5 の記録で Tesseract.js を「採用」とし、T6〜T8 は「該当なし（合格）」として閉じる。
- D14: 不合格なら（AC-12）、T5 で改善の前の結果を記録した後、T6 で web-agent が前処理の改善を1回だけ加える。改善の中身は、拡大（2倍）・二値化（大津の方法）・文字の許可リスト（候補のスキル名に現れる文字と `L`・`v`・数字）とし、スロットの判定の規則も同じ前処理に合わせて直してよい。照合のしきい値（D5）は変えない。T7 でメインが再測定し、同じ節に改善の前後の両方の結果を並べて記録する。
- D15: 改善の後も不合格なら（AC-13）、T8 でメインが `specs/open-questions.md` に新しい Q（代替の選定: 別の OCR エンジン・読み取り範囲の手動指定など。016 の着手前に決める）を起票し、`design/tech-stack.md` の節の結論を「不合格・Tesseract.js は不採用」にして、015 を「不合格」の結論で閉じる。代替の実装はしない（スコープ外）。

### 委譲の順
- D16: T1（メイン）→ T2（メイン。オーナーの画像とラベル）→ T3（web）→ T4（e2e）→ T5（メインの測定と記録）→ 不合格のときだけ T6（web）→ T7（メイン）→ 改善の後も不合格のときだけ T8（メイン）。T3 は T2 の画像で読み取り範囲とスロットの規則を決め、T4 は T3 の入口を使う。web と e2e はどちらも pnpm workspace を検証する役割なので、並列にしない。

## 常時許可外の変更
- `apps/web/package.json`（dependencies に tesseract.js 7.0.0・tesseract.js-core 7.0.0・@tesseract.js-data/jpn 1.0.0 を完全一致の版で追加する。担当: メイン。時期: T1。理由: AC-1・AC-4・D1）
- `pnpm-lock.yaml`（上の追加に伴う更新。担当: メイン。時期: T1。理由: D1）
- `pnpm-workspace.yaml`（allowBuilds に tesseract.js: false を足し、postinstall を遮断する理由をコメントで残す。担当: メイン。時期: T1。理由: D1）
- `apps/web/vite.config.ts`（worker・WASM コア・言語データを固定のパスで配信するプラグインと、SWV_OCR_MEASURE のときだけ測定用のページを入力に足す設定。担当: メイン。時期: T1。理由: AC-4・D2・D10）
- `apps/web/playwright.config.ts`（webServer の環境変数に SWV_OCR_MEASURE=1 を足す。担当: メイン。時期: T1。理由: AC-9・D10）
- `.gitignore`（測定用の画像の置き場 apps/web/e2e/measure/charm-ocr/images/ を除外する。担当: メイン。時期: T1。理由: AC-7・D9）
- `design/tech-stack.md`（T1 で追加する3つの依存の版の行、T5・T7 で測定結果と Tesseract.js の採否の節。担当: メイン。時期: T1・T5・T7・T8。理由: AC-14・D1・D12〜D15）
