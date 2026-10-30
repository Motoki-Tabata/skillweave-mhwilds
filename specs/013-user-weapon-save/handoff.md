# handoff: 013-user-weapon-save
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 013-user-weapon-save`
- 推奨モデル: Sonnet
- ブランチ: `feat/013-user-weapon-save`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 013-user-weapon-save` | Opus | `feat/013-user-weapon-save` |
| A→B | B | `/tsod-screen-table 013-user-weapon-save` | Opus | `feat/013-user-weapon-save`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 013-user-weapon-save` | Opus | `feat/013-user-weapon-save`（不変） |
| B→C | C | `/tsod-plan 013-user-weapon-save` | Opus | `feat/013-user-weapon-save`（不変） |
| C→D | D | `/tsod-build 013-user-weapon-save` | Sonnet | `feat/013-user-weapon-save`（不変） |
| D→E | E | `/tsod-ship 013-user-weapon-save` | Sonnet | `feat/013-user-weapon-save`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/013-user-weapon-save`・`docs/013-user-weapon-save-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-30 / a4319c0 |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-30 / 15d87b5 |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-10-30 / 013c915 |
| B-2 | テーブル設計（design/・migration） | 承認済み | 2026-10-30 / 098f35c |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-30 / 576c592 |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: addaf09
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: d395786
- その時点の verify の要約行: 総合結果: PASS（Sonar は最終検証で実行）
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| 契約 | contract-agent | 494d90a |
| api | api-agent | 15648a5 |
| web (T3) | web-agent | 1995f4a |
| web (T4) | web-agent | 126c003 |
| E2E | e2e-agent | d395786 |
| api (是正) | api-agent | a5b4d6b |
| api (是正2: 作成の catch) | api-agent | cfed9c0 |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | addaf09..d395786 | api: plan D6(2) の逸脱（ElementDeserializer）は妥当。plan の記述が実装と食い違う | 持ち越し | 持ち越し | 解消 |
| 1 | addaf09..d395786 | api: 木経由の冗長コード・Charm/Weapon/Build の層の重複・衝突テストが version を見ない（軽微） | 持ち越し | 持ち越し | 解消 |
| 1 | addaf09..d395786 | web: Sonar と e2e の実行結果が要約に無い（最終検証で実行） | 要判断 | ゲートで判断 | 解消 |
| 1 | addaf09..d395786 | web: e2e の openWeapons 等が user-weapon.spec と重複（3本目で support へ切り出し） | 起票 | 起票 | 解消 |
| 1 | addaf09..d395786 | web: 削除時の端末件数不変・409/404 後の入力破棄・登録モード 401 の入力保持が未検証、e2e の選択確認が弱い（軽微） | 持ち越し | 持ち越し | 解消 |
| 1 | addaf09..d395786 | 契約・その他: 所見なし（T1 コミットの refs は付与済み） | 持ち越し | 持ち越し | 解消 |
| 2 | d395786 時点の最終検証 | api: BuildControllerTest の rejectedWeaponCopyIsNotSaved が invalidPayloadIsRejectedWithBadRequest と同一実装で Sonar java:S4144 が1件 | 要修正 | 是正 | 要修正 |
| 3 | d395786..a5b4d6b | api: S4144 の重複テストを統合。再レビューで要修正なし、最終検証は Sonar 0件・Quality Gate OK | 要修正 | 是正 | 解消 |
| 4 | 2affbf8..cfed9c0 | api: WeaponService#create の catch が DataIntegrityViolationException を無条件に 409 にする（PR #66 と同じ形へ。main の 30b8664 を eb80101 で取り込み済み）。主キー違反以外は 409 にならない WeaponServiceTest を追加し、教訓台帳の該当項目を削除 | 要修正 | 是正 | 是正済み |
| 5 | 2affbf8..cfed9c0 | 再検証: build・contractTest・web・packages・e2e は全段 PASS。Sonar は issue 6 件（すべて java:S5778。main に取り込んだ PR #66 の BuildServiceTest 75/86/95 行・CharmServiceTest 67/78/85 行で、013 の差分ではない。WeaponServiceTest は 0 件）。013 のブランチでは直さず main 側で扱う | 持ち越し | 持ち越し | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
- なし
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- 区間 A では教訓の候補なし
- 区間 B では教訓の候補なし
- 区間 C では教訓を1件起票した（tasks/lessons.md の 2026-10-30「作成の catch が DataIntegrityViolationException をすべて 409 にする」）
- 区間 D の候補: (1) Jackson 3 の record で省略可・明示 null 不可は @JsonSetter(nulls=FAIL) では省略まで拒否される。getNullValue で拒否し getAbsentValue で null を返す deserializer が要る（plan D6(2) からの逸脱）。(2) 武器系 e2e spec が 3 本目になる機能で e2e/support/weapons.ts に切り出す（レビュー web 3）。(3) 契約の enum と web の string が合わず、API の要求型で payload を web の型に差し替えた。

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q72・Q98・Q99・Q100
- plan D6(2) の記述（@JsonSetter(nulls = Nulls.FAIL)）は実装（ElementDeserializer: getNullValue で拒否・getAbsentValue で null）と食い違う。区間 E のドリフト是正で plan.md を直す。
- main(30b8664)の取り込み後、Sonar の全体解析は PR #66 のテスト(BuildServiceTest・CharmServiceTest)の java:S5778 6件で FAIL（013 起因ではない）。ゲート D-1 の提示時に人間が扱いを決める。
