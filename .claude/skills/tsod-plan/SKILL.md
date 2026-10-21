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

`specs/NNN-<slug>/handoff.md` を全文読み、続けて `node .claude/skills/tsod-workflow/scripts/handoff.mjs check NNN B-1 B-2` を実行する。exit 0 以外なら出力を示して停止し、`/tsod-spec NNN`（または `/tsod-screen-table NNN`）を案内する。UI もテーブル変更も無い機能は、B-1・B-2 が該当なしの記録で通る。`specs/NNN-<slug>/spec.md` が存在しなければ停止する。

handoff の更新（ゲートの記録・現在地など）は `handoff.mjs` のサブコマンドだけで行い、Edit・sed・python・node -e で書き換えない。

大きいファイル（過去機能の `plan.md`／`tasks.md` 等）の読み方は [読み込みの規律](../tsod-workflow/references/reading-discipline.md) に従う。

## plan.md（`specs/NNN-<slug>/plan.md`）

```markdown
## スタック
<使用する技術・バージョン>

## データモデル
<テーブル/エンティティの形>

## 決定事項
- D1: <実装方針の決定とその理由>
- D2: …

## 常時許可外の変更
- `apps/api/build.gradle.kts`（testImplementation に xxx を追加。担当: メイン。理由: …）
```

- 「決定事項」の各項目には、`D1`・`D2`… の番号を振る（連番。後から入れ替えても、既に参照された番号は変えない）。区間 D の委譲プロンプトの「読む範囲」（plan.md の決定事項の番号）と、ゲート C-1 の提示の番号の一覧が、この番号を参照する。

- 「データモデル」節は、区間 B で確定した内容を要約として転記するだけにする。DB の命名・型・監査カラムの規約は `design/data-model-standard.md` の「命名規則」表等の該当節が正。新規・変更したテーブル／カラムの属性は、区間 B で data-model-agent が `design/attributes.yaml` に書き出し済み（`defined_by: specs/NNN-<slug>` 付き）。この区間では `attributes.yaml` を書かない。テーブル変更の無い機能は、`なし` と書く。
- 「スタック」節の版は、`design/tech-stack.md` が正。版を新たに決めるときは、同文書の「更新の方針」節を確かめる。
- 「常時許可外の変更」は、該当が無ければ `- なし`。書くのは、ワーカーの常設の書込フォルダの外にある変更（共有構成ファイル・担当フォルダをまたぐ定型修正の予定）で、1行1パス。**ゲート C-1 で承認された行だけ**を、区間 D でメインが委譲の前に書く。
- 後続の成果に依存して、委譲の前には書けない変更がある（例: 測定ハーネスができてから書く測定結果の記録、テストができてから外す設定）。この変更は、plan.md の「決定事項」に、書く時期（どのタスクの後か）を明記する。tasks.md では、その時期の位置に `[main]` のタスクとして置く。委譲の前に書く原則は、これ以外の行に変わらない。

plan.md を書いたらコミットする。

## tasks.md（`specs/NNN-<slug>/tasks.md`）

各タスクに、次を書く。

- **担当領域を1つだけ**: `tsod-build/SKILL.md` の領域表の語（契約／api／web／solver／data／E2E。api・web・solver・data は実装とそのテストを1つの領域として扱う）。区間 D が領域ごとにワーカーへ委譲するため、1タスクが複数領域にまたがらないようにする。
- **受入基準の番号の引用**: `refs spec §受入基準 N` の形式。契約変更や新規テーブルは `refs spec §契約差分` を引用してよい。
- 常時許可外の変更（メインが書く共有構成ファイルの変更）は、`[main]` のタスクにする。

```markdown
- [ ] T1 [contract-agent]        <契約の追加>            refs spec §契約差分
- [ ] T2 [api-agent]             <API 実装とテスト>      refs spec §受入基準 1, 2, 3, 4
- [ ] T3 [web-agent]             <画面実装と単体テスト>  refs spec §受入基準 5
- [ ] T4 [solver-agent]          <ソルバーの実装とテスト> refs spec §受入基準 6
- [ ] T5 [data-agent]            <マスターデータの生成とテスト> refs spec §受入基準 7
- [ ] T6 [e2e-agent]             <E2E>                   refs spec §受入基準 5
```

- 領域のタグは、委譲先のワーカー名（`contract-agent`・`api-agent`・`web-agent`・`solver-agent`・`data-agent`・`e2e-agent`）で書く。上の例は書式の見本で、機能が触らない領域のタスクは作らない。マイグレーションは区間 B で書き出し済みのためタスクにしない。必要なら区間 B へ戻る。
- **ルーティング付きの共有コンポーネント（`AppHeader` 等）に項目を足すタスクは、既存 spec のテスト用ルーターへの追従を、web のタスクに明記する。** 書かれていないと、足した項目のルートが無いテスト用ルーターで既存のテストが落ち、web の検証が FAIL のまま残るため。
- 並列にしてよいタスクの条件は `.claude/skills/tsod-build/SKILL.md`「委譲」節が正（ここには転記しない）。

tasks.md を書いたらコミットする（plan.md とは別のコミット。[commit-rules.md](../tsod-workflow/references/commit-rules.md)）。

## ゲート C-1

提示の前に、次を実行して出力を加工せずそのまま含める。

```
node .claude/skills/tsod-spec-check/scripts/spec-check.mjs specs/NNN-<slug>/spec.md --compare-plan specs/NNN-<slug>/plan.md
```

plan にだけ現れる常時許可外の変更と、spec にだけ現れる変更予定を明示してから、`plan.md`・`tasks.md` を提示し、AskUserQuestion を1回取る。提示では `plan.md`・`tasks.md` の本文を貼らず、パスと、決定事項の番号・タスクの ID の一覧で示す（spec-check の出力は上のとおりそのまま含める）。承認されたら、成果物をコミットし、承認時点の HEAD の短縮ハッシュで `handoff.mjs gate NNN C-1 <短縮ハッシュ>` を実行して、handoff の変更をコミットする。

## メインの直接修正

[direct-edit.md](../tsod-workflow/references/direct-edit.md) に従う。

## 区間の終わり（次のコマンドと推奨モデル）

ゲート C-1 の承認の直後に、handoff の「現在地」を `handoff.mjs transition NNN C→D` で書く。「未起票の教訓」を起票するか、持ち越す理由を書いてコミットする。

このセッションでは区間 D に進まない。次の定型の案内文を出して停止する。

「新しいセッションを開き、`/model sonnet` にしてから `/tsod-build NNN-<slug>` を起動してください。」
