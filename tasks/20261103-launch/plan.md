# plan: launch

## 方針
SkillWeave をフレンドが使える状態まで公開する。この plan.md は進行表だけで、決定は `specs/`、手順は `design/` を正とする。

- コードとテストの変更は TSOD（`/tsod-discover`・`/tsod-spec` 以降）で進める。
- 運用作業は、この plan.md のタスクを順に進める。
- `/flow-*` コマンドは使わない。`tsod-workflow` があるリポジトリでは停止するため、書式だけを使う。
- 全機能の完成は待たない。残りの機能は公開後に 1 つずつデプロイする。

## 変更するファイル
- `specs/open-questions.md`: A1 の Q の追記と、解消した Q の移動
- `design/tech-stack.md`: 本番の構成と手順
- `design/` の適切な場所: バックアップと API のデプロイの手順
- `apps/web/**` など: B のタスクだけ（TSOD の中で変更する）

## タスク

### A. 記録
- [x] A2 Workers Logs の状態を確かめる（ユーザーが Workers & Pages → `skillweave` → Observability を見た。2026-11-03 時点で無効）
- [x] A1 「A1 で記録する内容」を `specs/open-questions.md` に反映する（`docs/*` ブランチ。PR #87 でマージ、`09bf299`）

### B. TSOD で進めるもの
- [x] B1 `/privacy` に Web Analytics の説明を足し、030 の AC-9 を取り消す（032 privacy-analytics。PR #89・#90 でマージ。本番への反映は C5）
- [x] B2 031 api-proxy（PR #92・#93 でマージ。本番での転送の確認は Q88・031 decisions.md Q142 へ持ち越し。デプロイは C5）
- [ ] B3 `/privacy` にバックアップの説明を足す（消去の依頼の後も最大約 4 週間、暗号化したダンプに残る）。依存: C1。C8 の前にマージしてデプロイする

### C. 運用作業
- [ ] C1 Neon: Q129・Q131 の案を示して決め、ユーザーがプロジェクトを作り、バックアップとリストアの手順を `design/` に書く。依存: なし
- [ ] C2 Cloud Run・Artifact Registry・Secret Manager の料金を公式資料で確かめ、課金の有効化の前に示す。依存: なし
- [ ] C3 Cloud Run: 予算アラートと停止手順を先に用意し、イメージ・地域の測定・最小インスタンス数・API の接続を進める（Q88）。依存: C1、C2
- [ ] C4 本番の Discord OAuth を設定する。依存: C3
- [ ] C5 Web を再デプロイし、本番でログイン・保存・共有 URL を確かめる。依存: B1、B2、C4
- [ ] C6 Neon が停止するか（Q91）、無料枠の消費、レイテンシを実測して記録する。依存: C5
- [ ] C7 Q140 の照合: Email Routing の転送と受信、Cloud Run の地域、ログの保持、Workers Logs、バックアップの保持期間、Web Analytics、ブラウザの通信先。依存: C5
- [ ] C8 ユーザーの判断で URL を配る。依存: C5、C6、C7
- [ ] C9 残す内容を `design/`・`specs/` へ移し、このフォルダを消す。依存: C8

### 順番
1. A2 → A1 → B1
2. B2 と C1 を並行して進める
3. C2 → C3 → C4
4. C5 → C6・C7 → C8 → C9

## A1 で記録する内容

### 新しい Q（次の番号は Q141）
`/privacy` の「アクセス解析と広告は入れていません」が本番の事実と合わない。Cloudflare が Web Analytics のビーコン（`static.cloudflareinsights.com/beacon.min.js`）を HTML に挿入し、ブラウザが `/cdn-cgi/rum` へ URL と計測値を送る（2026-11-03 に実測）。ユーザーは Web Analytics を残して表記を直すと決めた（2026-11-03）。030 の AC-9 の取り消しと、`PrivacyView.vue` と `PrivacyView.spec.ts` の修正が要る（仮: TSOD の機能として起票し、URL を配る前にマージしてデプロイする。IP の保存は公式資料に記載が見つからないので断定しない）

