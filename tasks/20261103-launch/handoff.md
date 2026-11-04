# handoff: launch

## 現在地
段階2 完了（2026-11-03）。A1・A2・B1・B2・B3 まで完了（PR #87・#89・#90・#92・#93・#96・#97）。B1・B2・B3 は `main` にあり、本番には未デプロイ（C5 で出す）。C1 は Neon のプロジェクトを作り（PostgreSQL 18.6・Singapore・0.25 CU、`neondb` は空）、手順と Q129・Q131 の記録を書いた（2026-11-04）。C2 は料金を確かめて `design/tech-stack.md`「費用」に書き、ユーザーに示した（2026-11-04）。C2 まで完了。C3 はイメージと手元の測定、手順の下書きまで済み、ユーザーの課金の有効化を待っている。
公開までの残りを `plan.md` に整理した。Web は `https://skillweave.app` にデプロイ済みで、`/api/*` は 503 を返す。`/privacy` の「アクセス解析は入れていません」が事実と合わないので、直して再デプロイするまで URL は配らない。

## 次のセッション
- 推奨モデル: Opus（effort medium）
- 最初に打つコマンド: `/flow-*` は使わない。次の文を貼る。

```text
SkillWeave の公開作業の続き。応答は日本語。tasks/20261103-launch/handoff.md と plan.md を全文読み、未完了の最初のタスクから進める。plan.md の「守ること」に従う。
```

- 最初のタスク: C3 の続き。進行中の PR は #98（`docs/launch-c2-pricing`）で、公開作業の記録はこの 1 本に足す。課金の有効化・予算の作成・`gcloud` のログイン・秘密情報の入力・Discord の設定はユーザーが行う。`design/tech-stack.md`「API のデプロイ手順」から続ける。

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

- 2026-11-04: 外部サービスは今の構成を変えない。最適化は API の起動（AOT キャッシュ。Q150）とエラーの確認（Error Reporting）に絞る（理由: 公式の料金ページとの比較と手元の測定。`design/tech-stack.md`「使わないサービス」。ユーザーの確認待ち）

## レビュー記録

## メモ
- このフォルダは `main` にある。更新するときは `docs/*` のブランチを切り、PR で入れる。
- 本番の版は `5b864842-fb1a-4fb1-83a9-73a47d5e00ca`。wrangler はログイン済みで、4.153.0 のまま。
- PR #86 で `design/tech-stack.md` の手順と `tasks/lessons.md` の教訓を `main` に入れた（`e2d7639`）。
- C1 の実測（2026-11-04）:
  - V1・V3〜V6 の既定値が `uuidv7()` を使う。PostgreSQL 17.11 のコンテナでは `function uuidv7() does not exist` で、18 が必須。
  - Flyway 12.4.0 のロックは既定で `pg_try_advisory_xact_lock`（jar のバイトコードで確認。`flyway.postgresql.transactional.lock` の既定が true）。Neon の資料は Flyway に direct 接続を指示している。
  - `postgres:18.6-trixie` の使い捨てコンテナで `pg_dump -Fc --no-owner --no-acl` → `gpg` の AES256 → 別ロールの DB へ `pg_restore --single-transaction` が成功した。行・jsonb の日本語・bytea・制約数（75）・索引数（17）が一致し、復元後も `uuidv7()` の既定値が動いた。`flyway_schema_history` は含まない。
  - Neon（PostgreSQL 18.6、direct）の使い捨て DB でも同じ往復が成功した。`--exclude-table-data='spring_session*'` で復元先のセッションは 0 行になり、`neondb` は空のまま。後片付けで `swv_c1_src` の `DROP DATABASE` が `being accessed by other users`（他 8 セッション）で失敗したが、ダッシュボードを開いていて、設定の保存の後に通常の `DROP` で消せた。8 セッションはアプリ名が空、`client_addr` は私設アドレスの同一値、最後のクエリは `CLOSE ALL;SET SESSION AUTHORIZATION DEFAULT;RESET ALL;DEALLOCATE ALL;...` の接続プール風のリセットで、誰の接続かは未確定（Neon 側のプールと推定）。アイドルで残る接続がコンピュートの停止を妨げるかは C6 で確かめる。
  - Neon の資料の PostgreSQL 18 対応は食い違う（version policy は 14〜18、migrate-from-postgres は 14〜17）。作成画面で 18 を選べるかを確かめる。
