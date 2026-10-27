# handoff: 009-discord-login
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: 完了
- 次に起動するコマンド: なし
- 推奨モデル: なし
- ブランチ: なし（`feat/009-discord-login`・`docs/009-discord-login-drift` ともマージ・削除済み）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 009-discord-login` | Opus | `feat/009-discord-login` |
| A→B | B | `/tsod-screen-table 009-discord-login` | Opus | `feat/009-discord-login`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 009-discord-login` | Opus | `feat/009-discord-login`（不変） |
| B→C | C | `/tsod-plan 009-discord-login` | Opus | `feat/009-discord-login`（不変） |
| C→D | D | `/tsod-build 009-discord-login` | Sonnet | `feat/009-discord-login`（不変） |
| D→E | E | `/tsod-ship 009-discord-login` | Sonnet | `feat/009-discord-login`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/009-discord-login`・`docs/009-discord-login-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-27 / 6c5429b |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-27 / ecc75ca |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-10-27 / ccc6411 |
| B-2 | テーブル設計（design/・migration） | 承認済み | 2026-10-27 / b118f6f |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-27 / d44b808 |
| D-1 | 実装受入 | 承認済み | 2026-10-27 / 6cb552e |
| E-1 | マージ（PR・CI 緑） | 承認済み | 2026-10-27 / PR #40 |
| E-2 | ドリフト是正と drift PR のマージ | 承認済み | 2026-10-27 / drift PR #41 |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: 1966bba
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: 7bfde21..6f523b5
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 486172d
- その時点の verify の要約行: 総合結果: PASS / Sonar 件数: issue 0 / hotspot 0 / Quality Gate OK（verify.mjs --e2e --sonar）
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| 契約 | contract-agent | 94f5530 |
| web | web-agent | a0e8c83 |
| api | api-agent | 1bf3a41 |
| E2E | e2e-agent | ef63818 |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | 1966bba..486172d | api: DISCORD_* 未設定でも起動する（plan D2・README 違反） | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: 迂回のテストが 400/401/403/404 のどれでも通る（401 と problem+json を要求する） | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: セッション固定（ログイン前後で SESSION が変わる）のテストが無い | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: AuthorizationBypassTest を config/ へ移す | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: 同じ応答に SESSION の Set-Cookie が2本出る | 要判断 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: /error の ERROR ディスパッチが denyAll にかかり 404/500 が 403 に化けるか未確認 | 要判断 | 是正 | 要修正 |
| 1 | 1966bba..486172d | api: local の web-top-url を絶対 URL にした判断（plan 未記載） | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | api: 認可前のセッションも 30 日保持され未認証で行を量産できる | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | api: SecurityConfig の @SuppressWarnings(java:S3330) の抑止に承認の記録が無い | 要修正 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | api/規約: @SuppressWarnings による Sonar 抑止を規約が扱っていない | 起票 | 起票 | 要修正 |
| 1 | 1966bba..486172d | web: md 以上のログインのリンクが outline の見た目になっていない | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | web: 基準幅のメニューからログアウトした後のフォーカス移動のテストが無い | 要修正 | 是正 | 要修正 |
| 1 | 1966bba..486172d | web: ログアウト失敗後にフォーカスを失う | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | web: bfcache 復帰・修飾キー付きクリックで古い戻り先の記録が残る | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | web: 基準幅（360px）の出し分けとヘッダーの収まりを自動で検証していない | 要判断 | ゲートで判断 | 要修正 |
| 1 | 1966bba..486172d | web: ログイン中に端末内データを送らないことの明示テストが無い（保存 API は 010 以降） | 持ち越し | 持ち越し | 要修正 |
| 1 | 1966bba..486172d | web: safeReturnPath がキャッチオールのルートの不在に依存 | 持ち越し | 持ち越し | 要修正 |
| 1 | 1966bba..486172d | web: --e2e-api では既存 e2e のヘッダーにログインのリンクが出る（plan D16 の前提の注記） | 持ち越し | 持ち越し | 要修正 |
| 1 | 1966bba..486172d | 契約: contracts/README.md の 0 件の記述がずれている | 要修正 | 直接修正 | 解消 |
| 1 | 1966bba..486172d | 契約: ProblemDetail の examples が 401 に寄っている | 持ち越し | 持ち越し | 要修正 |
| 1 | 1966bba..486172d | 構成: design/tech-stack.md の表の残骸 | 要修正 | 直接修正 | 解消 |
| 2 | 486172d..7bfde21 | api: 迂回テストの残り（undecodable/unlisted が isIn(400,401,403,404) のまま） | 要修正 | 是正 | 要修正 |
| 2 | 486172d..7bfde21 | api: ERROR ディスパッチのテストを config/ へ移す | 要修正 | 是正 | 要修正 |
| 2 | 486172d..7bfde21 | api: DiscordCredentialsValidator の bean 配線を全体起動のテストで確かめる | 要修正 | 是正 | 要修正 |
| 2 | 486172d..7bfde21 | api: テストのコメントの誤記と実態と合わない記述 | 要修正 | 是正 | 要修正 |
| 2 | 486172d..7bfde21 | api: plan D2 の『既定値を持たない』から空の既定値へ逸脱（意図は達成） | 要判断 | ゲートで判断 | 要修正 |
| 2 | 486172d..7bfde21 | api: 書き直しフィルタが未確定の応答を flushBuffer で早めに確定させる（chunked になりうる） | 要判断 | 持ち越し | 要修正 |
| 2 | 486172d..7bfde21 | api/規約: Boot は未解決の ${VAR} を文字列のまま残す（api-spring.md へ追記候補） | 起票 | 起票 | 要修正 |
| 2 | 486172d..7bfde21 | api: 非同期応答を足すときは SessionCookieRefreshFilter を見直す | 持ち越し | 持ち越し | 要修正 |
| 2 | 486172d..7bfde21 | web: ログインのリンクのクラス列が ui の outline の複製で、outline 変更時に食い違う | 持ち越し | 持ち越し | 要修正 |
| 2 | 486172d..7bfde21 | web: ライトの outline の枠色が MASTER.md の btn-outline（--input）と違う（既存のログアウトも同じ） | 持ち越し | 持ち越し | 要修正 |
| 2 | 486172d..7bfde21 | web: 回1 の F1・F2 は解消 | 要修正 | 是正 | 解消 |
| 2 | 486172d..7bfde21 | 契約/構成: tech-stack.md の残骸・contracts/README.md の記述は解消 | 要修正 | 直接修正 | 解消 |
| 3 | 7bfde21..6f523b5 | api: 回 2 の要修正 R1〜R4 は解消（静的確認。テストの緑は最終検証で確認） | 要修正 | 是正 | 解消 |
| 3 | 7bfde21..6f523b5 | api: DiscordCredentialsValidator の Javadoc が application.yml と食い違う | 要修正 | 直接修正 | 解消 |
| 3 | 7bfde21..6f523b5 | api: /api/auth%2Fme の 400 は Tomcat が返している可能性（コメントが不正確かもしれない） | 持ち越し | 持ち越し | 要修正 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | design/tech-stack.md | 「後の機能で導入するもの」の表の残骸（区切り行・旧データ行・古い注記）を削除 | T2 の書き換えで表の見出しだけを消して残骸が残ったため（reviewer の要修正） |
| D | contracts/README.md | 「現時点でオペレーションは 0 件」の記述を 009 の実装済みオペレーションを踏まえた文に直す | reviewer の要修正（記述が実態とずれた） |
| D | apps/api/src/main/java/io/github/motokitabata/skillweave/security/DiscordCredentialsValidator.java | Javadoc を application.yml の実態（空の既定値）に合わせる（コメントのみ） | 再レビューの指摘（記述が実態と食い違った） |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- ゲート D-1 でユーザーが承認した plan からの逸脱: (1) application.yml の DISCORD_CLIENT_ID・DISCORD_CLIENT_SECRET を既定値なしの ${VAR} から空の既定値（${VAR:}）＋ DiscordCredentialsValidator の起動時検証へ変更（理由: Boot は未解決の ${VAR} を文字列のまま値にして未設定でも起動するため。plan D2 の意図『未設定なら起動に失敗する』は達成）。(2) application-local.yml の swv.auth.web-top-url を http://localhost:5173/ の絶対 URL にした（理由: Tomcat は相対 Location を要求の Host で絶対化し、Vite proxy は Host を localhost:8080 に書き換えるため、相対の / では API 側へ戻る。base の既定は plan D3 どおり /）。
- ゲート D-1 でユーザーが承認した @SuppressWarnings(java:S3330): SecurityConfig の XSRF-TOKEN の Cookie を HttpOnly にしない箇所（二重送信 Cookie は JS から読める必要がある）。理由のコメントはソースにある。抑止の置き場所（sonar-project.properties の multicriteria か @SuppressWarnings か）を規約が定めていない点は、後続の教訓として扱う。
- メインの直接修正: 上の『メインの直接修正』表をそのまま転記すること（design/tech-stack.md・contracts/README.md・DiscordCredentialsValidator の Javadoc）。
- 台帳（tasks/lessons.md）の変更: 区間 D で 3 件起票（未解決の ${VAR}・認可の迂回テストの期待値と ERROR ディスパッチ・並列委譲時の書込フック）。
- 持ち越し（ゲート D-1 で承認）: 認可を始めただけで未ログインのセッションの行が作られ 30 日残る点は、本番公開前に認可の開始時に有効期間を短くして対処する。web の要判断 3 件（ログアウト失敗後のフォーカス喪失／bfcache・修飾キー付きクリックで古い戻り先の記録が残る／360px の出し分けを自動で検証していない）は T8 の手動確認で見て、問題があれば web-agent に再委譲する。そのほかの持ち越し: SessionCookieRefreshFilter が未確定の応答を flushBuffer で確定させる（chunked になりうる。実測していない）、非同期応答を足すときは同フィルタを見直す、ProblemDetail の examples が 401 に寄っている、ログインのリンクのクラス列が ui の outline の複製、ライトの outline の枠色が MASTER.md の btn-outline と違う（既存のログアウトも同じ）、safeReturnPath がキャッチオールのルートの不在に依存、--e2e-api では既存 e2e のヘッダーにログインのリンクが出る。

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 A で新しい教訓は出なかった）
- なし（区間 B で新しい教訓は出なかった）
- なし（区間 C の教訓は tasks/lessons.md に起票した: Spring Boot の版と tech-stack.md の表の食い違い）
- なし（区間 D の教訓は tasks/lessons.md に 3 件起票した。上の PR 本文の記載事項を参照）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 区間 C: Vite の proxy は changeOrigin: true のため、Spring Security が組み立てる redirect_uri の baseUrl が localhost:8080 になる。redirect-uri を application-local.yml で http://localhost:5173/api/login/oauth2/code/discord に固定するか、apps/web/vite.config.ts の変更（常時許可外。spec には未記載）が要るかを plan で決める
- 区間 C: OAuth の戻りとログアウトは Spring Security のフィルタで処理されると springdoc に出ない。POST /api/auth/logout は契約に載せるので、contractTest で突合できる実装の形を plan で決める
- 区間 D: V2__create_spring_session.sql は jar を読まずに書いた Spring Session JDBC の公式スキーマの写し。依存を足した後、jar 同梱の org/springframework/session/jdbc/schema-postgresql.sql と一致することを確かめ、spring.session.jdbc.initialize-schema を never にする

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q5・Q55・Q56・Q57
- B-1 のキャンバス: https://claude.ai/artifact/MXSFJ2jeqERUouS89obzhL（非公開）。基準幅の認証の部品は 44×44px のアイコンとアカウントのメニュー（dropdown-menu を区間 D でメインが CLI で足す）
- 区間 C: 要確認事項の redirect-uri は plan D2（application-local.yml で固定し vite.config.ts は変えない。Host 違いの戻りの成功を api-agent がテストで確かめる）、logout の契約突合は plan D6（@RestController で実装）で決めた。V2 の照合は T1
