# 004: solver-ui

## 目的 / ユーザーストーリー
プレイヤー（ログインしていないゲスト）として、武器と欲しいスキルを選ぶだけで、それを満たす防具と装飾品の組み合わせ（構成）を画面で確かめたい。003 でできたソルバーを、ブラウザの Worker に結線して最初の画面に載せ、マスターデータの読み込み・二次創作である旨の表記とクレジット・e2e の基盤も揃える。

用語:
- 構成: 防具5部位（頭・胴・腕・腰・脚）と、それに付ける装飾品の配置。004 では護石を扱わない（護石なしで解く）。
- ランク: 防具の区分（下位・上位・マスター）。`packages/data` がレア度から決める（decisions.md Q21）。

## 受入基準（EARS記法）
- WHEN 画面を開いたとき THE system SHALL ログインと API 呼び出しなしで、`packages/data/dist/` の現行の版のマスターと ja の辞書を同一オリジンの静的ファイルとして取得し、Worker の中で HiGHS を初期化して、マスターを Worker に1回だけ渡さなければならない（decisions.md Q4）。
- IF マスター・辞書・HiGHS のいずれかの読み込みに失敗したとき THEN システムは、検索を実行できない状態にして、原因と次の行動（再読み込み）を示すメッセージを表示しなければならない。
- THE system SHALL 武器を、武器種で絞り込み、名前で検索して、マスターの武器から1つ選べるようにしなければならない。武器種・部位・ランクの表示名は画面の文言として持つ（decisions.md Q25）。
- THE system SHALL 必須スキルを、名前で検索してマスターのスキル（シリーズ／グループスキルを含む）から追加・削除でき、それぞれの下限レベルを 1 からそのスキルの最大レベルまでの範囲で選べるようにしなければならない。
- THE system SHALL 目的関数を「条件を満たす構成」「防御力の最大化」「空きスロットの最大化」から、件数を 1〜30（既定 10）から、候補にする防具のランクをマスターに含まれるランクから1つ以上（既定はマスターに含まれる最も高いランクだけ）選べるようにしなければならない（decisions.md Q20・Q21）。
- IF 武器が選ばれていないとき、または候補にするランクが1つも選ばれていないとき THEN システムは、検索を実行できないようにしなければならない。
- WHEN 検索を実行したとき THE system SHALL 条件を、護石の候補を空にし、選ばれていないランクの防具を除外の指定にした `SolverRequest` に変換して Worker で解き、メインスレッドでソルバーを動かしてはならない。検索中は見つけた件数を表示し、キャンセルできるようにしなければならない。
- WHEN 検索中に検索をやり直したとき、またはキャンセルしたとき THE system SHALL 前の検索の結果と進捗を画面に表示してはならない。
- WHEN 構成が見つかったとき THE system SHALL 構成ごとに、防具5部位の名前（防具が無い部位はその旨）、装飾品（付けたスロットの持ち主・Lv と装飾品名）、発動スキル（名前とレベル）、空きスロット（持ち主と Lv）、防具の防御力の合計を表示しなければならない。
- IF 構成が1件も無いとき（`infeasible`） THEN システムは、見つからなかったことと次の行動（必須スキルを減らす・下限を下げる・候補にするランクを広げる）を表示しなければならない。IF 時間の上限で打ち切られたとき（`timeout`） THEN システムは、それまでに見つけた構成とともに打ち切られた旨を表示しなければならない。IF ソルバーが `error` を返したとき THEN システムは、その原因を表示しなければならない。
- THE system SHALL すべての画面で常に見える場所に、非公式の二次創作である旨と、マスターデータの取得元（MHDB のリポジトリとコミット）のクレジットを表示しなければならず、`©CAPCOM` の表記と公式の画像・アイコンを使ってはならない。
- THE system SHALL `packages/data` のパイプラインで、防具にランクを、レア度とランクの対応表（現行のデータでは 1〜4 が下位、5〜8 が上位）から付けて出力し、対応表に無いレア度の防具があれば生成を失敗させなければならない。マスターの版を上げて `dist/` を再生成する（decisions.md Q21）。
- THE system SHALL Playwright（Chromium）の e2e テストを `apps/web/e2e/` に置き、ビルドした web を API・DB なしで起動して、実際のマスターと HiGHS で「武器と必須スキルを選んで検索し、構成が表示される」流れと、解なしの表示を検証しなければならない。CI に e2e ジョブを足して実行する（decisions.md Q24）。
- WHEN 測定を実行したとき THE system SHALL ブラウザ（Chromium）の Worker 上で、003 の測定と同じ必須スキルの組（3／6／10 個 × 解あり／解なし）を既定の件数で検索した1回の時間を出力し、3 秒の基準に対する合否とともに `design/tech-stack.md` に記録しなければならない。CI では時間を測らない（decisions.md Q20）。

## スコープ外
- 部位の固定・除外の入力 UI（decisions.md Q22。後で `/tsod-discover` で新しい機能として機能マップに追加する）
- 護石の入力と、護石を候補にした検索（005）。生産護石（マスターの `charms`）を候補にすることも含めない
- 個体差のある武器の入力（008）
- 火力（`expectedDamage`）の最大化と火力の表示（006・007）
- 検索条件と結果の端末への保存（decisions.md Q23）
- ログイン・ログアウトの導線（009）
- 画面の英語対応（decisions.md Q4）
- 見つけた構成を1件ずつ画面に出すこと（decisions.md Q20）
- Chromium 以外のブラウザでの e2e（decisions.md Q24）
- 一括検証（`tsod-verify`）の e2e の段と `CLAUDE.md` の Commands 表の e2e 対応（canon への改修要求として `tasks/lessons.md` に起票する。decisions.md Q24）
- 防具・装飾品の所持の管理（すべて持っているものとする）
- PWA・オフライン対応（018）

## 契約差分
- なし（API を持たない。マスターは静的ファイルとして配信し、ソルバーはブラウザの Worker で動く）

## 影響範囲
触る領域: web, data
常時許可外の変更予定:
- `apps/web/package.json`（dependencies に @swv/solver・@swv/data・highs・reka-ui などの shadcn-vue の依存を、devDependencies に @playwright/test を追加し、test:e2e と測定の script を足す）
- `pnpm-lock.yaml`（上記の依存の追加に伴う更新）
- `apps/web/vite.config.ts`（Worker と HiGHS の WASM・マスターの静的ファイルの配信）
- `apps/web/playwright.config.ts`（新規。e2e の設定）
- `apps/web/tsconfig.json`（e2e の型検査の参照を足す。tsconfig の分け方は plan で決める）
- `.github/workflows/ci.yml`（e2e ジョブを足す）
- `.gitignore`（Playwright の出力を git 管理外にする）
- `README.md`（「残作業」節の e2e ジョブの行を消す）
- `design/tech-stack.md`（Worker 上の測定の結果と、導入した依存の版を記録する）
- `design/master-data.md`（防具のランクとレア度の対応表の規則を足す）
- `design/ui-design-standard.md`（004 で決める未決の項目を確定する。区間 B）
- `packages/data/dist/master-2026.10.2.json`（生成物。版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.10.2.ja.json`（生成物の ja の辞書）
- `packages/data/dist/master-2026.10.2.en.json`（生成物の en の辞書）
- `packages/data/dist/master-2026.10.1.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.10.1.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.10.1.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 002
- 003
