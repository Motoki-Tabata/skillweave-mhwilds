# 016: charm-ocr 計画

## スタック
- Web: Vue 3.5.43・Vite 8.3.1・Vitest 5.0.1（jsdom 30.1.1）・@playwright/test 1.63.0（Chromium）。版は `design/tech-stack.md` の現行どおり。
- OCR: tesseract.js 7.0.0・tesseract.js-core 7.0.0・@tesseract.js-data/jpn 1.0.0（`4.0.0_best_int`）。015 で追加済みの依存と、`apps/web/vite.config.ts` の自オリジンの配信をそのまま使う。依存は足さない。
- UI 部品は足さない。既存の Card・Button・Select・`ResultAlert`・lucide（`ImagePlus`・`Loader2`・`TriangleAlert`）で作る。
- 契約・API・テーブルは変えない。

## データモデル
なし

## 決定事項

### 読み取りの改善（AC-7・AC-12・AC-13）
- D1: スキルを枠ごとに認識する（AC-7）。`lib/ocr/preprocess.ts` は、3つの枠（015 の `planSkillRows` の1行ずつ。名前と Lv を1行に並べたもの）を別々の画像にし、`reader.ts` が枠ごとに1回ずつ認識する（1枚につき最大3回）。PSM（7＝1行・6＝まとまり）・拡大率・切り出しの余白・二値化は、web-agent が測定（D4）で 015 の 20 枚を見比べて決め、完了報告と定数のコメントに根拠を書く。
- D2: 枠が空か（スキルが無いか）は、Tesseract の結果でなく、前処理の画素で判定する（名前の範囲の明るい画素の数としきい値。しきい値は 015 の画像のスキル1〜3個の護石で決める）。結果の `skills` は次の規則で作る。
  - 枠ごとに「空」「読めた（`SkillLevel`）」「読めない（`null`）」のどれかにする。
  - 末尾から続く「空」の枠は結果に入れない。途中の「空」の枠（画面上は起きない）は `null` にする。以降の枠を前に詰めない。
  - 例: 枠が [読めた・読めない・空] → `[攻撃 Lv3, null]`。[読めた・空・読めた] → `[攻撃 Lv3, null, 渾身 Lv1]`。[空・空・空] → `[]`。
- D3: スキル名の照合のしきい値（候補名の長さ ÷ 3 の切り捨て）と、最小が同点なら `null` にする扱いは緩めない。Q117 の「照合の調整」は、Lv の部分の除き方・空白や記号の除き方など、照合の前の文字列の整え方に限る。緩めると、誤った値で埋める危険が増え、20 枚の測定では見えないため。
- D4: 測定の判定（AC-12・AC-13）。行ごとに、正解のスキル（ID と Lv）・スロット（別と Lv）と、読み取り結果を位置で突き合わせる。
  - 空欄の行: 結果が `null`。誤りに数えない。
  - 誤った値で埋めた行: 結果が `null` でなく正解と違う行、正解に行があるのに結果に行が無い行（「無い」と埋めたことになり、フォームに印が出ない）、正解に行が無いのに結果に `null` でない行がある行。
  - 正解に行が無く、結果が `null` の行は空欄に数える（フォームで印を見て「なし」を選べる）。
  - 例: 正解 [弱点特効 Lv1, 渾身 Lv2]・結果 [弱点特効 Lv1, null] → 空欄 1・誤り 0。結果 [弱点特効 Lv1] → 誤り 1（skills[1] が無い）。結果 [弱点特効 Lv1, 渾身 Lv2, 攻撃 Lv1] → 誤り 1（skills[2]）。
  - 完全一致は、空欄も誤りも 0 の画像。完全一致率は出力するが合否に使わない。
  - 合否: 全画像の誤った値で埋めた行が 0 件、かつ1枚の認識時間（`reader.read` の呼び出しから完了まで。枠ごとの3回の認識を含む）の最大が 3000 ms 以下なら PASS。合否ではテストを失敗にしない（015 と同じ）。

