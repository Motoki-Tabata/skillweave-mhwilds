# specs — 薄仕様（Thin Spec）

1機能 = 1薄仕様 = 1ディレクトリ（`specs/NNN-<slug>/`）＝ 1ブランチ（`feat/NNN-<slug>`）= 1PR。
通常は `/tsod-spec NNN`（区間 A）で生成する。続く区間は `/tsod-screen-table`・`/tsod-plan`・`/tsod-build`・`/tsod-ship`。手法の原典（歴史的資料。現行運用の正ではない）は
[`docs/method/TSOD-薄仕様オーケストレーション開発.md`](../docs/method/TSOD-薄仕様オーケストレーション開発.md)、
区間・ゲートの対応とブランチ・PR 運用の正は [`.claude/skills/tsod-workflow/SKILL.md`](../.claude/skills/tsod-workflow/SKILL.md) を参照。

各ディレクトリの構成（機能ごとに作成する）:

```
specs/NNN-<slug>/
├── spec.md            # 必須6節（下記）
├── screen-design.md   # 画面設計（UIを持つ機能のみ。区間 B・tsod-screen-table が生成）
├── plan.md            # スタック・データモデル・決定事項・常時許可外の変更
├── tasks.md           # タスク分解（各タスクが受入基準を引用する）
├── decisions.md       # ゲート①などで確定した判断の記録（Q 番号つき。下記）
└── handoff.md         # 区間（S1→S2→S3）の引き継ぎとゲート承認の記録
```

### 要確認事項と決定記録

- [`open-questions.md`](open-questions.md) には**未解消の項目だけ**を置く。解消したら、結論をその機能の
  `decisions.md`（Q 番号と本文はそのまま）へ移し、`open-questions.md` からは削除する。
- Q 番号は**永久欠番**（再利用しない）。マイグレーション・design・コードのコメントが Q 番号で参照しており、
  `grep -rn 'Q1' specs/` のように必ず辿れる状態を保つ。次の番号は `open-questions.md` の冒頭に書く。

`spec.md` の必須6節（欠けてはいけない。`/tsod-spec-check` が決定論スクリプトで機械判定する）:

1. 目的 / ユーザーストーリー
2. 受入基準（EARS記法・5〜15個）
3. スコープ外
4. 契約差分
5. 影響範囲
6. 依存する機能ID

- `spec.md` には**業務ルール**を書く（EARS記法）。API の入出力の形そのものは書かない
  （それは `contracts/` の役割）
- 「影響範囲」節の書式（`触る領域:`・`常時許可外の変更予定:` の2行）と、書込ガードの判定に使わない点は
  下記の impact-scope が正。ここでは再定義しない
- 書式・書込許可フォルダ・ガードの仕組みの唯一の定義（SSoT）は
  [`.claude/skills/impact-scope/SKILL.md`](../.claude/skills/impact-scope/SKILL.md)。
  ここでは再定義しない
