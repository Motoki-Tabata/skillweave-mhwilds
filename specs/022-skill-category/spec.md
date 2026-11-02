# 022: skill-category

## 目的 / ユーザーストーリー
プレイヤーとして、スキルを選ぶダイアログで、欲しい効果のスキルを攻撃系・会心系などの分類から探したい。いまは種類のタブの中が名前順だけなので、名前を知らないスキルや、名前から効果が分かりにくいシリーズ・グループのスキルを見つけにくい。

用語:
- 分類: スキルの効果による区分。`attack`（攻撃）・`affinity`（会心）・`element`（属性・状態異常）・`sharpness`（斬れ味）・`weapon_specific`（武器種固有）・`defense`（防御・回復）・`resistance`（耐性）・`mobility`（行動・スタミナ）・`support`（探索・支援）の 9 つ（decisions.md Q124）。この順を表示の順とする。
- 種類: 既存の `MasterSkill.kind`（武器・防具・シリーズ・グループ）。分類とは別のもので、022 では変えない。

画面に出す値の出どころ: スキルの分類は `packages/data` が生成する JSON の `MasterSkill.category`、見出しの表示名は `apps/web/src/main/constants/labels.ts` の定数（decisions.md Q127）。

## 受入基準（EARS記法）
- AC-1: THE system SHALL マスターのすべてのスキル（武器・防具・シリーズ・グループ）の `category` に、9 つの分類のどれか 1 つを持たせて出力しなければならない。割当は ja の説明文の主な効果で決め、最終確認はオーナーが行う（decisions.md Q126・Q128）。
- AC-2: THE system SHALL 分類を overlay の最上位キー `categories`（スキル ID → 分類 ID）だけで定義しなければならない（decisions.md Q127）。
- AC-3: IF `categories` に、存在しないスキル ID、スキル（`sk:`）以外の ID、同じスキルの重複、9 つに無い分類 ID のいずれかがあるとき THEN システムは、ファイル名と行・桁を示して生成を失敗させ、`dist/` に何も書いてはならない。
- AC-4: IF 分類の無いスキルが残っているとき THEN システムは、該当のスキル ID を示して生成を失敗させ、`dist/` に何も書いてはならない（decisions.md Q127）。
- AC-5: WHEN 分類を足したマスターを生成したとき THE system SHALL 版を上げて `dist/` に現行の版だけを残し、スキルの `category` 以外の内容（ID・名前・効果・防具など）を 2026.10.4 から変えてはならない。
- AC-6: WHEN 検索語が空のとき THE system SHALL スキルを選ぶダイアログの種類のタブを今のまま残し、各タブの中を分類の見出しで区切って、見出しを用語の順に並べなければならない（decisions.md Q125）。
- AC-7: THE system SHALL 各見出しの下に、その種類とその分類のスキルだけを、今と同じ名前順で並べなければならない。
- AC-8: IF ある種類のタブに、ある分類のスキルが 1 件も無いとき THEN システムは、そのタブにその分類の見出しを出してはならない。
- AC-9: WHILE 検索語があるあいだ THE system SHALL 今と同じく、分類の見出しの無い一覧（種類の順、種類の中は名前順）を出さなければならない。
- AC-10: THE system SHALL スキルの追加・削除、説明の開閉（開くのはダイアログ全体で 1 つだけ）、フッターの選択中のスキルの挙動を、分類の見出しを足す前と変えてはならない。
- AC-11: THE system SHALL 分類を使うのをスキルを選ぶダイアログのタブの中の並びだけにし、ソルバーの結果と、他の画面（護石の入力のスキルの候補など）の並びを変えてはならない。
- AC-12: THE system SHALL Playwright（Chromium）の e2e テストで、実データのマスターについて「武器のタブで分類の見出しが用語の順に並ぶ」「見出しの下から選んだスキルが必須スキルに入る」「検索語を入れると見出しが消える」ことを検証しなければならない。

## スコープ外
- 分類で絞り込む操作（チップなど）と、種類のタブを分類のタブに置き換えること（decisions.md Q125）
- 1 つのスキルに複数の分類を持たせること（decisions.md Q126）
- スキルを選ぶダイアログ以外での分類の表示と利用（護石の入力、構成の詳細、結果のカードなど）
- 検索語による分類名での絞り込み（検索は今のスキル名と読みのまま）
- 分類の en の表示名（画面は ja だけなので、表示名は定数に ja だけを持つ）
- 検索画面のレイアウトの変更（open-questions.md Q28）

## 契約差分
- なし（API はスキルの種類も分類も持たない。マスターは静的配信の JSON で、保存済みの構成の `masterVersion` の形も変えない）

## 影響範囲
触る領域: data, web, solver
常時許可外の変更予定:
- `design/master-data.md`（overlay の分類の書式・検証規則と、スキルの分類の出力を足す）
- `packages/data/dist/master-2026.10.5.json`（生成物。分類を足すため、版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.10.5.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.10.5.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.10.4.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.10.4.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.10.4.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 002
- 004