### 測定（AC-12〜AC-14）
- D5: 測定 `apps/web/e2e/measure/charm-ocr.measure.ts` を D4 の判定に書き換える（T1・e2e-agent）。測定用のページ `e2e/measure/charm-ocr/index.html` と `labels.json`・事前の検査（015 の AC-8）は変えない。
  - 出力（画像ごと）: 誤った値で埋めた行・空欄の行（どちらも項目つき。例 `skills[1]: expected 渾身 Lv2, got null (blank)`）・認識時間・認識した生の行。
  - 出力（全体）: 誤った値で埋めた行の数・空欄の行の数・完全一致率・認識時間の最大・初期化の時間・枚数と解像度・Chromium の版・合否。
  - 通信の検査（AC-14）: `context.on('request')` で記録した全リクエストのうち、自オリジン以外（`data:`・`blob:` を除く）か、メソッドが GET 以外のものがあれば失敗する。worker・core・lang の3種を記録できたことの確認（監視の素通りの防止）は残す。
- D6: 測定と記録は、T2 の後に T3 でメインが行う（T2 の改善ができるまで書けないため）。`design/tech-stack.md` に節「Tesseract.js の護石の読み取りの再測定（016 charm-ocr・<日付>）」を足し、D4 の項目・合否・条件（前処理・PSM・枠ごとの認識）・測定環境（Node・OS・CPU・メモリ・Chromium の版）・版を記録する。合格なら、同書の Web の表の tesseract.js・tesseract.js-core・@tesseract.js-data/jpn の3行の「015 の測定は不合格…」を「採用（016 の再測定）」に直し、015 の節の結論の後に、016 の再測定で基準を Q117 に置き換えて採用した旨の1文と新しい節への参照を足す（AC-15）。
- D7: T3 の測定が不合格（誤った値で埋めた行が1件以上、または最大が 3000 ms 超）なら、記録だけを書いて T4 以降へ進まず、ユーザーに提示して、改善の再委譲か Q117 の見直しかを決める。画面を、誤った値で埋める読み取りの上に作らないため。

### lib/ocr（AC-3・AC-7・AC-8・AC-10）
- D8: 公開する入口 `createCharmReader(bundle, dictionary)`・`CharmReader.read(image: Blob)`・`CharmReadResult` の形は変えない（測定用のページと 015 のテストがそのまま使える）。`read` の中で D1・D2 を行う。
- D9: 初期化の失敗で worker を残さない（AC-8）。`reader.ts` の `createRecognizer` は、`createWorker` の後の `setParameters` が失敗したら worker を `terminate` してから例外を投げ直す。`createWorker` 自体の失敗は tesseract.js が worker を片付ける前提にせず、単体テスト（`vi.mock('tesseract.js')`）で `terminate` が呼ばれることを確かめる。
- D10: 画像の検査と切り抜きを `lib/ocr/inspect.ts` に置く。`inspectCharmImage(image: Blob): Promise<{ kind: 'ok'; preview: Blob } | { kind: 'notImage' } | { kind: 'notWide' }>`。デコード（`createImageBitmap`）は1回にし、検査と切り抜きを同じ画像から作る。
  - 画像として開けない: `createImageBitmap` が失敗したら `notImage`（MIME やファイル名で判定しない）。
  - 16:9 の判定: `|(幅 ÷ 高さ) ÷ (16 ÷ 9) − 1| ≤ 0.01`。例: 1920x1080・2560x1440 → ok、1366x768（1.7786）→ ok、1920x1200（16:10）→ `notWide`、3440x1440 → `notWide`。
  - 切り抜きの矩形（画面設計 B-2）: 015 の読み取り範囲（スロットの行 `SLOT_REGION` とスキルの3枠）を包む矩形に、上下左右 8px（1920x1080 の基準）の余白を足したもの。基準では x 1230〜1528・y 256〜543（`{ x: 1230, y: 256, width: 298, height: 287 }`）。2560x1440 なら 4/3 倍の `{ x: 1640, y: 341, width: 397, height: 383 }`。定数は `preprocess.ts`・`slots.ts` の定数から計算して持ち、web-agent が 015 の画像で切り抜きを見て、欄が欠けないことを確かめる。切り抜きは PNG の `Blob` にする。