### 既存の Q への追記
- Q88: Web のデプロイ手順は `design/tech-stack.md` に記録した。残りは API 側の手順。
- Q130: ゲストの訪問でも `/api/auth/me` が毎回呼ばれることを、本番の 503 で確かめた（2026-11-03）。
- Q136: 本番で確かめた（2026-11-03）。`/no-such-page` は 200 の HTML で、ヘッダーとフッターだけの空の画面になる。存在しないファイル（`/assets/no-such-chunk-AAAAAAAA.js`・`/no-such-file.png`）にも 200 の `text/html` が返る。存在しないチャンクの `import()` は `TypeError: Failed to fetch dynamically imported module` で失敗する。古いタブを開いたままデプロイする再現はしていない。扱いは「判断ログ」のとおり、URL を配る前には直さず、機能として起票する。
- Q140: 照合の対象に Web Analytics とブラウザの通信先を足す。Workers Logs は、2026-11-03 時点でダッシュボードの Observability が無効だった。公式資料は新しい Worker は既定で有効としているが、`wrangler.jsonc` に `observability` が無いこの Worker は無効だった。有効にするときは、ダッシュボードでなく `wrangler.jsonc` に書く。無料プランの保持期間は料金表で 3 日、制限表で最大 7 日と食い違う。2026-12-01 から料金体系が変わる。

## B1 の材料
本番で実測した事実（2026-11-03）:
- 送信先は `skillweave.app/cdn-cgi/rum`。送る内容はページの URL と読み込みの時間など。メモリ使用量とブラウザのバージョン情報らしき項目も含む。
- `?probe=1` を付けて開くと、送られた URL からクエリ文字列が除かれていた（1 回の実測）。
- 未ログインの状態で、Cookie と localStorage と sessionStorage は空だった。

公式資料で確かめた事実（2026-11-03）:
- 記録される項目は、国・ホスト・パス・参照元・端末の種類・ブラウザ・OS（https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/）。
- Cookie と localStorage を使わないと説明している（https://www.cloudflare.com/web-analytics/）。
- 詳細データは 7 日で、その後は約 10% に集約される。閲覧できるのは過去 6 か月分（https://developers.cloudflare.com/web-analytics/faq/）。
- IP アドレスの保存は、読んだ資料に記載が見つからない。推測で書かない。
- Cloudflare のプライバシーポリシーは顧客のサイトに適用しないと書き、読めた範囲に Web Analytics の名前が無い。今の「Cloudflare での扱いはポリシーを確認」のリンクの扱いも見直す。
- ビーコンの設定元はダッシュボードで見ていない。Web Analytics の自動設定と推定している。

文面の叩き台:

> 表示の速さを測るため、Cloudflare Web Analytics を使っています。ブラウザは、開いたページの URL と読み込みの時間などの計測値を Cloudflare へ送ります。Cloudflare は、国・参照元・ブラウザ・OS・端末の種類を集計します。この計測に Cookie は使っていません。広告は入れていません。

## B2 の論点
- 上流の URL を設定で受け取る方法（環境変数かバインディング）と、未設定のときの挙動。
- Q130: `SESSION` の Cookie が無い `GET /api/auth/me` は、Worker が Cloud Run へ転送せず 401 を返す案。応答の形は API の問題応答（`application/problem+json`）に合わせる。Cookie の無い他の経路の扱い。
- `redirect: 'manual'` で Discord の認可へのリダイレクトをそのまま返す。複数の `Set-Cookie` を結合せずに渡す（どちらも未検証）。
- ホストと `X-Forwarded-*` の扱い（028 decisions.md Q85 は `forward-headers-strategy` に頼らない）。
- `/api/login/oauth2/code/discord` のコールバックが同一オリジンで届くこと。
- テストの方法（workerd か、fetch をモックした単体テストか）。依存を足すなら `pnpm-workspace.yaml` の書き足しを確かめる。
- 直接アクセスの制限（Worker だけが知るヘッダー）は含めない。
- デプロイは含めない（C5 で行う）。

