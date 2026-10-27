# 009: discord-login

## 目的 / ユーザーストーリー
プレイヤーとして、Discord のアカウントでこのアプリにログイン・ログアウトし、ブラウザを閉じてもログインしたままでいたい。護石・構成・武器をサーバーに保存して複数の端末で使う機能（010・011・013）は、ログインしたユーザーを前提にするため、その土台となる認証とセッションを先に用意する。ログインしなくても、検索・護石・武器の画面はこれまでどおり端末内で使える（`temp/initial-design.md` §2.1）。

用語:
- ログイン: Discord の OAuth（認可コードフロー）でユーザーを確かめ、API にセッションを確立すること。Discord に求めるスコープは `identify` だけ（decisions.md Q55）。
- 表示名: Discord の `global_name`（無ければ `username`）。ログインのときに Discord から得て、セッションにだけ持つ（decisions.md Q55）。
- セッション: Spring Session JDBC が PostgreSQL に保持するログインの状態。ブラウザとは HttpOnly の Cookie で結ぶ。

## 受入基準（EARS記法）
- WHEN 未ログインのユーザーがヘッダーの「Discord でログイン」を押したとき THE system SHALL Discord の認可画面へ遷移させ、スコープは `identify` だけを求めなければならない（decisions.md Q55）。
- WHEN Discord の認可が成功したとき THE system SHALL Discord のユーザー ID でユーザーを特定し、初回ならユーザーを1件作り（ID はサーバーで採番した UUIDv7）、2回目以降は同じユーザーを使ってセッションを確立しなければならない。メールアドレスと表示名を DB に保存してはならない（decisions.md Q55）。
- WHEN ログインの後に Web へ戻ったとき THE system SHALL ログインを押した画面を表示しなければならない。API は成功・失敗のどちらでも Web のトップへ固定でリダイレクトし、戻り先を要求のパラメータで受け取ってはならない（decisions.md Q57）。
- IF ユーザーが Discord で認可を拒否した、または認可の処理が失敗したとき THEN システムは、セッションを確立せず、ログインできなかったことを Web に表示しなければならない。
- WHILE ログインしているとき THE system SHALL ヘッダーに表示名と「ログアウト」を表示し、アバター画像を表示してはならない（decisions.md Q55）。
- WHEN ログアウトしたとき THE system SHALL サーバーのセッションを無効にして DB から消し、ヘッダーを未ログインの表示に戻し、画面を移らずにその場に留まらなければならない（decisions.md Q57）。
- IF ログアウトの要求が CSRF トークンを持たないとき THEN システムは、要求を拒否し、セッションを無効にしてはならない。
- THE system SHALL セッションを Spring Session JDBC で PostgreSQL に保持し、API を再起動してもログインを保たなければならない。
- THE system SHALL セッション Cookie を HttpOnly・SameSite=Lax とし、ブラウザを閉じても残る有効期限を付け、最後の利用から 30 日（設定キーで変えられる）使われなかったセッションを未ログインとして扱わなければならない（decisions.md Q56）。
- IF 未ログインのまま、ログインを要する API（009 では現在のユーザーの取得）を呼んだとき THEN API は、401 を返し、Discord の認可画面へリダイレクトしてはならない。
- IF Web が認証状態を取得できない（API に届かない・401 以外のエラー）とき THEN システムは、ヘッダーにログインの導線を出さず、エラーを通知せず、検索・護石・武器の画面を従来どおり使えるようにしなければならない。
- THE system SHALL ログインしていなくても検索・護石・武器の画面を従来どおり使えるようにし、ログインしても端末内の護石・武器をサーバーへ送ってはならない（`temp/initial-design.md` §2.1）。
- THE system SHALL Discord のクライアント ID とシークレットを環境変数から読み、リポジトリにコミットしてはならない。
- THE system SHALL API のテストで、初回と2回目のログインでのユーザーの作成と再利用、未ログインでの 401、CSRF トークンの無いログアウトの拒否、ログアウトでのセッションの削除を、実際の Discord に接続せずに検証しなければならない。
- THE system SHALL Playwright（Chromium）の e2e テストで、API の応答を差し替えて、未ログインのログイン導線、ログイン中の表示名とログアウト、認証状態を取得できないときにゲストの機能を使えることを検証しなければならない。実際の Discord の認可を通す確認は、ローカルで手動で行う。

## スコープ外
- 本番環境へのデプロイ、独自ドメイン、本番向けの Cookie の設定（Secure 属性など）。区間外の運用作業として、保存機能（010 以降）を使ってもらう前に行う（decisions.md Q5）
- 護石・構成・武器のサーバーへの保存（010・011・013）と、ゲストの端末内の下書きの取り込み（014）
- 表示名の DB への保存とアバター画像の表示（decisions.md Q55）
- Discord 以外のログイン手段と、メールアドレスの取得
- アカウントの削除、Discord との連携の解除、他の端末のセッションの一覧と一括ログアウト
- 画面の英語対応（004 decisions.md Q4 のまま）

## 契約差分
- 追加: GET /api/auth/me（res: 現在のユーザーの表示名。未ログインは 401）
- 追加: POST /api/auth/logout（CSRF トークン必須。res: 204。セッションを無効にする）
- 追加: スキーマ CurrentUser（displayName）・ProblemDetail（401 などのエラー応答。`common`）
- 契約に載せない: Discord の認可の開始（`/api/oauth2/authorization/discord`）と戻り（`/api/login/oauth2/code/discord`）。ブラウザの画面遷移で使う Spring Security のリダイレクトで、fetch で呼ぶ API ではないため
- 追加: スキーマ users(id, discord_id, created_at, updated_at)・Spring Session JDBC のテーブル（`spring_session` 系）。項目の確定は区間 B で行う

## 影響範囲
触る領域: api, web, contracts
常時許可外の変更予定:
- `apps/api/build.gradle.kts`（Spring Security・OAuth2 Client・Spring Session JDBC のスターターと、そのテスト用のスターターを追加する）
- `design/tech-stack.md`（導入した Spring Security・OAuth2 Client・Spring Session JDBC の版の実測を記録し、「後の機能で導入するもの」の表を更新する）
- `README.md`（ローカルで Discord アプリを登録し、リダイレクト URI と環境変数を設定する手順を書く）
- `design-system/skillweave/MASTER.md`（区間 B で決めるヘッダーのログイン・ログアウトの部品を足す）

## 依存する機能ID
- 004
