---
name: tsod-spec
description: 区間 A。1機能について、未確定事項の決定（ゲート A-1）と薄仕様 specs/NNN-<slug>/spec.md の作成（ゲート A-2）を進め、handoff に承認を記録して、停止して次のコマンドを案内する区間コマンド。ユーザーが「/tsod-spec NNN」と打ったときだけ起動する。
disable-model-invocation: true
argument-hint: "<NNN または NNN-slug>"
effort: high
---

# 区間 A: 未確定事項の決定と薄仕様

共通動作（handoff の読み込み・モデルの案内・ゲートの取り方）は `.claude/skills/tsod-workflow/SKILL.md`「区間コマンドの共通動作」に従う。推奨モデルは Opus（未確定事項の決定と影響範囲の判断が下流全体を決めるため）。

## 開始条件

`specs/feature-map.md` に対象機能 ID が存在すること。満たさなければ停止して `/tsod-discover`（新しい要件の追記）を案内する。

- `feat/NNN-<slug>` へ checkout する（無ければ `git checkout -b feat/NNN-<slug>`）。
- `specs/NNN-<slug>/handoff.md` が無ければ [handoff-template.md](../tsod-workflow/references/handoff-template.md) から作る。存在すれば全文を読み、最初の未承認ゲートから再開する。「現在地」の区間が B 以降なら、ここで停止して handoff の「次に起動するコマンド」を案内する。

## 工程1: 未確定事項の決定（ゲート A-1）

1. `specs/open-questions.md` から対象機能に関わる項目を Grep で特定し、該当の節だけを読む（[読み込みの規律](../tsod-workflow/references/reading-discipline.md)）。spec を書くのに必要なのに未確定の事項も洗い出す。`specs/open-questions.md` が無ければ、未解消の項目は無いものとして扱う。
2. 該当が無ければ、handoff のゲート A-1 の記録を `なし` にして工程2へ進む（問いを立てない）。
3. あれば、同じセッションでユーザーと壁打ちして決める。決定を `specs/NNN-<slug>/decisions.md` に、Q 番号と本文のまま移し、`open-questions.md` から該当項目を削除する（運用の正は `.claude/rules/specs-authoring.md`）。
4. 決定内容を提示して AskUserQuestion を1回取る（ゲート A-1）。承認されたら、handoff に移設先（Q 番号の一覧）を記録してコミットする。

## 工程2: 薄仕様（ゲート A-2）

### 前提確認

- `specs/feature-map.md` に対象機能がある。
- 対象機能に関わる項目が `open-questions.md` に残っていない（残っていれば工程1へ戻る）。

### 生成する spec.md（`specs/NNN-<slug>/spec.md`）

次の6節構成で書く（必須6節の正は `specs/README.md` の「`spec.md` の必須6節」の箇所）。対象プロジェクトの実ディレクトリ（`apps/api/**`・`apps/web/**`・`packages/**`・`contracts/**`）を使う。

```markdown
# NNN: <機能名>

## 目的 / ユーザーストーリー
<誰として、何をしたいか、なぜか>

## 受入基準（EARS記法）
- WHEN ... THE system SHALL ... しなければならない。
- IF ... THEN システムは ... しなければならない。
- WHERE ... THE system SHALL ... しなければならない。
- THE system SHALL ... しなければならない。
（5〜15個）

## スコープ外
- <やらないこと>

## 契約差分
- 追加/変更: <HTTPメソッド> <パス>（req/res概要）
- 追加/変更: スキーマ <名前>(<カラム>...)

## 影響範囲
触る領域: api, web, contracts
常時許可外の変更予定:
- `apps/api/build.gradle.kts`（<理由。例: testImplementation に xxx を追加>）

## 依存する機能ID
- なし / <NNN>
```

「影響範囲」節の定義（語彙・書式・書いてよいもの）は `.claude/skills/impact-scope/SKILL.md`「影響範囲節（spec.md）の定義」節が正（転記しない）。該当が無ければ `常時許可外の変更予定: なし` と1行で書く。

### 影響範囲を書く手順

1. 受入基準ごとに触る領域を実コードで確かめて `触る領域:` を決める。
2. 既存契約を確かめる。`contracts/openapi.yaml` から辿れる `contracts/` 配下のファイルを Glob で探す（置き場の規約は `contracts/README.md` と `.claude/rules/contracts-first.md`）。API を持たない機能（ソルバー・マスターデータのパイプラインなど）は、契約差分を「なし」にする。
3. **画面に出す値ごとに、どこから得るか（API 応答・`packages/data` が生成する JSON・ソルバーの出力）を、既存の契約と実コードで確かめる。** API の応答から得る値で、既存の応答に無いもの（例: 名称を ID しか返さない応答）は、契約差分に応答の変更として書く。ゲート A-2 の前に確かめる（計画の段階で気づくと、契約差分の追記が要る）。
4. 共有構成ファイル（依存追加・設定変更）や担当フォルダをまたぐ修正の予定を洗い出して列挙する（最終確定は plan.md とゲート C-1。本節はその早期の下書き）。
5. 共有部品の規範（別名ファイルで複製しない・共有部品を拡張する）は `.claude/skills/impact-scope/conventions.md`「共有部品の扱い」節（転記しない）。

### 適正条件の判定

意味判断を要する次の2条件は、この区間のメインが評価し、判断理由を添えて提示する。

- 単独でデモできる縦切り（UI〜DB までの1本になっているか。UI を持たない機能は、その機能の成果物だけで検証できるか）
- 1〜3日でマージまで到達できる見込みか

数えられる条件は `node .claude/skills/tsod-spec-check/scripts/spec-check.mjs <spec.md>` で判定し、**出力表をそのままゲート A-2 の提示に含める**（判定項目の列挙の正は `.claude/skills/tsod-spec-check/SKILL.md`。ここには書かない）。表が無ければゲート A-2 を開かない。判定と生成を混ぜない。意味判断の2条件は spec-check に渡さない。

条件を満たさないときは、分割案（機能を割る）または統合案（小さすぎる機能を隣接機能へ寄せる）を提示する。

### ゲート A-2

生成した `spec.md`・spec-check の判定表・自己評価した2条件を提示し、AskUserQuestion を1回取る。承認されたら handoff に記録してコミットする。

## メインの直接修正・コミット

- 直接修正の基準: [direct-edit.md](../tsod-workflow/references/direct-edit.md)
- コミットの単位と形式: [commit-rules.md](../tsod-workflow/references/commit-rules.md)

## 区間の終わり（次のコマンドと推奨モデル）

ゲート A-2 の承認の直後に、handoff の「現在地」を「区間の終わりの定型」のとおり書く。「未起票の教訓」を起票するか、持ち越す理由を書いてコミットする。

- 画面かテーブルの変更がある（`触る領域:` に `web` を含む、または新しい永続化がある）: 区間 B。`/tsod-screen-table NNN`（推奨モデル: Opus）。
- UI もテーブル変更も無い: handoff のゲート B-1・B-2 を `該当なし（UI・テーブル変更なし）` にして、区間 C。`/tsod-plan NNN`（推奨モデル: Opus）。

このセッションでは次の区間に進まない。次の定型の案内文を出して停止する。

「新しいセッションを開き、`/model opus` にしてから `/tsod-screen-table NNN-<slug>`（または `/tsod-plan NNN-<slug>`）を起動してください。」

ユーザーが同じセッションでの続行を求めても、区間の規律（`tsod-workflow`）を示して新しいセッションの起動を案内する。
