---
name: tsod-plan
description: 区間 C。承認済みの薄仕様と画面・テーブル設計から plan.md（スタック・データモデル・決定事項・常時許可外の変更）と tasks.md（受入基準を引用し、担当領域を1つずつ付けたタスク分解）を specs/NNN-<slug>/ へ作り、ゲート C-1 で止めて、承認後に停止して /tsod-build を案内する区間コマンド。ユーザーが「/tsod-plan NNN」と打ったときだけ起動する。
disable-model-invocation: true
argument-hint: "<NNN または NNN-slug>"
effort: high
---

# 区間 C: 計画とタスク分解

共通動作は `.claude/skills/tsod-workflow/SKILL.md`「区間コマンドの共通動作」に従う。推奨モデルは Opus（タスク分解の判断が、区間 D の委譲の単位を決めるため）。

## 開始条件

`specs/NNN-<slug>/handoff.md` を全文読み、ゲート B-1・B-2 が承認済み（または「該当なし」の記録）であることを確かめる。UI もテーブル変更も無い機能は、ゲート A-2 の承認だけでよい。満たさなければ停止して `/tsod-spec NNN`（または `/tsod-screen-table NNN`）を案内する。`specs/NNN-<slug>/spec.md` が存在しなければ停止する。

大きいファイル（過去機能の `plan.md`／`tasks.md` 等）の読み方は [読み込みの規律](../tsod-workflow/references/reading-discipline.md) に従う。

## plan.md（`specs/NNN-<slug>/plan.md`）

```markdown
## スタック
<使用する技術・バージョン>

## データモデル
<テーブル/エンティティの形>

## 決定事項
- <実装方針の決定とその理由>

## 常時許可外の変更
- `apps/api/build.gradle.kts`（testImplementation に xxx を追加。担当: メイン。理由: …）
```

- 「データモデル」節は、区間 B で確定した内容を要約として転記するだけにする。DB の命名・型・監査カラムの規約は `design/data-model-standard.md` の「命名規則」表等の該当節が正。新規・変更したテーブル／カラムの属性は、区間 B で data-model-agent が `design/attributes.yaml` に書き出し済み（`defined_by: specs/NNN-<slug>` 付き）。この区間では `attributes.yaml` を書かない。テーブル変更の無い機能は、`なし` と書く。
- 「スタック」節の版は、`design/tech-stack.md` が正。版を新たに決めるときは、同文書の「更新の方針」節を確かめる。
- 「常時許可外の変更」は、該当が無ければ `- なし`。書くのは、ワーカーの常設の書込フォルダの外にある変更（共有構成ファイル・担当フォルダをまたぐ定型修正の予定）で、1行1パス。**ゲート C-1 で承認された行だけ**を、区間 D でメインが委譲の前に書く。

plan.md を書いたらコミットする。

## tasks.md（`specs/NNN-<slug>/tasks.md`）

各タスクに、次を書く。

- **担当領域を1つだけ**: `tsod-build/SKILL.md` の領域表の語（契約／api 実装／web 実装／solver 実装／data 実装／api テスト／web 単体テスト／solver テスト／data テスト／E2E）。区間 D が領域ごとにワーカーへ委譲するため、1タスクが複数領域にまたがらないようにする。
- **受入基準の番号の引用**: `refs spec §受入基準 N` の形式。契約変更や新規テーブルは `refs spec §契約差分` を引用してよい。
- 常時許可外の変更（メインが書く共有構成ファイルの変更）は、`[main]` のタスクにする。

```markdown
- [ ] T1 [contract-agent]        <契約の追加>            refs spec §契約差分
- [ ] T2 [api-agent]             <API 実装>              refs spec §受入基準 1, 4
- [ ] T3 [web-agent]             <画面実装>              refs spec §受入基準 5
- [ ] T4 [solver-agent]          <ソルバーの実装>        refs spec §受入基準 6
- [ ] T5 [data-agent]            <マスターデータの生成>  refs spec §受入基準 7
- [ ] T6 [api-test-agent]        <api のテスト>          refs spec §受入基準 1, 2, 3
- [ ] T7 [web-test-agent]        <web の単体テスト>      refs spec §受入基準 5
- [ ] T8 [solver-test-agent]     <solver のテスト>       refs spec §受入基準 6
- [ ] T9 [data-test-agent]       <data のテスト>         refs spec §受入基準 7
- [ ] T10 [e2e-agent]            <E2E>                   refs spec §受入基準 5
```

- 領域のタグは、委譲先のワーカー名（`contract-agent`・`api-agent`・`web-agent`・`solver-agent`・`data-agent`・`api-test-agent`・`web-test-agent`・`solver-test-agent`・`data-test-agent`・`e2e-agent`）で書く。上の例は書式の見本で、機能が触らない領域のタスクは作らない。マイグレーションは区間 B で書き出し済みのためタスクにしない。必要なら区間 B へ戻る。
- **ルーティング付きの共有コンポーネント（`AppHeader` 等）に項目を足すタスクは、既存 spec のテスト用ルーターへの追従を、web 単体テストのタスクに明記する。** 書かれていないと、足した項目のルートが無いテスト用ルーターで既存のテストが落ち、web の検証が FAIL のまま残るため。
- 並列にしてよいタスクの条件は `.claude/skills/tsod-build/SKILL.md`「委譲」節が正（ここには転記しない）。

tasks.md を書いたらコミットする（plan.md とは別のコミット。[commit-rules.md](../tsod-workflow/references/commit-rules.md)）。

## ゲート C-1

提示の前に、次を実行して出力を加工せずそのまま含める。

```
node .claude/skills/tsod-spec-check/scripts/spec-check.mjs specs/NNN-<slug>/spec.md --compare-plan specs/NNN-<slug>/plan.md
```

plan にだけ現れる常時許可外の変更と、spec にだけ現れる変更予定を明示してから、`plan.md`・`tasks.md` を提示し、AskUserQuestion を1回取る。承認されたら handoff に記録してコミットする。

## メインの直接修正

[direct-edit.md](../tsod-workflow/references/direct-edit.md) に従う。

## 区間の終わり（次のコマンドと推奨モデル）

ゲート C-1 の承認の直後に、handoff の「現在地」を、「区間の終わりの定型」の C→D の行のとおり書く。「未起票の教訓」を起票するか、持ち越す理由を書いてコミットする。

このセッションでは区間 D に進まない。次の定型の案内文を出して停止する。

「新しいセッションを開き、`/model sonnet` にしてから `/tsod-build NNN-<slug>` を起動してください。（レビューだけは Opus の reviewer-agent が行います）」
