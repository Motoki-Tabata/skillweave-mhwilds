# handoff: 035-api-aot-cache
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 035-api-aot-cache`
- 推奨モデル: Sonnet
- ブランチ: `feat/035-api-aot-cache`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 035-api-aot-cache` | Opus | `feat/035-api-aot-cache` |
| A→B | B | `/tsod-screen-table 035-api-aot-cache` | Opus | `feat/035-api-aot-cache`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 035-api-aot-cache` | Opus | `feat/035-api-aot-cache`（不変） |
| B→C | C | `/tsod-plan 035-api-aot-cache` | Opus | `feat/035-api-aot-cache`（不変） |
| C→D | D | `/tsod-build 035-api-aot-cache` | Sonnet | `feat/035-api-aot-cache`（不変） |
| D→E | E | `/tsod-ship 035-api-aot-cache` | Sonnet | `feat/035-api-aot-cache`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/035-api-aot-cache`・`docs/035-api-aot-cache-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-11-09 / d8c949e |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-11-09 / 08b1a2f |
| B-1 | 画面設計 screen-design.md | 該当なし（UI・テーブル変更なし） | 2026-11-09 |
| B-2 | テーブル設計（design/・migration） | 該当なし（UI・テーブル変更なし） | 2026-11-09 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-11-09 / e376b1d |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: 1162c2e
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 3a44ee7
- その時点の verify の要約行: 総合結果: PASS（e2e 含む・Sonar は最終検証で実行）
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| api | api-agent | 7ec87ce |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | 1162c2e..3a44ee7 | イメージ行(L598)が通常のイメージの値のまま既定の AOT と食い違う | 要修正 | 直接修正 | 要修正 |
| 1 | 1162c2e..3a44ee7 | L601「訓練は DB に接続せず」は不正確（接続できなくても通る、が実態） | 要修正 | 直接修正 | 要修正 |
| 1 | 1162c2e..3a44ee7 | 手順 4 は grep 行が失敗しても後続の docker tag/push が走る（set -e なし）。Q157 の受容範囲か | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1162c2e..3a44ee7 | 手順 4 を書いたとおりに実行した記録が無い（判定不能）。grep 行は実ログで終了コード 0 を確認 | 要修正 | 直接修正 | 解消 |
| 1 | 1162c2e..3a44ee7 | redirect-uri は plan D2・AC-3 の列挙に無い追加。追加自体は妥当 | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1162c2e..3a44ee7 | L592 の実行日・L602 の見込みは B5（本番デプロイ・Cloud Run 測定）で更新 | 持ち越し | 持ち越し | 要修正 |
| 1 | 1162c2e..3a44ee7 | TrainingProfileTest は環境変数 SPRING_DATASOURCE_URL 等に影響されうる（CI には無い） | 持ち越し | 持ち越し | 要修正 |
| 2 | 3a44ee7..9b3bf1b | L598 の限定と L601 の文言を直した | 要修正 | 直接修正 | 解消 |
| 2 | 3a44ee7..9b3bf1b | イメージ行(L598)が通常のイメージの値のまま既定の AOT と食い違う | 要修正 | 直接修正 | 解消 |
| 2 | 3a44ee7..9b3bf1b | L601「訓練は DB に接続せず」は不正確 | 要修正 | 直接修正 | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | design/tech-stack.md | イメージ行を通常のイメージと明記・訓練の文言を「接続できなくても」に直す | reviewer 所見（要修正・軽微）の反映 |
| D | design/tech-stack.md | 手順 4 の確認と docker tag・push を && でつなぎ、確認が失敗したら止まるようにした | ゲート D-1 の要判断（手順 4 の停止処理）でユーザーが選んだ |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- api-agent の候補: training など local・prod 以外のプロファイルを新設するときは、prod・local にしか既定が無い設定キー（今回は redirect-uri）を洗い出し、plan の列挙だけでなく実際に起動して足りないキーを確かめる。繰り返すか見てから tasks/lessons.md へ起票する（持ち越し）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q154・Q155・Q156・Q157（Q157 は区間 A の試作で判明して直接 decisions.md に記録）
- 区間 A の試作: init スクリプト（allprojects で bootBuildImage の environment.putAll）で環境は渡せたが、imageName.set は build.gradle.kts の設定が後から勝って skillweave-mhwilds-api:latest に上書きされた。AC-8 の通常のイメージを作るときは、作った直後に別名へ docker tag する
- T3: plan D2 に無い redirect-uri（spring.security.oauth2.client.registration.discord.redirect-uri）を application-training.yml に足した（空だと InMemoryClientRegistrationRepository が止まる。prod・local にしか既定が無いため）。T4 の実訓練で通ることを確かめる。plan D2・AC-3 への追記はゲート D-1 で扱う
- T4 結果（2026-11-09・1 CPU・1 GiB・prod・postgres:18.6-trixie・交互 3 回）: AC-4 訓練は最後まで通った（Training run exited with an error 0 件、AOTCache creation is complete: application.aot 140853248 bytes）。通常: health 200 まで 16.5/16.0/15.4 秒、Started 14.2/13.8/13.3 秒。AOT: health 200 まで 7.6/7.7/7.5 秒、Started 6.1/6.3/6.2 秒。両方とも Flyway 6 件適用・/api/auth/me 401・ログイン開始 302 で同一。イメージ: 通常 展開後 770 MB・gzip 164 MB、AOT 展開後 1050 MB・gzip 198 MB（0.5 GB の無料枠は AOT で 2 版ほどのまま）
- D-1 の判断: redirect-uri は採用。plan D2・decisions.md Q154 の値の列挙への追記は区間 E で行う。手順 4 は && でつなぎ失敗時に止める形に直した
