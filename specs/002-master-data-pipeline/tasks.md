# 002: master-data-pipeline タスク

順序: T1 → T2・T3（同じ領域なので1回の委譲でよい）→ T4 → T5・T6（同じ領域なので1回の委譲でよい）→ T7。すべて pnpm workspace を検証する役割なので並列にしない。

- [ ] T1 [main]                委譲前の常時許可外の変更: yaml 2.9.1 の追加と `pnpm install`、scripts（generate・generate:check・2本の type-check）、`tsconfig.json` の2項目と `tsconfig.entry.json`（plan 決定事項 3・4）、`.gitignore` の `packages/data/.cache/`、`overlays/corrections.yaml`（命脈と黙示録の訂正。plan 決定事項 10・13）、`design/tech-stack.md`     refs spec §受入基準 1, 2, 9, 15
- [ ] T2 [data-agent]          入口の型（`index.ts` に型だけを直接書く。plan 決定事項 1・7）、設定（MHDB のリポジトリ・SHA `c50a1eb892f4a1ad9bb35c147801658804be2cc2`・版 `2026.10.1`）、取得とキャッシュ（決定事項 5・6）、ID 生成、変換と辞書（決定事項 8）、発動部位数の不一致の中間の状態（決定事項 9）     refs spec §受入基準 2, 3, 4, 5, 13, 15
- [ ] T3 [data-agent]          オーバーレイの解釈と適用（決定事項 10〜12）、検証（決定事項 14・15）、直列化と出力（決定事項 16・17）、実行の入口と `--check`（決定事項 2）。完了前に `pnpm --filter @swv/data run generate:check` を実行し、検証の違反が0件で、`dist/` が無いことだけを報告して失敗することを確かめる（`dist/` は書かない）     refs spec §受入基準 1, 6, 7, 8, 9, 10, 11, 12
- [ ] T4 [main]                `pnpm --filter @swv/data run generate` で `dist/master-2026.10.1{,.ja,.en}.json` を書き、続けて `generate:check` で再生成と一致することを確かめてコミットする（plan 決定事項 18）。違反・不一致が出たら data-agent を新規起動して直させる     refs spec §受入基準 9, 10, 12, 13
- [ ] T5 [data-test-agent]     手で書いた小さな入力での単体テスト（MHDB の取得物を取り込まない）: ID の規則、変換（`set` → `series`・防御力の最大値・スロットの種別・部位の set／group スキルの `setBonusIds` への振り分け・鑑定護石の除外・型の前提を外れたときの失敗）、辞書（ja・en だけ・スキルのレベルごとの説明文）、オーバーレイ（置換・`appraisedCharm`・plan 決定事項 12 の各失敗とファイル名・行番号の表示・不一致の解消）、検証の各規則、直列化（入力の順序を入れ替えても同じバイト列）、出力（一時ディレクトリで、版の中身が異なるときの失敗と非上書き・同じなら書き換えない・旧版の削除・違反があれば何も書かない）、取得（差し替えた fetch で、キャッシュがあれば呼ばれない・失敗時に URL を示す）     refs spec §受入基準 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14
- [ ] T6 [data-test-agent]     コミット済みの `dist/` のテスト（ネットワークに接続しない）: 設定の版のファイルだけがあること、`MasterBundle` の取得元と版が設定と一致すること、検証の関数で違反が0件であること     refs spec §受入基準 9, 12, 13, 14
- [ ] T7 [main]                `packages/data/vitest.config.ts` の `passWithNoTests` を外す（T5・T6 の後。plan 決定事項 18）     refs spec §受入基準 14