- D11: 画像を残さない（AC-10）。待ち列の1件が持つのは、読み取り結果・切り抜きの `Blob`・表示用の名前だけにする。元の画像（`File`）は読み取りが済んだら参照を捨てる。切り抜きの表示は `URL.createObjectURL` で作り、その1件を終えたとき・待ち列を空にしたとき・画面を離れたときに `URL.revokeObjectURL` する。IndexedDB・`localStorage` に書かない。

### 待ち列と画面（AC-1〜AC-6・AC-8〜AC-10）
- D12: 待ち列は、護石の画面のコンポーネントのスコープの composable `lib/ocr/useCharmOcrQueue.ts` に持つ（Pinia の store にしない。画面を離れたら、`onScopeDispose` で待ち列・切り抜きの URL・worker を破棄し、戻っても復元しないため）。持つ状態と操作:
  - 状態: `phase`（`idle`・`preparing`・`reading`）・進み具合（k / n）・待ち列（項目は D11）・読み取らなかった画像の一覧（名前と理由）・失敗（準備の失敗か、何枚目で失敗したか）。
  - `accept(files: File[], route: 'pick' | 'paste' | 'drop')`: `phase` が `idle` でなければ受け付けない（画面設計の「読み取り中」の文言）。先頭の 20 枚を取り、21 枚目以降は数だけを記録する（AC-2）。20 枚を順に `inspectCharmImage` にかけ、`ok` だけを読み取りの対象にする（n はその数）。対象が1枚以上あれば、reader が無いときだけ `createCharmReader` を呼び（`preparing`。AC-9）、1枚ずつ `read` して、読み終えるたびに待ち列の末尾に足す（`reading`）。
  - 読み取らなかった画像の帯・失敗の帯は、次に `accept` したときに消す（読み取らなかった画像の帯は、待ち列を空にしたときも消す）。
  - 失敗（AC-8）: `createCharmReader` の失敗は「準備の失敗」。`read` の失敗は「k 枚目の失敗」で、残りを読まずに止め、reader を `terminate` して捨てる（次の `accept` で作り直す）。読み取れた分は待ち列に残す。
  - `next()`（登録の成功・「飛ばす」）・`clear()`（待ち列を空にする）。
  - reader は画面にいるあいだは使い回し、画面を離れたら `terminate` する。読み取り中に画面を離れたときは、読み取りのループを止め、reader を `terminate` して、届いた結果を捨てる。
- D13: 名前（画面設計の `<名前>`）は、ファイル選択とドラッグ＆ドロップはファイル名、貼り付けは常に「貼り付けた画像 <i>」（その回に渡した順の番号）にする。Chromium は貼り付けた画像に `image.png` という名前を付けるため、ファイル名では区別できない。
- D14: 受け取りの経路（AC-1・画面設計の入力規則）。
  - ファイル選択: 「画像を選ぶ」が隠した `<input type="file" accept="image/*" multiple>` を開く。input には `aria-label` を付け（Sonar の `Web:InputWithoutLabelCheck` を避ける）、選んだ後は値を空にして、同じファイルをもう一度選べるようにする。
  - 貼り付け: 護石の画面がマウントされているあいだ、`document` の `paste` を聞く。`clipboardData.files` に画像のファイル（`type` が `image/` で始まる）があるときだけ `preventDefault` して `accept` に回し、無いときは何もしない。画面のダイアログ（削除の確認・端末からの取り込み）が開いているあいだは受け付けない。
  - ドラッグ＆ドロップ: 受け取りの枠の `dragover`・`drop` で受ける。枠の外に落としたときにブラウザが画像を開かないよう、画面がマウントされているあいだ `window` の `dragover`・`drop` で `preventDefault` する（枠の外では何もしない）。ドラッグ中の見た目は、`dataTransfer.types` に `Files` があるときだけ変える。
  - フォームが無効（`charms.status !== 'ready'`）のあいだは、3つとも受け付けない。
