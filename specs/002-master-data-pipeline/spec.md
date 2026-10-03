# 002: master-data-pipeline

## 目的 / ユーザーストーリー
開発者（オーナー）として、MHDB（`LartTyler/mhdb-wilds-data` の `output/merged`）からマスターデータ（`MasterBundle`）と ja/en の辞書を、1コマンドで同じ結果に再現できるように生成したい。ソルバー（003）と画面（004）が共通に読む入力をここで固め、MHDB に無い値と MHDB の誤りは手作業のオーバーレイで重ねられるようにする。オーバーレイは仕組みまでを持ち、抽選テーブル（005）・効果数値（006）・個体差武器の選択肢（008）の中身は各機能で埋める。

用語:
- 取得物: 固定したコミット SHA の MHDB の統合 JSON（スキル・防具・装飾品・護石・武器14種）。コミットしない（decisions.md Q11）。
- オーバーレイ: `packages/data/overlays/*.yaml`。ID を指定してエントリの項目を置き換える定義と、MHDB に無い最上位の項目（`appraisedCharm`）の定義（decisions.md Q9・Q10）。
- 版: 人が設定ファイルに書く `master_version`（例: `2026.10.1`。decisions.md Q12）。

## 受入基準（EARS記法）
- THE system SHALL `packages/data` に、取得→変換→オーバーレイ→検証→出力を順に実行する1つのコマンド（`package.json` の script）を提供し、実行器の依存を足さずに Node 24 の型除去で実行しなければならない。
- WHEN 生成を実行したとき THE system SHALL 設定ファイルに書かれたコミット SHA の取得物を raw.githubusercontent.com から取得して git 管理外のキャッシュに置き、同じ SHA のキャッシュがあればネットワークに接続せずにそれを使わなければならない。
- THE system SHALL マスターの ID を gameId から次の規則で生成しなければならない: スキル `sk:<gameId>`・防具 `ar:<防具セットの gameId>:<部位>`・装飾品 `dc:<gameId>`・武器 `wp:<武器種>:<gameId>`・生産護石 `ch:<gameId>:<ランク>`・シリーズ／グループスキル `sb:<スキルの gameId>`。MHDB の `id` は使ってはならない。
- THE system SHALL 下位を含む全防具・武器14種の全武器・全装飾品・全スキル・生産護石の全ランクを `MasterBundle` に変換しなければならない（スキルの種別 `set` は `series` に読み替え、防具の防御力は強化後の最大値、防具のスロットは防具用、武器のスロットは武器用とする）。鑑定護石の本体（MHDB の `is_random` の護石）は生産護石に含めてはならない。
- THE system SHALL 名前と説明文（スキルはレベルごとの説明文を含む）を `MasterBundle` に入れず、ID をキーにした ja と en の辞書に分けて出力しなければならない。ja・en 以外の言語は出力してはならない。
- WHEN オーバーレイがあるとき THE system SHALL 変換の後に、ID を指定したエントリの項目の置換と、`appraisedCharm` の定義を `MasterBundle` に重ねなければならない。
- IF オーバーレイが存在しない ID・存在しない項目を指すか、YAML として解釈できないとき THEN システムは、ファイル名と該当箇所を示して生成を失敗させ、出力を書いてはならない。
- THE system SHALL 出力の前に次を検証し、違反があれば違反の一覧を示して生成を失敗させ、出力を書いてはならない: ID の重複がない・参照するスキル ID と `sb:` の ID がすべて存在する・スキルのレベルが 1 以上でそのスキルの最大レベル以下・スロット Lv が 1〜4・シリーズ／グループスキルの発動部位数が昇順で重複しない・同じスキルを持つ防具セットの間で発動部位数とレベルが一致する・辞書に全 ID の ja と en の名前がある。
- THE system SHALL 現行の MHDB で検出される誤り（護鎖刃竜の命脈のシリーズスキルで、防具セットによって発動部位数の定義が重複している件）を、生成物の手編集ではなくオーバーレイで訂正しなければならない。
- THE system SHALL `packages/data/dist/` に `master-<版>.json` と ja・en の辞書を出力し、同じ取得物・オーバーレイ・版からはバイト単位で同じ内容を出力しなければならない（キーと配列の順序を固定する）。
- IF 出力しようとする版のファイルが既にあり、中身が異なるとき THEN システムは、版を上げるよう示して生成を失敗させ、既存のファイルを上書きしてはならない。
- WHEN 新しい版を出力したとき THE system SHALL `dist/` から旧版のファイルを削除し、現行の版だけを残さなければならない。
- THE system SHALL `MasterBundle` に取得元（リポジトリとコミット SHA）と版を記録しなければならない。
- THE system SHALL CI で実行するテストで、ネットワークに接続せずに、コミット済みの `dist/` の内容を上記の検証にかけなければならない。変換・オーバーレイ・検証の単体テストは、手で書いた小さな入力で行わなければならない（MHDB の取得物をテストに取り込まない）。
- THE system SHALL `@swv/data` のエントリ（`src/main/index.ts`）から `MasterBundle` と辞書の型を export し、エントリから Node の API に依存するコードを読み込ませてはならない（ブラウザとソルバーが型を読めるようにするため）。

## スコープ外
- 鑑定護石の抽選テーブル（005）・効果数値 `effectsByLevel` と発動条件（006）・個体差武器の選択肢（008）の中身。002 では空のままにする
- 極意スキル（`raisesMaxLevel`）の出力（decisions.md Q7）
- ja・en 以外の言語の辞書、画面の文言の多言語化（Q4。004 で決める）
- マスターの配信・ブラウザでの読込み・クレジットの画面表記（004）
- ソルバーの型を `@swv/data` の型へ寄せること、実データでのソルバーの再測定（003）
- 旧版のマスターの保持（011 build-save で決める。decisions.md Q12）
- CI での取得と再生成の一致確認（ローカル限定。decisions.md Q11）、MHDB の更新の自動検知（`/version` は人が参照するだけ）
- 武器の斬れ味・匠・弾・狩猟笛の旋律など、`MasterWeapon` の型に無い項目
- `temp/initial-design.md` §7 の `design/master-data.md` への卒業（区間 E）

## 契約差分
- なし（API を持たない。マスターデータは静的ファイルとして配信する）

## 影響範囲
触る領域: data
常時許可外の変更予定:
- `packages/data/package.json`（devDependencies に yaml を追加する。生成のコマンドの script を足す）
- `pnpm-lock.yaml`（yaml の追加に伴う更新）
- `packages/data/tsconfig.json`（Node の型除去で実行するため、拡張子 .ts 付きの import を許す）
- `packages/data/vitest.config.ts`（最初のテストを書くので passWithNoTests を外す）
- `.gitignore`（取得物のキャッシュを git 管理外にする）
- `packages/data/overlays/corrections.yaml`（MHDB の誤りの訂正。canon への要求が反映されるまで data-agent の書込許可の外）
- `packages/data/dist/master-2026.10.1.json`（生成物。生成のコマンドの実行で書く）
- `packages/data/dist/master-2026.10.1.ja.json`（生成物の ja の辞書）
- `packages/data/dist/master-2026.10.1.en.json`（生成物の en の辞書）

## 依存する機能ID
- なし
