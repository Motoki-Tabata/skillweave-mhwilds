# handoff: 006-damage-model
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: 完了
- 次に起動するコマンド: なし
- 推奨モデル: なし
- ブランチ: なし（`feat/006-damage-model`・`docs/006-damage-model-drift` ともマージ・削除済み）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 006-damage-model` | Opus | `feat/006-damage-model` |
| A→B | B | `/tsod-screen-table 006-damage-model` | Opus | `feat/006-damage-model`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 006-damage-model` | Opus | `feat/006-damage-model`（不変） |
| B→C | C | `/tsod-plan 006-damage-model` | Opus | `feat/006-damage-model`（不変） |
| C→D | D | `/tsod-build 006-damage-model` | Sonnet | `feat/006-damage-model`（不変） |
| D→E | E | `/tsod-ship 006-damage-model` | Sonnet | `feat/006-damage-model`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/006-damage-model`・`docs/006-damage-model-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-24 / 32be339 |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-24 / 7dd69cc |
| B-1 | 画面設計 screen-design.md | 該当なし（UI・テーブル変更なし（web はテスト用フィクスチャの追従のみ。ユーザー承認）） | 2026-10-24 |
| B-2 | テーブル設計（design/・migration） | 該当なし（UI・テーブル変更なし） | 2026-10-24 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-24 / 4280c0a |
| D-1 | 実装受入 | 承認済み | 2026-10-24 / 337f000 |
| E-1 | マージ（PR・CI 緑） | 承認済み | 2026-10-24 / PR #32 |
| E-2 | ドリフト是正と drift PR のマージ | 承認済み | 2026-10-24 / drift PR #33 |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: b15dcfb
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: c6926b2
- その時点の verify の要約行: <総合結果の行と Sonar 件数行>
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| data | data-agent | 8853ff1 |
| web | web-agent | 46a4c11 |
| solver | solver-agent | adea9d0 |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | b15dcfb..c6926b2 | [その他・web] 要修正なし。未測定の範囲（護石あり・所持数制限・件数30・Worker 上）は Q41 の対策と合わせて扱う | 持ち越し | 持ち越し | 解消 |
| 1 | b15dcfb..c6926b2 | [その他・web] expectedDamage の検索時間が基準超過（Q41）。対策と Q36（厳密な最大）との整合を決める | 要判断 | ゲートで判断 | 要修正 |
| 1 | b15dcfb..c6926b2 | [data] 条件 ID の命名が規則の読みでゆれる（cd:foray 等はスキル名、cd:weak_point 等はきっかけ）。機能への影響なし。master-data.md の規則に一文足すか決める | 要判断 | ゲートで判断 | 要修正 |
| 1 | b15dcfb..c6926b2 | [data] conditionId・conditions の要素が不正な型のときのテストが無い（実装はある） | 持ち越し | 持ち越し | 解消 |
| 1 | b15dcfb..c6926b2 | [data] 効果の数値は機械的に説明文と全件一致。説明文そのものの最終確認はオーナー（D10） | 持ち越し | 持ち越し | 解消 |
| 1 | b15dcfb..c6926b2 | [solver] 総当たりが attack_mul 2個以上・crit_mul 2個以上・武器の setBonusIds の枝を照合していない | 要修正 | 是正 | 要修正 |
| 1 | b15dcfb..c6926b2 | [solver] solveBuilds.damage.spec.ts 末尾の不要な export type ConditionId と import、real.spec の describe の AC 番号の誤り（AC12→AC11） | 要修正 | 是正 | 要修正 |
| 1 | b15dcfb..c6926b2 | [solver] 実データのテストが既定の timeoutMs 10 秒に依存しフレークし得る（Q41 の対策待ち） | 要判断 | ゲートで判断 | 要修正 |
| 1 | b15dcfb..c6926b2 | [solver] 段2が解なしのとき例外で検索全体が失敗する。許容差と big-M で段2が誤って解なし・ε 超の下がりになり得る | 要判断 | ゲートで判断 | 要修正 |
| 1 | b15dcfb..c6926b2 | [solver] NEGATIVE_SLOPE の定数の重複・合計レベル式の重複・非整数などの素の Error・SetBonus 無しの黙った脱落 | 持ち越し | 持ち越し | 解消 |
| 2 | c6926b2..c9a75f7 | [solver] 総当たりの網羅（attack_mul 連鎖・複数 crit_mul・武器 setBonusIds）を足した。枝を壊すと落ちることを確認 | 要修正 | 是正 | 解消 |
| 2 | c6926b2..c9a75f7 | [solver] 不要な export type ConditionId と describe の AC 番号を直した | 要修正 | 是正 | 解消 |
| 3 | c9a75f7..c9cf36c | [data] 全体の Sonar で overlay.ts の認知的複雑度 17（S3776）。領域モードでは出なかった | 要修正 | 是正 | 解消 |
| D-1 | b15dcfb..337f000 | [solver] 段2が解なしのとき 1 段目の解を返す縮退を入れる（ユーザー決定）。Q41 の対策と同時に実施 | 要判断 | 起票 | 解消 |
| D-1 | b15dcfb..337f000 | [solver] 実データのテストの timeoutMs を明示する（ユーザー決定）。Q41 の対策と同時に実施 | 要判断 | 起票 | 解消 |
| D-1 | b15dcfb..337f000 | [data] 条件 ID の命名は master-data.md §4 に一文足して現状維持（ユーザー決定） | 要判断 | 直接修正 | 解消 |
| D-1 | b15dcfb..337f000 | [その他] Q41（検索時間の超過）は 006 では受け入れ、007 の前に別途対策する（ユーザー決定） | 要判断 | 起票 | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | packages/solver/src/main/damageModel.ts | toSorted を sort に直す（新しい配列リテラルなので結果は同じ） | apps/web の型検査の lib に toSorted が無く web の type-check・build・e2e の webServer が落ちたため |
| D | design/master-data.md | §4 の例 cd:challenger を実在の cd:agitator に直す | T0 で自分が書いた例が実データの ID（挑戦者の en 名は Agitator）と食い違っていたため |
| D | design/master-data.md | §4 に、スキル固有のきっかけの条件 ID はスキル名の snake_case でよいと一文足す | ゲート D-1 のレビューの要判断でユーザーが決めたため |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（触る領域の web と区間 B の条件は tasks/lessons.md に起票済み）
- なし（tasks/lessons.md に 2 件起票済み: 領域モードの Sonar・規則を当てはめた例）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q35, Q36, Q37, Q38, Q39（open-questions からの移設なし。属性は Q40 として open-questions.md に申し送り）
- 触る領域の web は apps/web/src/test/support/fixtures.ts の追従だけ（MasterBundle に発動条件の一覧が増えるため）。画面は 007 で変える
- 区間 C の最大の論点: expectedDamage の厳密な最大化の定式化（攻撃力×会心補正の積の線形化。attack_mul を持つスキルが複数あり、会心率の丸めと負会心の折れ点がある）と、期待値に効くスキルの装飾品を候補に足すこと（現状の model.ts は必須スキルの装飾品だけを候補にする）
