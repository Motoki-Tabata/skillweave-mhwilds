# 033: privacy-backup 計画

## スタック
- Web: 既存の Vue・Vitest・Playwright（Chromium）をそのまま使う。依存は足さず、版も変えない。
- 手順: `design/tech-stack.md` の既存の手順と同じ `postgres:18.6-trixie` の `psql`・`pg_dump`・`pg_restore` を docker で実行する。

## データモデル
なし

## 決定事項

### 手順（AC-8〜AC-10）
- D1: `design/tech-stack.md`「バックアップ」の「4 世代を残して古いものを消す。」を、次の規則に置き換える。マイグレーションの前のダンプも世代に数える。ダンプを取って確かめた後に、新しい順で 5 個目以降のものと、取得から 28 日を過ぎたものを消す。この作業を「変数を消す」の前の工程として足す。例: `10/06`・`10/13`・`10/20`・`10/27` がある状態で `11/03` を取ると、`10/06` が 5 個目になるので消す。
- D2: `#### バックアップ` と `#### 復元` の間に `#### 消去` を足す。工程は、依頼の Discord の ID から `users.id` を引く、消去の記録を書く（D4）、消す（D3）、結果を確かめる、の順にする。本人確認の方法はこの手順の対象外と書く（Q148）。
- D3: 消す工程は、消去と消し直しで同じコマンドにする。`psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -v ids="$SWV_ERASED_IDS" -f -` に次の SQL を標準入力で渡す。`SWV_ERASED_IDS` はカンマ区切りの `users.id` で、消去では 1 件、消し直しでは記録のすべてを入れる。順序は `shares` の外部キーが `builds` を参照するので `shares` を先にする。`spring_session_attributes` は `ON DELETE CASCADE` で消える。ソフトデリートの行も `deleted_at` を見ずに消す。他の利用者の共有が対象の構成を指すと外部キーで全体が失敗し、何も消えない。`ShareService.create` は自分の構成だけを受け付けるので、通常は起きない。

  ```sql
  DELETE FROM spring_session WHERE principal_name = ANY (string_to_array(:'ids', ','));
  DELETE FROM shares WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
  DELETE FROM builds WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
  DELETE FROM charms WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
  DELETE FROM weapons WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
  DELETE FROM users WHERE id = ANY (string_to_array(:'ids', ',')::uuid[]);
  ```

- D4: 消去の記録は、ダンプと同じ保存先の `swv-erased-<YYYYMMDD>.txt`（日付は UTC）に、`users.id` を 1 行に 1 件ずつ書く。中身は Q144 のとおり `users.id` だけで、残す期間を判断するための日付はファイル名に持たせる。例: 2026-11-05 の消去は `swv-erased-20261105.txt` に `019a0000-0000-7000-8000-000000000030` の 1 行を書く。消す前に書く（記録が無いまま消えた状態を作らないため。消す工程が失敗しても、依頼は残っているのでやり直す）。残っている最も古いダンプの取得日より前の日付の記録を、D1 の工程で消す。例: 最も古いダンプが `20261110` になったら `swv-erased-20261105.txt` を消す。同じ日のダンプが残る間は残す。
- D5: `design/tech-stack.md`「復元」の工程 3 と工程 4 の間に、消し直す工程を足す。`SWV_ERASED_IDS` にすべての記録の行をカンマ区切りで入れ、D3 のコマンドを `NEON_RESTORE_URL` に対して実行する。記録が無ければ飛ばす。節の冒頭の Neon の復元の説明に、API を止めて復元し、同じ工程を `NEON_DIRECT_URL` に対して実行してから起動することを足す。Neon の復元はセッションも戻すので、この工程で消える。
- D6: `design/tech-stack.md` は委譲の前にメインが書く（T1）。AC-11 の結果の記録だけは、D7 の実行の後に書く（T2。委譲の前。D7 の結果が表記の文面を変える可能性があるため）。

### 手順の確認（AC-11）
- D7: 次の環境で、`design/tech-stack.md` に書いたコマンドをそのまま実行する。リポジトリのファイルは変えない。
  - 使い捨ての `postgres:18.6-trixie` のコンテナを別のポートで起動する。compose の `swv_db` は使わず、終わったらコンテナを消す。
  - その DB へ向けて API を `./gradlew bootRun` で起動し、Flyway に流させる。Discord は scratchpad に置く小さなスタブで置き換え、`SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_DISCORD_TOKEN_URI`・`..._USER_INFO_URI` で向ける（`application.yml` の provider の値なので環境変数で変えられる見込み。変えられなければ停止して報告する）。
  - 利用者 A と B を、実際のログインの経路でログインさせ、本物のセッションを作る。表示名には、ダンプの中を検索できる目印の文字列を使う。護石・構成・武器・共有は `INSERT` で足し、ソフトデリートの行も入れる。
