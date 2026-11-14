# handoff: launch

## 現在地
2026-11-14: C8 を済ませた。PR #119 を v0.3.0 としてマージして Web を出し（Release の run 43578068198、版 `9e2f1b6a-0b80-42a8-a37a-32f1104a1056`）、運営者がブラウザで確かめた。URL は運営者が配る。残りは D1〜D5・C9・C10。
2026-11-14: v1.0.0 は `specs/feature-map.md` の残りの機能（016・017・018・023）をすべて出した後にした。URL は 0.x のまま C8 で配る。URL を配った後に起票する Q136・Q149・Q158・Q159 の機能も v1.0.0 の前に出す。plan.md に D1〜D4（4 機能）・D5（4 つの Q）と C9（v1.0.0）を足し、後片付けを C10 にした。残りは C8・D1〜D5・C9・C10。
2026-11-14: C7（Q140 の照合。`design/tech-stack.md`「プライバシーの表記との照合」）を済ませた。Email Routing が未設定で `contact@` に届かなかったので運営者が有効にし、受信を確かめた。ほかは `/privacy` と合っていた。残りは C8・C9。
2026-11-11: C6（Neon の停止・無料枠の消費・レイテンシの実測。`design/tech-stack.md`「稼働の実測」）を済ませた。残りは C7・C8・C9。
2026-11-11: B5（AOT キャッシュ付きのイメージの本番反映と Cloud Run での測定）と C3（Error Reporting の確認。結果は Q158）を済ませた。
段階2 完了（2026-11-03）。A1・A2・B1・B2・B3 まで完了（PR #87・#89・#90・#92・#93・#96・#97）。B1・B2・B3 は 2026-11-07 に v0.1.0 として本番の Web に出した（C5 のうち Web の再デプロイ）。C1 は Neon のプロジェクトを作り（PostgreSQL 18.6・Singapore・0.25 CU、`neondb` は空）、手順と Q129・Q131 の記録を書いた（2026-11-04）。C2 は料金を確かめて `design/tech-stack.md`「費用」に書き、ユーザーに示した（2026-11-04）。C2 まで完了。C3 はイメージと手元の測定、手順の下書きまで済み、ユーザーの課金の有効化を待っている。B4 は 034 api-proxy-id-token として完了した（PR #112・#113・#114。2026-11-07）。GCP のプロジェクトと `swv-web-invoker` は 034 の T1 で作った。2026-11-07 時点で課金は無効、Cloud Run・Artifact Registry・Secret Manager の API は未有効だった（同日に課金を有効にし、3 つの API を有効にし、予算 2 つ（`swv-cloud-run-cap`・`swv-billing-alert`）を作った）、`swv-web-invoker` に利用者が管理する鍵は無い。034 の Worker は本番の Web にまだ出していない（release-please の PR #111 が開いている）。
公開までの残りを `plan.md` に整理した。Web は `https://skillweave.app` で v0.1.0 が動いている。release-please と `.github/workflows/release.yml` による版の管理と Web の自動デプロイを入れ（PR #104・#105・#106・#109。規則は `design/tech-stack.md`「リリースと版」）、`main` の `39368d1` に v0.1.0 の GitHub Release を作って、Release の `workflow_dispatch`（tag=`v0.1.0`）で出した。`API_ORIGIN` は未設定なので `/api/*` は 503 を返す。`/`・`/privacy`・`/builds` の画面と検索はユーザーがブラウザで確かめた（2026-11-07）。C5 はログイン・保存・共有 URL の確認が残っている。URL は C8 まで配らない。

## 次のセッション
- 推奨モデル: Opus（effort medium）
- 最初に打つコマンド: D1〜D4 は機能の区間コマンド（D1 は `/tsod-spec 016`）を打つ。`/flow-*` は使わない。この進行表の運用作業（D5 の起票・C9・C10）に戻るときは、次の文を貼る。

```text
SkillWeave の公開作業の続き。応答は日本語。tasks/20261103-launch/handoff.md と plan.md を全文読み、未完了の最初のタスクから進める。plan.md の「守ること」に従う。
```

