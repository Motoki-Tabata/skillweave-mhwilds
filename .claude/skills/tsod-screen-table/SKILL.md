---
name: tsod-screen-table
description: 区間 B。承認済みの薄仕様から、画面設計（ゲート B-1。UI を持つ機能だけ）とテーブル設計（ゲート B-2。変更がある機能だけ）を進め、handoff に承認を記録して、停止して /tsod-plan を案内する区間コマンド。ユーザーが「/tsod-screen-table NNN」と打ったときだけ起動する。
disable-model-invocation: true
argument-hint: "<NNN または NNN-slug>"
effort: high
---

# 区間 B: 画面設計とテーブル設計

共通動作は `.claude/skills/tsod-workflow/SKILL.md`「区間コマンドの共通動作」に従う。推奨モデルは Opus（画面とテーブルの設計判断が下流全体を決めるため）。

## 開始条件

`specs/NNN-<slug>/handoff.md` を全文読み、ゲート A-2 が `承認済み` であること、現在地が区間 B であることを確かめる。満たさなければ停止して `/tsod-spec NNN` を案内する。ブランチは `feat/NNN-<slug>` であること。

## 画面設計（UI を持つ機能だけ。ゲート B-1）

### 起動条件（UI 判定）

`spec.md` の `## 影響範囲` の `触る領域:` 行を見る。

1. `web` を含む → UI あり。この節を実行する。
2. `web` を含まない → UI 無しとして、handoff のゲート B-1 を `該当なし（UI 無し）` にしてテーブル設計へ進む。
3. `触る領域:` 行が無い・解析できない → 黙ってスキップせず、スキップの可否をユーザーに1問だけ確認する。

### 手順

1. **screen-design-agent** を native の `subagent_type` で起動する。`screen-design.md` の下書きと、`/design` に渡す説明文の案を受け取る。委譲プロンプトには、薄仕様のパス（`specs/NNN-<slug>/spec.md`）・機能 ID・UI 判定の結果・関連する既存画面（`apps/web/src/main/**` の該当ディレクトリの目安）を入れる。標準（`design/ui-design-standard.md`）の全文を読むのは screen-design-agent で、メインは報告の「標準との突合結果」で数値が許容値に収まることを確かめ、疑義のある項目だけ該当節を読む。
2. メインが説明文を組み立ててユーザーに提示し、**「ユーザー自身が `/design <説明文>` を実行して、キャンバス URL と確定内容を返す」よう依頼する。** メインもサブエージェントも `/design` を起動しない（Skill ツールで呼ばない）。`/design` はユーザーだけが起動できるため。
3. 返った URL と確定内容を `specs/NNN-<slug>/screen-design.md` に取り込む（書くのはメイン）。キャンバス URL は同ファイルの「キャンバス URL」欄に記録する。修正が要るときは、ユーザーが Artifact 上で直す。説明文を作り直す必要があるときは、screen-design-agent を新規起動する（前回の会話を再開しない）。
4. 成果物と URL を提示して AskUserQuestion を1回取る（ゲート B-1）。承認されたら handoff に記録してコミットする。

### 使えないとき

`/design` の前提（Claude Code のバージョン・プラン・ログイン方式・組織の設定など。前提の列挙の正は [builtin-skills.md](../tsod-workflow/references/builtin-skills.md)）を満たさない、または起動できない（挙動が変わった）ときは、`/design` を再試行せず、**キャンバス無しで進める**。screen-design-agent の下書きをもとに、`specs/NNN-<slug>/screen-design.md`（`design/ui-design-standard.md` に従う画面構成・部品・状態・項目定義）を正として、ユーザーと文章で確定する。その旨を handoff の「区間メモ」に1行残す。

### 出力: `specs/NNN-<slug>/screen-design.md`（これが正）

- 画面一覧
- 画面ごとの画面構成・部品・項目定義・入力規則・状態・遷移
- キャンバス URL（キャンバス無しで進めたときは「なし」）

項目定義・入力規則の数値（フォントスケール等）は `design/ui-design-standard.md` の許容値に従う。数値そのものは同ファイルが正で、ここにも `.claude/rules/ui-design.md` にも写さない。1行に複数の要素を並べるレイアウトは、最小対応幅での幅の合計を概算し、切り詰める要素と最小幅を決める（規律の正は `.claude/rules/ui-design.md`）。

既存画面の現状確認が要るときは、ユーザーに画面の提示（スクリーンショットなど）を依頼するか、`apps/web/src/main/` の該当コンポーネントを読む。