## C の未決の案
該当のタスクの前に提案して、ユーザーの確認を取る。
- Q129: マイグレーションは API の起動時のまま Neon の direct 接続で流す。PostgreSQL の見送りを解除し、18 でプロジェクトを作る。先に Flyway が advisory lock を使うかと、direct 接続を設定できるかを確かめる。
- Q131: 週 1 回とマイグレーションの前に手元で `pg_dump` を取り（`postgres:18.6-trixie` のコンテナ）、暗号化してリポジトリの外に保存する。手元の PostgreSQL 18 で dump と restore を試す。
- Q88 の地域: Singapore と東京に一時デプロイして測り、差がわずかなら Singapore。
- Q88 のイメージ: まず `bootBuildImage` を試す（Java 25 で動くかは未確認）。
- Q88 の最小インスタンス数: 0。
- Q88 の直接アクセス: フレンド公開では開けたままにし、URL を公開せず、低額の予算アラートと停止手順を用意する。
- C4 の値: redirect URI は `https://skillweave.app/api/login/oauth2/code/discord`、`SWV_WEB_TOP_URL` は `https://skillweave.app/`。

## 注意する点
- `max-instances=1` だけでは費用は無料枠に収まらない。1 vCPU で常に動くと月 259 万 vCPU 秒で、無料枠の約 14 倍（課金方式によって変わる。未確認）。予算アラートは支出を止めない。
- Cloud Run の料金ページ（https://cloud.google.com/run/pricing）は本文を読めていない。Secret Manager の無料枠も未確認。
- Cloud Run を出した時点で `run.app` の URL は誰でもアクセスできる。Workers の上限も効かない。
- `gcloud`・`psql`・`pg_dump` は手元に無く、`docker` はある。
- `test:e2e` の後の `apps/web/dist` は配備に使わない。デプロイの直前にビルドし直す。
- 本番の確認は、ブラウザの通信先も見る。`Accept: text/html` を付けない `curl` にはビーコンが入らない。

## 守ること
- アカウント作成・購入・課金の有効化・秘密情報の入力・ログインはユーザーが行い、Claude は手順を案内する。
- 本番環境の作成・変更、デプロイ、push、PR の作成とマージは、実行前に確認を取る。
- 秘密情報をリポジトリ・ログ・チャット・このフォルダに書かない。リポジトリは public。
- `pnpm-workspace.yaml` は指示なしに変更しない。
- 動作確認していないことを「動く」と言わない。

## 受け入れ条件
1. 本番でログイン・保存・共有 URL が動くことを確かめている。
2. `/privacy` の記載が、本番の設定とブラウザの通信先に合っている。
3. `contact@skillweave.app` へのメールを受信できている。
4. 費用の上限の対策（予算アラートと停止手順）が用意され、無料枠の消費を実測している。
5. 手順が `design/` に残り、このフォルダを消している。

## 検証コマンド
- `node .claude/skills/tsod-verify/scripts/verify.mjs`: コードを変える作業の検証（CI と同じ内容）
- `pnpm --filter @swv/web exec wrangler deploy --dry-run`: デプロイの前の確認
- 本番の確認の手順は `design/tech-stack.md`「Web のデプロイ手順」

## 範囲外
- 016・017・018・023（公開後に 1 つずつ）
- Q107（件数の上限など）・Q139（物理削除）・直接アクセスの制限（一般公開の前に扱う）
- Q136 の修正（起票だけして公開後に扱う）
- `tasks/lessons.md` の項目の `.claude/rules` への反映（公開とは独立に、いつでも行える）

## 実装の最後の手順
- 各タスクが終わったら [x] を付け、handoff.md の「現在地」と「次のセッション」を更新する。
- C9 で残す内容を移し、このフォルダを消す。
