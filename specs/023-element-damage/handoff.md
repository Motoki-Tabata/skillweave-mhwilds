# handoff: 023-element-damage
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 023-element-damage`
- 推奨モデル: Sonnet
- ブランチ: `feat/023-element-damage`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 023-element-damage` | Opus | `feat/023-element-damage` |
| A→B | B | `/tsod-screen-table 023-element-damage` | Opus | `feat/023-element-damage`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 023-element-damage` | Opus | `feat/023-element-damage`（不変） |
| B→C | C | `/tsod-plan 023-element-damage` | Opus | `feat/023-element-damage`（不変） |
| C→D | D | `/tsod-build 023-element-damage` | Sonnet | `feat/023-element-damage`（不変） |
| D→E | E | `/tsod-ship 023-element-damage` | Sonnet | `feat/023-element-damage`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/023-element-damage`・`docs/023-element-damage-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-11-19 / 92c6182 |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-11-19 / 5d7c329 |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-11-19 / da7d812 |
| B-2 | テーブル設計（design/・migration） | 該当なし（テーブル変更なし） | 2026-11-19 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-11-19 / 7c397f4 |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: 959d587
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: eee270c の前 6ccfc20..bcfc7a8
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 6ccfc20
- その時点の verify の要約行: 総合結果: PASS（Sonar は最終検証で実行）
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| solver | solver-agent | dcfbd82 |
| web | web-agent | f51db4e |
| E2E | e2e-agent | 8e0828c |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | 959d587..6ccfc20 その他 | tech-stack.md の k=6 解なし（オン）が found なのに説明から漏れている | 要修正 | 直接修正 | 解消 |
| 1 | 959d587..6ccfc20 その他 | master-data.md §9 に Q205 の理由が無い・見出しの範囲が曖昧 | 要修正 | 直接修正 | 解消 |
| 1 | 959d587..6ccfc20 solver | solveBuilds.element.spec.ts の ECRIT が element 付きの element_crit_mul（master-data §6 に反する形） | 要修正 | 是正 | 要修正 |
| 1 | 959d587..6ccfc20 solver | levelEffects が affinity_add にも elementMatches をかけ evaluateDamage と不一致（実データでは差なし） | 要判断 | ゲートで判断 | 要修正 |
| 1 | 959d587..6ccfc20 solver | コメントの陳腐化・elementExpected の 0 返し・buildModel のフォールバック・minus 列の余り | 持ち越し | 持ち越し | 要修正 |
| 1 | 959d587..6ccfc20 web | 無効の選択肢でラベルが無効の見た目にならない（ConditionsCard.vue） | 要修正 | 是正 | 要修正 |
| 1 | 959d587..6ccfc20 web | e2e の期待値が ?? '' で欠落を隠す（element-damage.spec.ts） | 要修正 | 是正 | 要修正 |
| 1 | 959d587..6ccfc20 web | 個体差のある武器の AC-9 判定のテストが無い（conditions.spec.ts） | 要修正 | 是正 | 要修正 |
| 1 | 959d587..6ccfc20 web | 測定ハーネスの合否が NaN（解なし・打ち切り）を最大から除く。記録の36回に timeout は無い | 要判断 | ゲートで判断 | 要修正 |
| 1 | 959d587..6ccfc20 web | 未知の属性種類の理由の文言・BuildCard 見出し行の複製・reselectWeapon の再実装 | 持ち越し | 持ち越し | 要修正 |
| 2 | 6ccfc20..bcfc7a8 是正 | ECRIT の element を外した（solver） | 要修正 | 是正 | 是正済み |
| 2 | 6ccfc20..bcfc7a8 是正 | 無効のラベルの見た目・custom の AC-9 テスト（web） | 要修正 | 是正 | 是正済み |
| 2 | 6ccfc20..bcfc7a8 是正 | e2e の ?? '' を throw に（E2E） | 要修正 | 是正 | 是正済み |
| 2 | 6ccfc20..bcfc7a8 再レビュー | 是正の要修正5件は解消 | 要修正 | 是正 | 解消 |
| 2 | 6ccfc20..bcfc7a8 再レビュー | solver spec のコメント・シナリオ名の陳腐化、ConditionsCard.spec のテスト名が広い | 要修正 | 直接修正 | 解消 |
| 3 | 959d587..6ccfc20 solver | levelEffects が affinity_add にも elementMatches をかけ evaluateDamage と不一致 | 要判断 | 是正 | 要修正 |
| 3 | 959d587..6ccfc20 web | 測定ハーネスの合否が NaN（解なし・打ち切り）を最大から除く | 要判断 | 是正 | 要修正 |
| 3 | bcfc7a8..1329b4f 再レビュー | levelEffects の affinity_add の絞り込みを外した（回帰テスト付き） | 要判断 | 是正 | 解消 |
| 3 | bcfc7a8..1329b4f 再レビュー | 測定ハーネスが打ち切り・1件目の欠落を FAIL にする。全 infeasible は N/A（許容） | 要判断 | 是正 | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | design/tech-stack.md | 測定の節の「オンの k=3・k=10」を k=6 も含めて直す | レビュー所見1（表と説明の食い違い） |
| D | design/master-data.md | §9 に Q205 の理由を足し、見出しの「023 で決定」の範囲を明記する | レビュー所見2（Q205 の理由の欠落・誤読の防止） |
| D | packages/solver/src/test/solveBuilds.element.spec.ts・apps/web/src/test/components/search/ConditionsCard.spec.ts | 是正で古くなったコメント・シナリオ名・テスト名の文言だけを直す | 再レビューの要修正（軽微）2件 |
| D | design/tech-stack.md | 測定の節に状態の内訳（found 27・infeasible 9・timeout 0）と、ハーネス修正後の再測定の結果を足す | 要判断2の是正（記録で取りこぼしを確認できるようにする） |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 A の A-1 までで、台帳に書く教訓は出ていない）
- なし（区間 A の再開でも、台帳に書く教訓は出ていない）
- なし（区間 B では、台帳に書く教訓は出ていない）
- なし（区間 C では、台帳に書く教訓は出ていない。Q205 と spec.md の §9 を書く時期の食い違いは、後に承認された spec.md に従うことを plan D17 に記録し、ゲート C-1 で承認済み）
- 区間 D: 総当たりテストの教訓は tasks/lessons.md に起票した。e2e-agent の候補（武器の選び直しの reselectWeapon を support/search.ts に寄せる）は、2 箇所目の使用が出たときに寄せるので持ち越す（レビューの持ち越し 7 と同じ）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 区間 B で決める: 属性の最大化を選んだ後に、武器を 5 属性でないものへ変えたときの目的の扱い（spec AC-9）。火力の節の属性の行と上限の注記の配置（AC-5・AC-6）

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q40（open-questions.md から移設）・Q182・Q183・Q184（区間 A で判明した新規の決定）
- 保留中: 説明文に数値が無いスキルの値を Web から集めて設定する機能（Q182）を先に行う。/tsod-discover で機能マップに追加し、その機能がマスターに入ってから、/tsod-spec 023 でゲート A-2（spec.md）から再開する。再開時は Q182 の調査結果（説明文の属性値の単位・会心撃【属性】が無いときの属性の会心倍率・負会心が属性に効くか・会心撃【特殊】の倍率）で Q40・Q184 の前提を確かめる
- A-1 の取り直し（2026-11-19・再開時）: 移設先なし。Q184 を確定し、Q205・Q206・Q207 を新たに決めた（open-questions.md は次の番号だけを更新）
- 区間 B の要確認事項（AC-9 の扱い・火力の節の配置）は screen-design.md §2.2・§3 で決めた。MASTER.md の「火力の表示」の変更は spec.md の常時許可外に追加済み（書く時期は plan で決める）