キャンバスは作成者以外に公開せず、共有リンクを外部に配らない（確定前の設計を含むため）。`/design` は Experimental な機能に依存する（依存の扱いは builtin-skills.md）。

## テーブル設計（変更がある機能だけ。ゲート B-2）

この節の対話はメインが inline で行い、ユーザーと直接やり取りする。ユーザーとの対話は2点に限る: (1) テーブル変更の有無と設計の合意（1問）、(2) 書き出し後のゲート B-2（1問）。data-model-agent への書き出しの事前同意は求めない。

マイグレーションの置き場（`apps/api/src/main/resources/db/migration/`）は、予約の場所で、最初のマイグレーションを足す機能で作られる（置き場の扱いは `.claude/rules/data-model.md`）。

1. `spec.md`（UI があれば `screen-design.md` も）から、テーブル変更の要否を判断する。
2. 変更が要らないと判断したら、根拠（契約差分・受入基準のどれにも新しい永続化が無い等）を添えて「テーブル変更なしでよいか」を1問で確認する。合意されたら handoff のゲート B-2 を `該当なし（テーブル変更なし）` にして、区間の終わりへ進む。
3. 変更が要るなら、次を1問の合意として提示する（修正のやり取りが続いても同じ問いの続き）。
   1. `spec.md`（と `screen-design.md`）を読み、必要最小のテーブル／カラムの案を作る。
   2. `design/data-model-standard.md`（命名規則・型・監査カラムの正）と `design/attributes.yaml`（既存属性辞書）を読み、既存の命名規約・属性との整合を確かめる。全文は転記しない。
   3. 新規／変更するテーブル・カラム・型・制約の案を提示し、inline で合意を取る。正規化の判断・既存属性との整合・命名規約の適用は、ここで人間と一緒に確定させる（機械的に決め切らない）。この合意はゲートではなく、handoff に記録しない。
4. 合意したら、Flyway マイグレーションのファイル名（`V<N>__<name>.sql`。連番は `apps/api/src/main/resources/db/migration/` の既存の最大連番 + 1。ディレクトリが無ければ `V1`）を決め、すぐに **data-model-agent** を native の `subagent_type` で起動する。

### 委譲プロンプトに注入する4項目（data-model-agent の「入力」節と同じ数・同じ順）

1. 薄仕様のパス（`specs/NNN-<slug>/spec.md`）
2. 合意したテーブル設計の確定内容（テーブル名・カラム・型・制約・`attributes.yaml` へ追記する属性・マイグレーションのファイル名）
3. 書込許可フォルダ（`.claude/skills/impact-scope/SKILL.md`「書込許可フォルダ」節のとおり）
4. 検証の下限: 生成した SQL が Flyway の命名規約と連番に適合し、`design/data-model-standard.md` の規約（主キー・区分カラム・監査カラム）を満たすことの自己確認

data-model-agent は Bash を持たない。書き出し後に、メインが `node .claude/skills/tsod-verify/scripts/verify.mjs --only api` を `run_in_background` で1回実行して確かめる（[待ち方](../tsod-workflow/references/waiting.md)）。

### ゲート B-2

data-model-agent の完了報告・書き出された `design/data-model-standard.md`・`design/attributes.yaml`・マイグレーションの差分（`git diff`）・verify の要約を提示して、AskUserQuestion を1回取る。差し戻しなら、修正指示と差分だけを渡して data-model-agent を新規起動する。数行の定型修正はメインが直接修正する（[direct-edit.md](../tsod-workflow/references/direct-edit.md)）。承認されたら handoff に記録してコミットする。

### 生成物

- `design/data-model-standard.md`・`design/attributes.yaml`（data-model-agent が書く。各エントリに `defined_by: specs/NNN-<slug>` を付ける）
- `apps/api/src/main/resources/db/migration/V<N>__<name>.sql`（data-model-agent が書く）

## コミット

[commit-rules.md](../tsod-workflow/references/commit-rules.md) に従う。画面（`screen-design.md`）とテーブル（マイグレーション・design 文書）は別のコミットにする。

## 区間の終わり（次のコマンドと推奨モデル）

ゲート B-1・B-2 のどちらも承認済み（または該当なし）になったら、handoff の「現在地」を、「区間の終わりの定型」の B→C の行のとおり書く。「未起票の教訓」を起票するか、持ち越す理由を書いてコミットする。

このセッションでは次の区間に進まない。次の定型の案内文を出して停止する。

「新しいセッションを開き、`/model opus` にしてから `/tsod-plan NNN-<slug>` を起動してください。」