- 最初のタスク: D1。016 charm-ocr を `/tsod-spec 016` で始める（区間 A の最初に Q117 を決める）。D1〜D4 は機能 ID の順に、1 機能ずつ TSOD の区間 A〜E で進め、マージの後の release-please のリリースで本番へ出す。D5（Q136・Q149・Q158・Q159 の起票と実装）は D4 の後、v1.0.0（C9）は D5 の後。以下は C8 より前の経緯。C8 は、release-please の PR #119 を v0.3.0 としてマージして Web を出し、ユーザーの判断で URL を 0.x のまま配る。v1.0.0 は D1〜D4（016→017→018→023 を TSOD で）と D5（URL を配った後に Q158・Q149・Q159・Q136 を起票して出す）の後の C9 で出す（`design/tech-stack.md`「リリースと版」）。以下は 2026-11-14 の方針変更より前の経緯。C7 は 2026-11-14 に済んだ。Email Routing は未設定だったので有効にし（MX 3 件・SPF と DKIM の TXT）、`contact@` の転送と受信を確かめた。Web Analytics は運営者の端末ではセキュリティソフトがビーコンを止めていたので、手元の Playwright で `/cdn-cgi/rum` の送信を確かめた。以下は C7 より前の経緯。最初のタスクは C7 だった。C6 は 2026-11-11 に済んだ。Neon は最後の要求から約 20 分で止まり（Q91）、期限切れの `spring_session` は残っていた（Q149。URL を配った後に起票）。`/api/*` へのスキャナーの要求が Cloud Run と Neon を起こしている（Q159。今の量なら直さない）。C7 は `/privacy` の記載を読み、Email Routing のテストメール・`/cdn-cgi/rum` の送信の確認をユーザーに依頼する。以下は C6 より前の経緯。B5 と C3 は 2026-11-11 に済んだ。B5 は AOT キャッシュ付きの `api:b29693c` を本番の `swv-api` に出し（リビジョン `swv-api-00002-cs5`）、Cloud Run で停止からの最初の要求を測った（`design/tech-stack.md`「API のデプロイ手順」）。C3 の Error Reporting は、今の平文のログではスタックトレースが 1 行ずつ分かれて載らなかった（`specs/open-questions.md` Q158）。Q158 は URL を配った後に TSOD で起票する。release-please の PR #119（v0.3.0）は開いたままで、C8 の v1.0.0 にまとめる予定。以下は 2026-11-09 までの経緯。C3 の続き。課金の有効化と予算の作成（手順 2）は済んだ（2026-11-07）。Secret Manager の 5 つのシークレット（`swv-db-*`・`swv-discord-*`）も運営者が登録し、形を確かめた（2026-11-07）。手順 3（Artifact Registry の `swv`・`swv-api-runtime`・シークレットの読み取り権限）と手順 4（`main` の `4fb470f` のイメージを `api:4fb470f` で push）も済んだ（2026-11-07）。手順 5 のデプロイ・「地域の測定」・手順 7 の確認も済み、地域は Singapore に決めて東京のサービスを消した（2026-11-07。`design/tech-stack.md`）。手順 6 も済んだ（2026-11-07。`swv-web-invoker` に Invoker を付け、運営者が鍵を発行して `API_INVOKER_KEY` に登録し、手元の鍵を消した。利用者が管理する鍵は 1 本）。v0.2.0（034 の Worker）を Release の run 42364896935 で出し（版 `ef1c64f6-298c-4ad3-938d-36e0340fe887`）、`API_ORIGIN` を登録した（2026-11-07）。Worker 経由で、Cookie なしの `/api/auth/me` は 401、`/api/oauth2/authorization/discord` は本番の redirect URI の 302（停止からの起動で 21.5 秒、2 回目は 0.3 秒）、クライアントが送った `X-Serverless-Authorization` は消されて 302 だった。C5 は同日に運営者のブラウザでの確認まで済んだ（plan.md C5）。C3 の「停止」は 2026-11-09 に試した（`design/tech-stack.md`「停止」）。Q150 の AOT キャッシュは 2026-11-09 に Cloud Run で比べ、停止からの最初の要求が 19.0 秒から 14.2 秒に縮んだ（訓練が途中で失敗したキャッシュでの値。`specs/open-questions.md` Q150）。URL を配る前に機能として入れることにした（plan.md B5）。次は B5（`/tsod-discover` から）、C3 の残り（Error Reporting）、C6・C7。C3 の残りは「停止」の試行、Q150 の AOT キャッシュの比較、Error Reporting の確認。C4 は済んだ。進捗は `main` から `docs/*` のブランチを切り、タスクごとに小さな PR で入れる。課金の有効化・予算の作成・`gcloud` のログイン・秘密情報の入力・Discord の設定はユーザーが行う。