- D15: 部品の分け方。
  - 新規 `components/charms/CharmOcrCard.vue`: 画面設計の部品 A（受け取りの枠・注記・進み具合の `<output>`・2つの帯・「待ち列を空にする」）。状態は D12 の composable から props で受け、操作は emit で返す。
  - `CharmsView.vue`: composable を持ち、左の列を `CharmOcrCard` → `CharmForm` の順に積む（`lg` 以上は左の列の中で縦に積む。`lg` 未満は1カラムで、カード → フォーム → 一覧）。貼り付けと枠の外のドロップのリスナーを置く。待ち列の先頭を `CharmForm` に渡し、`registered`・`skip` で `next()` を呼ぶ。
  - `CharmForm.vue`: 新しい props `prefill`（`{ key: string; result: CharmReadResult; previewUrl: string; remaining: number; reading: boolean } | null`）を受ける。`prefill` があり登録のモードのときだけ、画面設計の部品 B（読み取りの帯・切り抜き・未読の行の印・スロットの「未選択」・「飛ばす」）を出す。登録のモードで保存に成功したら、新しい emit `registered` を出す（編集のモードの `saved` は変えない）。「飛ばす」は emit `skip`。
- D16: 仮入力の写し方（AC-4・AC-5）。`prefill.key` が変わったとき（と、編集のモードを抜けて登録のモードに戻ったとき。`loadDraft` が入力を空にした後）に、登録のモードの入力を次で上書きする。レア度は `null`、触った行・送信の試み・確認のチェックは消す。
  - スキルの行 i: `i < result.skills.length` で値があれば、その `SkillLevel` と表示名（`master.nameOf`）を Combobox に入れる。`null` なら空にして未読の印を付ける。`i ≥ result.skills.length` なら空（印なし）。
  - スロットの行 i: `i < result.slots.length` で値があればその `Slot`、`null` なら値を空（Select の表示は「未選択」）にして未読の印を付ける。`i ≥ result.slots.length` なら「なし」（印なし）。
  - 例: `result = { skills: [攻撃 Lv3, null], slots: [武器用 Lv2, null] }` → スキル1 攻撃 Lv3・スキル2 空＋印・スキル3 空、スロット1 武器用 Lv2・スロット2 未選択＋印・スロット3 なし。帯は「読み取れなかった行が 2 行あります。」。
  - 未読の印は `unread`（`skills:<i>`・`slots:<i>` の集合）で持つ。その行の値を変えたら（スロットで「なし」を選んだときも）外す。スロットの「なし」（`null`）と「未選択」は、`unread` にあるかで区別する。
  - 未読のスロットの行は、`allErrors` に「スロットを選んでください。無ければ「なし」を選んでください。」を足す。同じ行に既存の検査のエラー（上の行から順に、の検査）があっても、この文言を優先する（`pendingTextErrors` と同じ扱い）。未読のスキルの行には新しいエラーを足さない（空の行は今もスキルなしの意味。途中の空の行は既存の検査のエラーになる）。
  - フォーカス: 待ち列が空から1件以上になったときと、`next()` の後はレア度へ（`focusRarity`）。待ち列が残っているときに画像を足しても、仮入力とフォーカスは変えない。最後の1件を終えたとき・「待ち列を空にする」の後は、入力を空にし（レア度も）、「画像を選ぶ」へ。
  - 保存に失敗したとき（検査のエラー・409 など）は `registered` を出さず、待ち列を進めない。
  - 編集のモードのあいだは仮入力しない（`prefill` があっても部品 B を出さない）。

