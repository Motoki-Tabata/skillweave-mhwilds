---
name: tsod-workflow
description: 区間 A〜E（/tsod-spec・/tsod-screen-table・/tsod-plan・/tsod-build・/tsod-ship。区間の外に /tsod-discover）の進め方、推奨モデル、ブランチ、コミット規約、handoff の書式、教訓台帳（tasks/lessons.md）の書式、組込み Skill の依存、メインの直接修正の基準、依存更新の棚卸し、読み込みと待ち方の規律を確かめたいときに読む参照知識。区間コマンドの実行中に手順で迷ったとき、handoff を作る・更新するとき、教訓や `.claude/**`・`CLAUDE.md` への改修要求を起票するとき、依存の更新を点検するときは、明示されなくても読む。
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
| D | `/tsod-build` | 実装→レビュー | D-1 実装受入 | Sonnet | C-1 承認済み | `/tsod-ship NNN` |
| E | `/tsod-ship` | PR→CI→マージ→ドリフト検査→drift PR→マージ→ブランチ掃除 | E-1 マージ・E-2 ドリフト是正と drift PR のマージ | Sonnet | D-1 承認済み | なし（機能は完了。次の機能は `/tsod-spec NNN`） |

`apps/web/src/main/**` の画面・部品を変えず、新しい永続化も無い機能（`触る領域:` に `web` を含んでも、テストの追従だけならこちら）は、区間 A の終わりで区間 C を案内してよい。区間 B は handoff に「該当なし」と記録して飛ばす。

## 原則

- 区間ごとに新しいセッションで始める。同じセッションで次の区間へ進まない。区間の切れ目の判断をユーザーに委ねると、文脈が膨らんだまま下流の判断を重ねてしまうため。
- 区間どうしの引き継ぎは会話でなく `specs/NNN-<slug>/handoff.md` で行う（書式の正は [references/handoff-template.md](./references/handoff-template.md)）。
- handoff は `node .claude/skills/tsod-workflow/scripts/handoff.mjs`（`init`・`gate`・`finish`・`check`・`set`・`transition`・`row`・`note`）だけで更新する。Edit・sed・python・node -e で書き換えない。

## 区間コマンドの共通動作

1. 開始時に handoff を全文読み、開始条件（前の区間のゲートの承認）を `handoff.mjs check NNN <ゲート>...` で照合する。exit 0 以外なら出力を示して停止し、handoff の「次に起動するコマンド」を案内する。
2. 推奨モデルの案内は、セッションのモデルをそのまま継承する。継承したモデルが推奨と違うときだけ、`/model` での切替を1回提案する（強制しない）。
3. ゲートは AskUserQuestion を1回だけ取る。承認されたら、次の順で進める。
   1. 成果物をコミットする。
   2. 同じターンで、成果物をコミットした直後の HEAD の短縮ハッシュを `handoff.mjs finish NNN <ゲート> <記録> [--move <移行>] [--note <節> <文>]` で handoff に記録する。ゲートの記録・区間メモ（`--note`）・現在地（`--move`）を1回で行う。`--move` と `--note` は要るときだけ付ける。
   3. `handoff.md` をコミットする（1回）。`finish` を打った後にコミットするのは `handoff.md` だけにする（成果物を変えると、次の区間の `check` が exit 1 になる）。
   - 記録済みのゲートへの `gate`・`finish` は、`--overwrite` が無いと exit 1 になる（二重の記録を防ぐ）。
4. 区間の終わりでは、handoff の「現在地」を [handoff-template.md](./references/handoff-template.md) の「区間の終わりの定型」のとおりにする。最後のゲートの `finish` に `--move <移行>` を付けて書く。最後のゲートが該当なしのときは `handoff.mjs transition NNN <移行>` で書く。停止して次のコマンドと推奨モデルを `Opus`／`Sonnet` の表記で案内する。

## 承認済みの前の区間の成果物を変えるとき

後の区間で、承認済みの前の区間の成果物（`spec.md` など）を変える必要が出たら、次の順で進める。

1. 成果物を修正する。
2. 修正した成果物に対応する検査を再実行する（`spec.md` なら `node .claude/skills/tsod-spec-check/scripts/spec-check.mjs specs/NNN-<slug>/spec.md`）。
3. 変えた理由と内容を `specs/NNN-<slug>/decisions.md` に記録する。
4. 成果物と `decisions.md` をコミットする。
5. AskUserQuestion で、そのゲートを取り直す。
6. 承認されたら、直後の HEAD の短縮ハッシュで `handoff.mjs finish NNN <ゲート> <短縮ハッシュ> --note 区間メモ <文> --overwrite` を実行し、ゲートの記録を上書きして区間メモに経緯を残す。
7. `handoff.md` をコミットする（1回）。

## ブランチ

- `feat/NNN-<slug>`: 区間 A〜E のマージまで（`specs/NNN-<slug>/` と対応させる）。
- `docs/NNN-<slug>-drift`: 区間 E のドリフト是正と `temp/` の卒業。
- `chore/deps-review-YYYYQn`: 依存更新の四半期の棚卸し（手順は [references/deps-review.md](./references/deps-review.md)）。機能開発の区切りに切り、区間 A〜E の外で進める。
- `docs/*`・`chore/*`: 区間の外の文書整理。

マージ後のブランチ掃除は `bash .claude/skills/tsod-ship/scripts/prune-gone-branches.sh` が行う（MERGED を確認できたブランチだけを削除する）。個別の git コマンドで消さない。

## 補助資料の索引（必要な場面で開く）

- [references/builtin-skills.md](./references/builtin-skills.md): `/design`・`/code-review` などの組込み Skill を使う前、または Claude Code を更新したとき。
- [references/canon-boundary.md](./references/canon-boundary.md): `.claude/**`・`CLAUDE.md` を直す経路を選ぶとき、許可の列挙を書くとき。
- [references/commit-rules.md](./references/commit-rules.md): コミットするとき。メッセージの形式と、区間ごとのコミットの単位。
- [references/deps-review.md](./references/deps-review.md): 依存更新の棚卸し（`chore/deps-review-YYYYQn`）を進めるとき、Dependabot の PR を扱うとき。
- [references/direct-edit.md](./references/direct-edit.md): メインが直接ファイルを直したくなったとき。直してよい範囲とメインの書込区分。
- [references/handoff-template.md](./references/handoff-template.md): handoff を作る・更新するとき。ゲート記録・コミット範囲・再開点・区間の終わりの定型。
- [references/judgment.md](./references/judgment.md): 技術判断の裏取り・他プロジェクトの標準の採否・削除の可否を決めるとき。
- [references/lessons-guide.md](./references/lessons-guide.md): 教訓・`.claude/**`・`CLAUDE.md` への改修要求を `tasks/lessons.md` に起票するとき。
- [references/reading-discipline.md](./references/reading-discipline.md): 区間 A〜E で `open-questions.md`・要件定義書・過去の機能の文書・`design/` 配下の大きな文書などを読むとき。
- [references/waiting.md](./references/waiting.md): 長いコマンド・CI・サブエージェントの完了を待つとき（区間 D・E）。
- [references/workflow-history.md](./references/workflow-history.md): この運用が TSOD の原典（`docs/method/`）とどこで違うか、その設計上の理由を確かめるとき。