## 判断ログ
- 2026-11-03 段階2: サブセッションに分けず、1 つの進行表で進める（理由: ユーザーの指示）
- 2026-11-03 段階2: `/flow-*` は使わず、`plan.md` と `handoff.md` の書式だけを使う（理由: `tsod-workflow` があるリポジトリでは `/flow-*` が停止し、段階の分け方も運用作業に合わない）
- 2026-11-03 段階2: コードとテストの変更は TSOD で進める（理由: ユーザーの指示）
- 2026-11-03 段階2: Web Analytics を残し、`/privacy` の表記を直す（理由: ユーザーの決定）
- 2026-11-03 段階2: Workers Logs は無効のままにし、必要になったら `wrangler.jsonc` に書いて有効にする（理由: 今の Worker は 503 を返すだけで使い道が少なく、設定をリポジトリに残せる）
- 2026-11-03 段階2: Q136 は URL を配る前には直さず、機能として起票して公開後に扱う（理由: 提案をユーザーが受け入れた。古いタブの問題は再読み込みで解消する見込みで、フレンド公開の規模なら許容できる。古いタブでの再現は未実施）

- 2026-11-04 C1: PostgreSQL は 18 にする。マイグレーションは API の起動時に流し、接続は API 全体で direct に統一する（理由: ユーザーの決定。`uuidv7()` が 18 を要し、Neon は Flyway に direct を指示し、`max-instances=1` なら接続数に余裕がある）
- 2026-11-04 C1: バックアップは週 1 回とマイグレーションの前に `pg_dump -Fc --no-owner --no-acl` を `gpg` の AES256 で暗号化してリポジトリの外に保存し、4 世代残し、`spring_session*` のデータは除外する（理由: ユーザーの決定。保存先とパスフレーズの置き場所はユーザーが決める）
- 2026-11-04 C1: `/privacy` にバックアップの説明を足す機能を TSOD で進め、C8 の前に出す（plan.md B3。理由: ユーザーの決定。今の表記にバックアップの記載が見当たらない）

- 2026-11-04: このフォルダを `main` に入れ、進捗も `main` で持つ。運用の文書と進行表は `docs/launch-ops` の PR でまとめて入れる。`main` へ直接 push できないので、以後の進捗もタスクごとに小さな PR で入れる。B3 は TSOD のブランチと PR で進める（理由: ユーザーの指示。リポジトリは public なので、接続情報と `run.app` の URL をこのフォルダに書かない）

- 2026-11-04: 公開作業の PR は 1 本にまとめ、進められるものはセッション内で進める。ユーザーの操作は指示し、TSOD が要る作業の前で止まる（理由: ユーザーの指示）

- 2026-11-04: 外部サービスは今の構成を変えない。最適化は API の起動（AOT キャッシュ。Q150）とエラーの確認（Error Reporting）に絞る（理由: 公式の料金ページとの比較と手元の測定。`design/tech-stack.md`「使わないサービス」。2026-11-07 にユーザーが承認）

- 2026-11-07: PR #98 は C2 の完了・C3 の準備・v0.1.0 の本番反映の記録までで閉じる。以後は 2026-11-04 の「タスクごとに小さな PR」に戻し、上の「PR は 1 本にまとめる」は取り下げる（理由: ユーザーの指示）

- 2026-11-07: Cloud Run への直接の到達は、Invoker の確認を有効にしたままにし、Worker が ID トークンを付けて呼ぶ（plan.md B4。理由: ユーザーの決定。IAM で拒否した要求は課金されず、ロードバランサーも要らない。サービスアカウントの鍵には `swv-api` の Invoker の権限だけを付け、漏れても今の開けた状態と同じ範囲に収める）