- D8: D7 の環境で次を確かめ、日付と結果を `design/tech-stack.md`「消去」の末尾に「確認の範囲」として書く（`復元` の既存の書き方に合わせる）。Neon での実行と Neon の復元は未確認と書く。
  1. `spring_session.principal_name` が `users.id` と一致する（Q144 の見込み）。
  2. 消去の前に既存の `pg_dump` の指定で取ったダンプに、`spring_session*` のデータと表示名の目印が無く、Discord の ID とソフトデリートの行がある（Q147 の見込みと AC-4 の文面）。
  3. A を消すと、A の行が全テーブル（`spring_session_attributes` を含む）で 0 件になり、B の行とセッションが残る。A の Cookie の `/api/auth/me` は 401、B の Cookie は 200 を返す（AC-11）。
  4. 2 のダンプを別の空のデータベースへ復元し、記録から消し直すと、A の行が消えて B の行が残る（AC-10）。
- D9: D8 の 1 か 2 が成り立たないときは、表記の文面（Q143）か消去の手順が前提を失うので、web-agent へ委譲せずに停止する。`tsod-workflow/SKILL.md`「承認済みの前の区間の成果物を変えるとき」に従う。

### 表記（AC-1〜AC-7）
- D10: `PrivacyView.vue` の「データの削除」の節で、既存の `<p>` の後に Q143 の 4 段落を 1 段落ずつ `<p>` で足す。文面は Q143 の引用を逐語で使う。新しい節と部品は作らず、既存の `<p>` は変えない。
- D11: `LAST_UPDATED` は文面を変えた日（実装の環境の `date +%Y/%m/%d`）にする。今日なら `2026/11/04`。日をまたいだら、実装とテストの固定値を両方その日に変える。

### 単体テスト（AC-12）
- D12: `PrivacyView.spec.ts` に `033 データの削除の節` の `describe` を足し、テスト名は `033 AC-N:` で始める。検査は、見出しが `データの削除` に完全一致する `h2` の `closest('section')` の中だけで行う。ページ全体には「最長 30 日」があり、否定の検査が別の節に当たるため。ファイル冒頭のコメントに 033 を足す。
- D13: 各テストは文を固定値で確かめる。
  - AC-1: 既存の 2 文と `依頼を受けてから 14 日以内を目安に消去します`。
  - AC-2: `データベースのバックアップを週に 1 回ほど取り、暗号化して、運営者が管理する保存先に保管しています`。節の本文が `/手元|Neon|Google Drive|Dropbox|OneDrive|iCloud|S3|R2/` に一致しないこと。
  - AC-3: `消去した後も、消去の前に取ったバックアップには約 4 週間データが残ります` と `取得は手作業なので、この期間は前後することがあります`。節の本文が `/最大|最長|上限/` に一致しないこと。
  - AC-4: `バックアップには、画面から削除したデータと Discord の ID も含まれます` と `ログインの状態と表示名は含まれません`。
  - AC-5: `バックアップから復元したときは、消去したデータを消し直します` と `消去した利用者の内部の ID を、バックアップが消えるまで記録します`。
- D14: AC-6 と AC-7 は既存のテストを使い、同じ検査を増やさない。`032 AC-1（節の順）` のテスト名に `033 AC-6` を足し、配列は変えない。`032 AC-8` のテスト名に `033 AC-7` を足し、期待の日付を D11 の日にする。
- D15: 他の既存のテストは変えない。追加の文面に「30 日」が無いので 030 AC-10 の件数は 2 件のままで、「解析に(利用|使)」「学習」も当たらない。`2026/11/03` の参照は `PrivacyView.vue` とこの `PrivacyView.spec.ts` の 2 か所だけである。

### e2e（AC-13）
- D16: `apps/web/e2e/privacy-backup.spec.ts` を足す。e2e は機能ごとに 1 ファイルなので `privacy-notice.spec.ts` に混ぜない。`**/api/auth/me` を 401 で返して `/privacy` を開き、`getByRole('heading', { level: 2, name: 'データの削除', exact: true })` と、`データベースのバックアップを週に 1 回ほど取り` を含む文が表示されることを確かめる。

### 確認の範囲
- D17: 実際の起動経路の確認は、画面は e2e（`pnpm run build` と `preview`）、手順は D7・D8 で行う。本番の Neon での消去と Neon の復元は行わない。Web の再デプロイと本番の照合はスコープ外（launch の C5）。D-1 の提示に未確認として書く。

## 常時許可外の変更
- `design/tech-stack.md`（バックアップの消し方と、消去・消し直しの手順を足す。担当: メイン。確認の結果は D6 の時期に書く）
