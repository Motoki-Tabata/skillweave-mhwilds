---
name: tsod-workflow
description: 区間 A〜E（/tsod-spec・/tsod-screen-table・/tsod-plan・/tsod-build・/tsod-ship。区間の外に /tsod-discover）の進め方、推奨モデル、ブランチ、コミット規約、handoff の書式、教訓台帳（tasks/lessons.md）の書式、組込み Skill の依存、メインの直接修正の基準、依存更新の棚卸し、読み込みと待ち方の規律を確かめたいときに読む参照知識。区間コマンドの実行中に手順で迷ったとき、handoff を作る・更新するとき、教訓や canon への改修要求を起票するとき、依存の更新を点検するときは、明示されなくても読む。
user-invocable: false
effort: medium
---

# TSOD ワークフロー（区間 A〜E の共通知識）

1機能 = 1薄仕様 = 1ブランチ = 1PR。レイヤー別のスタック PR（`NNN/1-contract` 等）は採らない。

## 区間表（唯一の正）

区間コマンドは自分の区間の行を実装する。ゲートの列挙はこの表が正で、他の文書には件数を書かない。

| 区間 | コマンド | 扱う成果物 | ゲート | 推奨モデル | 開始条件（handoff） | 終了時に案内する次のコマンド |
|---|---|---|---|---|---|---|
| 区間外 | `/tsod-discover` | 要件→機能マップ（`feature-map.md`）・要確認事項（`open-questions.md`） | なし | Opus | — | `/tsod-spec NNN`（機能ごとの開発の入口） |
| A | `/tsod-spec` | 未確定事項→薄仕様 | A-1 未確定事項の決定・A-2 薄仕様 | Opus | `feature-map.md` に対象機能がある | `/tsod-screen-table NNN`（UI もテーブル変更も無ければ `/tsod-plan NNN`） |
| B | `/tsod-screen-table` | 画面→テーブル | B-1 画面設計・B-2 テーブル設計 | Opus | A-2 承認済み | `/tsod-plan NNN` |
| C | `/tsod-plan` | plan.md・tasks.md | C-1 plan/tasks | Opus | B 記録済み（または「該当なし」） | `/tsod-build NNN` |
| D | `/tsod-build` | 実装→レビュー | D-1 実装受入 | Sonnet（reviewer-agent だけ Opus） | C-1 承認済み | `/tsod-ship NNN` |
| E | `/tsod-ship` | PR→CI→マージ→ドリフト検査→drift PR→マージ→ブランチ掃除 | E-1 マージ・E-2 ドリフト是正と drift PR のマージ | Sonnet | D-1 承認済み | なし（機能は完了。次の機能は `/tsod-spec NNN`） |

UI もテーブル変更も無い機能は、区間 A の終わりで区間 C を案内してよい。区間 B は handoff に「該当なし」と記録して飛ばす。

## 原則

- 区間ごとに新しいセッションで始める。同じセッションで次の区間へ進まない。区間の切れ目の判断をユーザーに委ねると、文脈が膨らんだまま下流の判断を重ねてしまうため。
- 区間どうしの引き継ぎは会話でなく `specs/NNN-<slug>/handoff.md` で行う（書式の正は [references/handoff-template.md](./references/handoff-template.md)）。

## 区間コマンドの共通動作

1. 開始時に handoff を全文読み、開始条件（前の区間のゲートの承認）を確かめる。満たさなければ停止して、handoff の「次に起動するコマンド」を案内する。
2. 推奨モデルの案内は、セッションのモデルをそのまま継承する。継承したモデルが推奨と違うときだけ、`/model` での切替を1回提案する（強制しない）。
3. ゲートは AskUserQuestion を1回だけ取る。承認されたら、同じターンで handoff に記録してコミットする。
4. 区間の終わりでは、handoff の「現在地」を [handoff-template.md](./references/handoff-template.md) の「区間の終わりの定型」のとおりに書き、停止して次のコマンドと推奨モデルを `Opus`／`Sonnet` の表記で案内する。

## ブランチ

- `feat/NNN-<slug>`: 区間 A〜E のマージまで（`specs/NNN-<slug>/` と対応させる）。
- `docs/NNN-<slug>-drift`: 区間 E のドリフト是正と `temp/` の卒業。
- `chore/deps-review-YYYYQn`: 依存更新の四半期の棚卸し（手順は [references/deps-review.md](./references/deps-review.md)）。機能開発の区切りに切り、区間 A〜E の外で進める。
- `docs/*`・`chore/*`: 区間の外の文書整理。

マージ後のブランチ掃除は `bash .claude/skills/tsod-ship/scripts/prune-gone-branches.sh` が行う（MERGED を確認できたブランチだけを削除する）。個別の git コマンドで消さない。

## 補助資料の索引（必要な場面で開く）

- [references/builtin-skills.md](./references/builtin-skills.md): `/design`・`/code-review` などの組込み Skill を使う前、または Claude Code を更新したとき。
- [references/canon-boundary.md](./references/canon-boundary.md): `.claude/**`・`CLAUDE.md` の変更要求が出たとき、許可の列挙を書くとき。
- [references/commit-rules.md](./references/commit-rules.md): コミットするとき。メッセージの形式と、区間ごとのコミットの単位。
- [references/deps-review.md](./references/deps-review.md): 依存更新の棚卸し（`chore/deps-review-YYYYQn`）を進めるとき、Dependabot の PR を扱うとき。
- [references/direct-edit.md](./references/direct-edit.md): メインが直接ファイルを直したくなったとき。直してよい範囲とメインの書込区分。
- [references/handoff-template.md](./references/handoff-template.md): handoff を作る・更新するとき。ゲート記録・コミット範囲・再開点・区間の終わりの定型。
- [references/judgment.md](./references/judgment.md): 技術判断の裏取り・他プロジェクトの標準の採否・削除の可否を決めるとき。
- [references/lessons-guide.md](./references/lessons-guide.md): 教訓・canon への改修要求を `tasks/lessons.md` に起票するとき。
- [references/reading-discipline.md](./references/reading-discipline.md): 区間 A〜C で `open-questions.md`・要件定義書などの大きいファイルを読むとき。
- [references/waiting.md](./references/waiting.md): 長いコマンド・CI・サブエージェントの完了を待つとき（区間 D・E）。
- [references/workflow-history.md](./references/workflow-history.md): この運用が TSOD の原典（`docs/method/`）とどこで違うか、その設計上の理由を確かめるとき。