### テスト（AC-11）
- D17: 単体テスト（web-agent。`apps/web/src/test/`。ゲームの画像を使わない）。jsdom には `createImageBitmap`・`OffscreenCanvas` が無いので、画面と composable のテストでは `@/lib/ocr/inspect` と `@/lib/ocr/reader`（または `tesseract.js`）を `vi.mock` で差し替える。
  - `lib/ocr`: D2 の枠の規則（合成した枠の判定結果からの `skills` の組み立て）・D9（`setParameters` の失敗で `terminate`）・D10 の 16:9 の判定（境界の例）と切り抜きの矩形の計算（純粋な関数に分けて検査する）。
  - composable: 20 枚の上限・`notImage`・`notWide` の理由・順序・読み取り中の受け付けの拒否・準備の失敗と k 枚目の失敗（worker の `terminate`・読み取れた分の保持）・`next`・`clear`・スコープの破棄で `terminate` と `revokeObjectURL` が呼ばれること・最初の `accept` までは `createCharmReader` を呼ばないこと（AC-9）。
  - 画面（`CharmsView`・`CharmForm`）: 3つの経路（`change`・`paste` の合成イベント・`drop` の合成イベント）・仮入力（D16 の例）・未読の印と `aria-describedby`・スロットの未選択のエラー・「登録」の成功で次の1件・保存の失敗で進まない・「飛ばす」・最後の1件の後の初期化とフォーカス・編集のモードの優先と抜けた後の仮入力し直し・文言（画面設計の項目定義の固定値）。
  - 既存の `CharmsView.spec.ts`・`CharmsView.account.spec.ts`・`CharmsView.import.spec.ts` は、カードが増えても通るように追従する（待ち列が無いときの「入力を空にする」の動きは変えない）。
- D18: e2e（e2e-agent。`apps/web/e2e/charm-ocr.spec.ts`）。ゲームの画像を使わず、テストの中でブラウザの canvas で合成した画像を作る（リポジトリに画像を置かない）。本物の Tesseract.js が動く。
  - 合成する画像: 1920x1080 の黒一色の PNG（空の護石として読まれ、スキルなし・スロットなしの読み取り結果になる）・1600x1200 の PNG（16:9 でない）・PNG の名前の文字列のファイル（画像として開けない）。
  - 流れ: ファイル選択で 16:9 の画像2枚と対象外の2枚を渡す → 読み取らなかった画像の帯に2件の理由・フォームの帯に「残り 2 件」・レア度が未選択 → レア度を選んで「登録」（照合が一致しなければ確認のチェックを付ける）→ 一覧の件数が増え「残り 1 件」→「飛ばす」→「読み取った護石をすべて終えました。」とフォームが空。
  - 貼り付けとドラッグ＆ドロップは、`page.evaluate` で `DataTransfer` に合成の `File` を入れて `paste`・`drop` のイベントを出し、待ち列に入ることを確かめる（`tsconfig.e2e.json` に DOM の型が無いので、`evaluate` の中は最小の型で受ける。教訓台帳 2026-11-02）。
  - 通信（AC-9・AC-10）: 画面を開いた直後は `/tesseract/` へのリクエストが無く、最初の画像を渡した後にあること。流れの全体で、自オリジン以外へのリクエストと、画像の読み取りの間の GET 以外のリクエストが無いこと（未ログインで端末に保存する）。
  - 未読の印・20 枚の上限・失敗の帯は単体テストで検査し、e2e では扱わない（合成画像で Tesseract に特定の行を読ませる・失敗させるのは不安定なため）。

### 委譲の順と見積もり
- D19: T1（e2e）→ T2（web）→ T3（メインの測定と記録）→ T4（web）→ T5（e2e）。T2 は T1 の測定で改善を見比べるので T1 の後。T4 は T3 の合格の後（D7）。web と e2e はどちらも pnpm workspace を検証する役割なので、並列にしない。T2 の web-agent は、測定（`pnpm --filter @swv/web exec playwright test --project=measure e2e/measure/charm-ocr.measure.ts`。画像は手元の git 管理外の置き場にある）を実行してよいが、測定のファイルは書かない。
- D20: 見積もり（handoff の要確認事項）。ドラッグ＆ドロップは、D12 の `accept` を共有し、増えるのは枠のイベント2つと枠の外の `preventDefault` だけなので、別の機能に切り出さない。切り出しても、016 の規模（読み取りの改善・待ち列・フォームの仮入力・e2e）はほとんど減らないため。

## 常時許可外の変更
- `design/tech-stack.md`（再測定の節を足し、Web の表の Tesseract.js の3行を採用に直し、015 の節に再測定への参照を足す。担当: メイン。時期: T3（T2 の後）。理由: AC-15・D6）