- 2026-11-07 C3: 予算は Cloud Run に月 $10 の spend cap、請求先アカウント全体に月 $1 の通常の予算にする（理由: ユーザーの決定。spend cap は定価で判定し、普段の見積もりは月 $1 弱。通常の予算は無料枠を引いた額で判定するので、普段は $0 の見込み）
- 2026-11-09 C3: AOT キャッシュ（Q150）を URL を配る前に TSOD の機能として入れる（plan.md B5。理由: ユーザーの決定。停止からの最初の要求が 19.0 秒から 14.2 秒に縮み、訓練を最後まで通せばさらに縮む見込み）
- 2026-11-11 C3: Error Reporting は本番の `swv-api` に触れず、同じイメージの一時のサービス（`swv-err-test`）を起動に失敗させて確かめ、確認の後に削除した（理由: ユーザーの承認。本番の API には 500 を安全に起こす経路が無い）
- 2026-11-11: release-please の PR #119（v0.3.0）はマージせず、C8 の v1.0.0 にまとめる（理由: 提案をユーザーが受け入れた。中身は 035 の api の変更だけで、API は手動でデプロイするので Web のリリースは要らない）
- 2026-11-11 C3: Q158（Error Reporting に載らない）は URL を配った後に機能として起票し、C8 の前提にしない（理由: 推奨をユーザーが受け入れた。フレンドへの公開の規模なら Cloud Logging を読めば足りる）
- 2026-11-11 C6: 予算の金額（spend cap 月 ¥1,500・通常の予算 月 ¥150）は据え置く（理由: 提案をユーザーが承認した。11 月 1〜11 日の定価は ¥4 で、どちらの予算にも余裕がある）
- 2026-11-11 C6: スキャナーの要求（Q159）は URL を配る前には直さない（理由: 提案をユーザーが承認した。1 回の起動で Neon は約 0.083 CU 時間で、今の量なら無料枠への影響は小さい）
- 2026-11-14 C7: `contact@skillweave.app` を Cloudflare Email Routing で運営者の受信箱へ転送する。キャッチオールは無効にする（理由: 030 decisions.md Q134 の決定どおり。照合で未設定と分かり、運営者が設定した）
- 2026-11-14 C7: `/privacy` は直さない（理由: Email Routing のほかは本番の事実と合っていた）
- 2026-11-14 C8: v1.0.0 は `specs/feature-map.md` の 016・017・018・023 をすべて出した後にする。URL はそれを待たずに 0.x のまま配る。4 機能は ID の順に進める（理由: ユーザーの決定）
- 2026-11-14 C8: PR #119 は release-please が更新せず `main` より古いままだったので、`gh pr update-branch` で追随させ、CI が通ってからマージした（理由: #128 は文書だけで、release-please はリリース PR を書き換えない）
- 2026-11-14 C8: Q136・Q149・Q158・Q159 も URL を配った後に起票し、v1.0.0 の前に出す（plan.md D5。理由: ユーザーの決定。範囲外の「Q136 の修正」を取り下げる）
- 2026-11-14 C8: PR #119 は v1.0.0 にまとめず、v0.3.0 としてマージする（理由: v1.0.0 が 4 機能の後になり、本番の依存の更新を先に出せる。2026-11-11 の「v1.0.0 にまとめる」を取り下げる）

## レビュー記録

## メモ
- このフォルダは `main` にある。更新するときは `docs/*` のブランチを切り、PR で入れる。
- 本番の版は `9e2f1b6a-0b80-42a8-a37a-32f1104a1056`（タグ `v0.3.0`。2026-11-14 に Release の run 43578068198 で出した）。v0.1.0 の版は `7a13dec9-6183-4f15-b363-cc7397b41513`（2026-11-07 に Release の run 42342160053 で出した）。手元の wrangler はログイン済みで、4.153.0 のまま。
- Release が使う Cloudflare のトークン（テンプレートの「Edit Cloudflare Workers」）で、カスタムドメインへのデプロイが通った（2026-11-07）。
- PR #86 で `design/tech-stack.md` の手順と `tasks/lessons.md` の教訓を `main` に入れた（`e2d7639`）。
- C1 の実測（2026-11-04）:
  - V1・V3〜V6 の既定値が `uuidv7()` を使う。PostgreSQL 17.11 のコンテナでは `function uuidv7() does not exist` で、18 が必須。
  - Flyway 12.4.0 のロックは既定で `pg_try_advisory_xact_lock`（jar のバイトコードで確認。`flyway.postgresql.transactional.lock` の既定が true）。Neon の資料は Flyway に direct 接続を指示している。
  - `postgres:18.6-trixie` の使い捨てコンテナで `pg_dump -Fc --no-owner --no-acl` → `gpg` の AES256 → 別ロールの DB へ `pg_restore --single-transaction` が成功した。行・jsonb の日本語・bytea・制約数（75）・索引数（17）が一致し、復元後も `uuidv7()` の既定値が動いた。`flyway_schema_history` は含まない。
  - Neon（PostgreSQL 18.6、direct）の使い捨て DB でも同じ往復が成功した。`--exclude-table-data='spring_session*'` で復元先のセッションは 0 行になり、`neondb` は空のまま。後片付けで `swv_c1_src` の `DROP DATABASE` が `being accessed by other users`（他 8 セッション）で失敗したが、ダッシュボードを開いていて、設定の保存の後に通常の `DROP` で消せた。8 セッションはアプリ名が空、`client_addr` は私設アドレスの同一値、最後のクエリは `CLOSE ALL;SET SESSION AUTHORIZATION DEFAULT;RESET ALL;DEALLOCATE ALL;...` の接続プール風のリセットで、誰の接続かは未確定（Neon 側のプールと推定）。アイドルで残る接続がコンピュートの停止を妨げるかは C6 で確かめる。
  - Neon の資料の PostgreSQL 18 対応は食い違う（version policy は 14〜18、migrate-from-postgres は 14〜17）。作成画面で 18 を選べるかを確かめる。
