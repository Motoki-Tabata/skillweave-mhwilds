# handoff: 005-charm-input
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 005-charm-input`
- 推奨モデル: Sonnet
- ブランチ: `feat/005-charm-input`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 005-charm-input` | Opus | `feat/005-charm-input` |
| A→B | B | `/tsod-screen-table 005-charm-input` | Opus | `feat/005-charm-input`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 005-charm-input` | Opus | `feat/005-charm-input`（不変） |
| B→C | C | `/tsod-plan 005-charm-input` | Opus | `feat/005-charm-input`（不変） |
| C→D | D | `/tsod-build 005-charm-input` | Sonnet | `feat/005-charm-input`（不変） |
| D→E | E | `/tsod-ship 005-charm-input` | Sonnet | `feat/005-charm-input`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/005-charm-input`・`docs/005-charm-input-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-23 / 5b44538 |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-23 / e215141 |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-10-23 / beaeacb |
| B-2 | テーブル設計（design/・migration） | 該当なし（テーブル変更なし） | 2026-10-23 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-23 / 6ee89f8 |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: b9bb9fb
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: d4f8fe1
- その時点の verify の要約行: 総合結果: PASS（api・web・packages・e2e すべて PASS。Sonar は最終検証で実行）
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| data | data-agent | 495d5da |
| data（dist 再生成。メイン） | main | 1019d08 |
| web（T6） | web-agent | 157c9ed |
| web（T7。Sonar 2 件は抑止の承認待ち） | web-agent | 44a5c29 |
| web（T8） | web-agent | ce1c68b |
| E2E | e2e-agent | 6ce5ff6 |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | b9bb9fb..d4f8fe1 | web: レア度5のラベルが radio に結び付かない（CharmForm.vue。id が charm-rarity-first） | 要修正 | 是正 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: スキル入力欄が md:text-sm なし・shadow-xs 残り（CharmSkillRow.vue。MASTER 違反） | 要修正 | 是正 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: 削除確認の見出しが text-lg（CharmDeleteDialog.vue。Type Scale 外） | 要修正 | 是正 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: テストの受入基準 ID コメントが多数ずれている／e2e の名乗りも不正確 | 要修正 | 是正 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: 受入基準 11 の「護石なしでも検索できる」を検索の実行で確かめるテストが無い | 要修正 | 是正 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: 護石の読込中に検索すると護石が黙って落ちる（stores/search.ts） | 要判断 | ゲートで判断 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: e2e の pickSkillByReading が .last() に頼る（候補一覧が DOM に残る） | 要判断 | ゲートで判断 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: CharmMatchResult の警告帯が ResultAlert を使わず自前（MASTER 混色 18% と実装 15% のずれ） | 要判断 | ゲートで判断 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: ui/ 生成物（alert-dialog 等）と MASTER の乖離（オーバーレイ・影・角丸） | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: font-semibold（600）が MASTER のウェイト外 | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: conventions.md に src/test/support/ の記述が無い | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: 300ms のスケルトン遅延タイマーが3箇所に複製 | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: lib/charms/eligible.ts に対応する eligible.spec.ts が無い | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | web: CharmCard の補助文が狭い／aria-describedby がエラー要素なしでも付く | 持ち越し | 持ち越し | 解消 |
| 1 | b9bb9fb..d4f8fe1 | data: dist.spec・generate.spec の describe 見出しに 002 と 005 の番号が混在 | 持ち越し | 持ち越し | 解消 |
| 1 | b9bb9fb..d4f8fe1 | data: fixtures.ts の READINGS_YAML と READINGS が二重（溜打強化の読みも要確認） | 持ち越し | 持ち越し | 解消 |
| 1 | b9bb9fb..d4f8fe1 | 構成: sonar 抑止 e4・e5 を計画の常時許可外に事前に挙げる運用を lessons に起票 | 起票 | 起票 | 要修正 |
| 1 | b9bb9fb..d4f8fe1 | 構成: 抑止がファイル単位／MASTER.md の role=status と output の書き分け／tech-stack.md の旧版記述 | 持ち越し | 持ち越し | 解消 |
| 2 | d4f8fe1..ff2aa4d | web: レア度5のラベルが radio に結び付かない | 要修正 | 是正 | 解消 |
| 2 | d4f8fe1..ff2aa4d | web: スキル入力欄が md:text-sm なし・shadow-xs 残り | 要修正 | 是正 | 解消 |
| 2 | d4f8fe1..ff2aa4d | web: 削除確認の見出しが text-lg | 要修正 | 是正 | 解消 |
| 2 | d4f8fe1..ff2aa4d | web: テストの受入基準 ID コメントのずれ（e2e の2行は直接修正） | 要修正 | 是正・直接修正 | 解消 |
| 2 | d4f8fe1..ff2aa4d | web: 受入基準 11 の護石なし検索のテストが無い | 要修正 | 是正 | 解消 |
| 3 | fd9eb8c..8386c53 | web: 護石の読込中に検索すると護石が黙って落ちる（ユーザー決定: 読込の完了を待って送る） | 要判断 | 是正 | 是正済み |
| 3 | fd9eb8c..8386c53 | web: e2e の .last() 依存（ユーザー決定: テスト側の回避のまま許容） | 要判断 | 持ち越し | 解消 |
| 3 | fd9eb8c..8386c53 | web: 警告帯が ResultAlert を使わず自前（ユーザー決定: 現状を許容） | 要判断 | 持ち越し | 解消 |
| 4 | fd9eb8c..8386c53 | web: 読込待ちの後に条件（必須スキル・目的・件数・ランク）を読むため、待ち中の編集で食い違った要求が送られる（stores/search.ts） | 要修正 | 是正 | 要修正 |
| 4 | fd9eb8c..8386c53 | web: 速い経路が進行中の待ちを無効にしない（二重送信・cancel が Worker を止めない余地） | 要修正 | 是正 | 要修正 |
| 4 | fd9eb8c..8386c53 | web: キャンセルのテストに受入基準 8 のコメントが無い | 要修正 | 是正 | 要修正 |
| 4 | fd9eb8c..8386c53 | web: 待ち中の再 submit・待ち経路の failed／unavailable・待ち中の条件変更のテストが無い | 持ち越し | 是正 | 要修正 |
| 5 | 8386c53..a220092 | web: 読込待ちの後に条件を読む（送信時の写しに変更） | 要修正 | 是正 | 解消 |
| 5 | 8386c53..a220092 | web: 速い経路が進行中の待ちを無効にしない（無条件で無効化） | 要修正 | 是正 | 解消 |
| 5 | 8386c53..a220092 | web: キャンセルのテストに受入基準 8 のコメントが無い | 要修正 | 是正 | 解消 |
| 5 | 8386c53..a220092 | web: 待ち中の再 submit・failed／unavailable・条件変更のテスト | 要修正 | 是正 | 解消 |
| 5 | 8386c53..a220092 | web: 待ち経路が進行中の前の solve を止めない（護石画面の reload 後に検索へ戻った場合のみ。変更前から同じ。キャンセル時のトースト仕様は未決） | 持ち越し | 持ち越し | 解消 |
| 5 | 8386c53..a220092 | web: 待ち中は前の検索の summary が残る（進捗バーの見た目に害なし） | 持ち越し | 持ち越し | 解消 |
| 5 | 8386c53..a220092 | web: 条件変更テストの判別力が一部弱い（toContain(a1)・requiredCount・武器とランクの変更が未検証） | 持ち越し | 持ち越し | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | apps/web/e2e/charm-input.spec.ts | e2e の2本のテスト名の受入基準 ID を直した（15 の流れと 15（5）） | 是正した web-agent は e2e を書けず、ID の提案も誤っていたため（テスト名の文字列のみ） |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- T2: shadcn-vue@2.8.2 の CLI は、tsconfig.json に paths を一時的に足さないと失敗し、依存に cn を足して import も "cn" にした。依存の変更は戻し、import は既存の部品と同じ '@/lib/utils' に直した（apps/web/src/main/components/ui/combobox・alert-dialog）。既存の button の上書きを避けるため button を退避して復元した
- T4: オーナーが読みの下書きを承認し、抽選テーブルは入れない（appraisedCharm は空）と決めた。T5: packages/data/dist を 2026.10.3 に再生成し旧版 3 ファイルを削除した。design/tech-stack.md に旧版 2026.10.2 の記述が残る（区間 E のドリフト走査で確認）
- T7: ユーザー承認のうえ sonar-project.properties に multicriteria e4（CharmSkillRow.vue）・e5（CharmForm.vue）を追記した。Reka UI の SelectTrigger への Web:InputWithoutLabelCheck の誤検知で、既存の e3 と同じ扱い（計画の常時許可外の変更に無かった追加。区間 D で承認）

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 A で起票すべき教訓は出なかった）
- 区間 C: plan の常時許可外の行のバッククォートの教訓を tasks/lessons.md に起票済み（ほかの候補なし）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 区間 C: IndexedDB の単体テストの方法を決める。jsdom には IndexedDB が無い。fake-indexeddb の追加は依存の追加で spec の常時許可外に無いため、保存層を差し替えられる形にして実際の IndexedDB は e2e で確かめる案を優先する
- 区間 C: 護石の候補が多いとき（数十件）の検索時間を 3 秒の基準（004 decisions.md Q20）に照らして見積もる
- 区間 B: IndexedDB に保存する護石の形（010 charm-save のサーバー側と同じ。design/data-model-standard.md「所有者と監査カラム」）と、Q28 で PC 向けのブレークポイントを見直さないまま護石の画面を置くこと

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q3・Q26・Q29・Q30・Q32・Q33（新規の未確定事項 Q31 を open-questions.md に追加、Q28 は仮置きを修正して残置）
- 区間 B の画面設計でスキルの読み検索を 005 に加え（Q34）、薄仕様を改訂して A-2 を e215141 で取り直した
- 要確認事項の区間 C の2件は plan D9（IndexedDB の単体テストは保存層の差し替え・実物は e2e）と D23（護石 80 件でも Node で 0.37 秒以下）で解消した。区間 B の件は screen-design.md 0・4 で解消済み
