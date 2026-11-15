# handoff: 037-skill-effect-stats
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: E
- 次に起動するコマンド: `/tsod-ship 037-skill-effect-stats`
- 推奨モデル: Sonnet
- ブランチ: `feat/037-skill-effect-stats`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 037-skill-effect-stats` | Opus | `feat/037-skill-effect-stats` |
| A→B | B | `/tsod-screen-table 037-skill-effect-stats` | Opus | `feat/037-skill-effect-stats`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 037-skill-effect-stats` | Opus | `feat/037-skill-effect-stats`（不変） |
| B→C | C | `/tsod-plan 037-skill-effect-stats` | Opus | `feat/037-skill-effect-stats`（不変） |
| C→D | D | `/tsod-build 037-skill-effect-stats` | Sonnet | `feat/037-skill-effect-stats`（不変） |
| D→E | E | `/tsod-ship 037-skill-effect-stats` | Sonnet | `feat/037-skill-effect-stats`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/037-skill-effect-stats`・`docs/037-skill-effect-stats-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-11-15 / 9aa253e |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-11-15 / 872eea8 |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-11-15 / bb8672c |
| B-2 | テーブル設計（design/・migration） | 該当なし（テーブル変更なし） | 2026-11-15 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-11-16 / 44eea77 |
| D-1 | 実装受入 | 承認済み | 2026-11-16 / b90c60d |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: 77ee1b2
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 22975a9
- その時点の verify の要約行: <総合結果の行と Sonar 件数行>
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| data | data-agent | 0952b86 |
| data（dist 再生成） | main | ab6f920 |
| solver | solver-agent | 5d154ea |
| web | web-agent | 77008fd |
| solver（是正） | solver-agent | 5dd76d4 |
| solver（是正 2） | solver-agent | 0ce383f |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | 77ee1b2..22975a9 | 構成: master-data.md §8 の「11 種類」は 9 種類の誤記 | 要修正 | 直接修正 | 要修正 |
| 1 | 77ee1b2..22975a9 | 構成: master-data.md §6 の skill-effects が element の検査に触れていない | 要修正 | 直接修正 | 要修正 |
| 1 | 77ee1b2..22975a9 | 構成: 直接修正表が空欄（記録の不備） | 要修正 | 直接修正 | 解消 |
| 1 | 77ee1b2..22975a9 | data: AC-4 後半（会心撃の効果が空のまま）を直接検証するテストが無い | 持ち越し | 持ち越し | 要修正 |
| 1 | 77ee1b2..22975a9 | data: effects.ts の ELEMENTS/STATUSES と index.ts の EffectElement が別定義 | 持ち越し | 持ち越し | 要修正 |
| 1 | 77ee1b2..22975a9 | web: resistance_add で element 欠落時の all 分岐の未テスト・withElement の label コメント（軽微） | 持ち越し | 持ち越し | 要修正 |
| 1 | 77ee1b2..22975a9 | solver: AC-7 のテストが条件付きの効果（攻撃・会心）を activeConditionIds なしで使い、数える側が空振り | 要修正 | 是正 | 要修正 |
| 1 | 77ee1b2..22975a9 | solver: 検索テストの入力が plan D12 の 4 スキル（火属性攻撃強化・毒属性強化・防御 Lv7・火耐性 Lv3）より狭い | 要修正 | 是正 | 要修正 |
| 1 | 77ee1b2..22975a9 | solver: 検算の base が attack:0 で attack_mul・crit_mul の感度が低い（軽微） | 要判断 | ゲートで判断 | 要修正 |
| 2 | 665bc2a..5dd76d4 | solver: 前回の 3 件（条件付き効果・D12 の 4 スキル・base）は解消 | 要修正 | 是正 | 解消 |
| 2 | 665bc2a..5dd76d4 | solver: 検索テストの score not.toBe(0) は常に真で、数える効果を検証しない | 要修正 | 是正 | 要修正 |
| 2 | 665bc2a..5dd76d4 | solver: ループ 10 回の solve に対する 60 秒の余裕（packages の test:unit は全体で 29 秒のため問題なしと判断） | 要判断 | ゲートで判断 | 解消 |
| 2 | 665bc2a..5dd76d4 | solver: slotWeapon と 1 スキルずつの要求は plan D12 からの逸脱（理由: 火・毒属性の装飾品が武器の枠にしか入らず全スキル同時は解なし） | 持ち越し | 持ち越し | 要修正 |
| 3 | 5dd76d4..0ce383f | solver: 検索テストの score not.toBe(0)（常に真）は、数える効果のケースのスキル無しとの比較に替えて解消 | 要修正 | 是正 | 解消 |
| 3 | 5dd76d4..0ce383f | solver: 新しい assert は ILP の目的関数が数える 4 種を使うことの直接の証明ではない（間接的に builds の toEqual が担保） | 持ち越し | 持ち越し | 要修正 |
| 3 | 665bc2a | 構成: master-data.md §8 の「11 種類」→「stat が表す 9 種類」に直した（665bc2a） | 要修正 | 直接修正 | 解消 |
| 3 | 665bc2a | 構成: master-data.md §6 の skill-effects の検査対象に element を明記した（665bc2a） | 要修正 | 直接修正 | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | design/master-data.md | §8 の「11 種類」を「stat が表す 9 種類」に、§6 の skill-effects の検査対象に element を明記 | reviewer 所見 F1・F2（誤記と記述漏れ） |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- ユーザー承認（ゲート C-1・2026-11-16）のうえ追加した常時許可外の変更: design/master-data.md §6・§8（効果の規則と範囲）、design-system/skillweave/MASTER.md（補完の書式の表）、packages/data/dist/master-2026.11.2.{json,ja.json,en.json}（generate による再生成）、旧版 master-2026.11.1.* の削除
- メインの直接修正: design/master-data.md の 2 箇所（reviewer 所見の誤記と記述漏れ。再レビューは未実施の文言修正）
- AC-5 の旧版との比較（1 回限り）: 差分は版と対象スキル 15 件の effectsByLevel のみ。ja・en の辞書は版だけが違う
- plan D12 からの逸脱: 検索テストは 1 スキルずつの要求と Lv3 の枠 3 つを持つ武器（slotWeapon）を使う（火・毒属性の装飾品が武器の枠にしか入らず、全スキル同時の要求は解なし）

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 A で台帳に起こすべき教訓は出なかった）
- なし（区間 B で台帳に起こすべき教訓は出なかった）
- なし（区間 C で台帳に起こすべき教訓は出なかった）
- 持ち越し: 実データで火・毒属性のスキルを必須にする検索のテストは、枠を持つ武器（slotWeapon）を渡さないと解が 0 件になる（装飾品に target: weapon のものがある）。038・023 で同種のテストを書くときに台帳へ起票する。plan の「ID の昇順」は effects.yaml では文字列順（数値順でない）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 区間 B: 新しい種類の補完の文言と書式を、007 screen-design.md §4 の書式表（符号・小数第2位・発動条件の組）に揃えて決める。属性値・状態異常値の加算は表示値（マスターの値 × 10）で出す（decisions.md Q193）。画面の配置や部品は変えない
- 区間 C: マスターの版を上げると、apps/web/src/test のマスターのファイル名の直書き（pwa/precache.spec.ts・sw/handlers.spec.ts・sw/route.spec.ts・support/serviceWorker.ts）と packages/data の dist.spec.ts の版の期待値の追従が要る見込み
- 区間 C: 既存の element_add・element_mul（007 の書式「属性値 …」）を 037 の属性値の種類に置き換えるか残すかを決める。残すなら区別なしの属性値と同じ書式・表示値（× 10）の規則に揃える（screen-design.md §2）
- 区間 C: overlay の効果は説明文に出てくる順（乗算 → 加算 → 他の種類）に書く。補完は effectsByLevel の順に出すため（screen-design.md §2）

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q187・Q192・Q193（Q194 は open-questions.md に残した）
