# 012: build-share

## 目的 / ユーザーストーリー
Discord でログインしたプレイヤーとして、保存した構成を URL で友人に渡し、友人がログインせずにその構成を見られるようにしたい。渡した後に元の構成の名前を変えたり削除したりしても、渡した内容は変わらないようにしたい。渡すのをやめたいときは、自分の共有の一覧から取り消したい。

用語:
- 共有: 保存した構成（011）の、作成した時点のスナップショット。名前・作成時のマスターの版・構成の内容・スキーマ版を、サーバーが構成の行から写して持つ（decisions.md Q101）。
- 短縮 ID: 共有の URL に使う、サーバーが採番する base62 の 12 文字の ID。共有の行の ID（クライアントで採番した UUIDv7）とは別に持つ（decisions.md Q89）。
- 有効な共有: 取り消していない共有。1 つの構成につき 1 つまで（decisions.md Q90）。

## 受入基準（EARS記法）
- AC-1: WHILE ログインしているとき WHEN 保存した構成の画面で共有を作ったとき THE system SHALL クライアントで採番した UUIDv7 を共有の ID とし、サーバーが自分の削除していない構成の行から名前・マスターの版・構成の内容・スキーマ版を写した共有を作り、短縮 ID を含む共有の URL を示さなければならない。作成の要求に構成の内容を含めてはならない（decisions.md Q101）。
- AC-2: THE system SHALL 短縮 ID を、暗号論的な乱数による base62 の 12 文字とし、取り消した共有を含む全行で一意にしなければならない。採番が既存の短縮 ID と衝突したときは採番し直し、取り消した共有の短縮 ID を再利用してはならない（decisions.md Q89）。
- AC-3: IF 有効な共有がある構成で共有を作ったとき THEN API は新しい共有を作らずに既存の共有を返さなければならない（decisions.md Q90）。
- AC-4: IF 共有の作成の元の構成が自分の削除していない行に無いとき THEN API は 404 を返し（他のユーザーの構成も 404）、共有の ID が既存の行（自分・他のユーザー・取り消し済みを問わない）と衝突したときは 409 を返して、どちらも共有を作ってはならない（decisions.md Q101）。
- AC-5: WHEN 共有の URL を開いたとき THE system SHALL ログインしていなくても、保存した構成の画面と同じ内容（防具・装飾品・護石・発動スキル・空きスロット・火力・オンだった発動条件）と名前を、011 decisions.md Q63・Q64 の規則で表示しなければならない。作成者の情報を表示してはならない（decisions.md Q102）。
- AC-6: IF 開いた共有のマスターの版が現在のマスターの版と違うとき THEN システムは、両方の版を示して表示が異なる場合があることを知らせ、現在のマスターに無い ID があっても画面を表示しなければならない（011 decisions.md Q67・decisions.md Q102）。
- AC-7: WHEN 共有を作った後に元の構成の名前を変えたり削除したりしたとき THE system SHALL 共有の閲覧の内容を変えず、共有を残さなければならない（decisions.md Q90）。
- AC-8: WHILE ログインしているとき THE system SHALL 自分の有効な共有の一覧を表示し、各共有の URL をコピーし、取り消せるようにしなければならない。元の構成を削除した共有も一覧に表示しなければならない（decisions.md Q90）。
- AC-9: WHEN 共有を取り消したとき THE system SHALL 論理削除（`deleted_at`）にし、取り消し済み・存在しない・他のユーザーの ID でも 204 を返し、他のユーザーの行を変えてはならない。取り消した後は、その構成で新しい共有を作れるようにしなければならない（decisions.md Q101）。
- AC-10: IF 取り消し済み、または存在しない短縮 ID を閲覧したとき THEN API は区別せずに 404 を返し、Web は共有が見つからない旨を表示しなければならない。閲覧の取得に失敗したときは、読み込めなかったことと再読み込みの操作を示さなければならない（decisions.md Q90・Q102）。
- AC-11: THE system SHALL 閲覧の API を管理の API と別のパスに置き、そのパスの GET・HEAD だけを未ログインに許さなければならない。閲覧の応答は名前・マスターの版・構成の内容・スキーマ版・共有の作成日時だけとし、共有の行の ID・元の構成の ID・作成者の情報を含めてはならない（decisions.md Q90・Q101）。
- AC-12: THE system SHALL 共有の作成・一覧・取り消しの API をログインを要するものとし、一覧は自分の有効な共有を ID の降順で全件返さなければならない（ページングしない）。未ログインには 401 を返し、状態を変える要求が CSRF トークンを持たないときは拒否し、他のユーザーの共有を返したり変えたりしてはならない。作成・取り消しの失敗と 401 の画面の扱いは 011 decisions.md Q69 と同じにしなければならない（decisions.md Q90・Q101）。
- AC-13: THE system SHALL 共有を Flyway のマイグレーションで作る `shares` テーブルに保存し、その項目を `design/attributes.yaml` に確定しなければならない。
- AC-14: THE system SHALL API のテスト（Testcontainers）で、作成（構成の行からの写し・既存の有効な共有を返す・404・409）・一覧・取り消し・未ログインの閲覧・取り消し後と不在の 404・元の構成の名前の変更と削除の後も閲覧の内容が変わらないこと・閲覧の応答に含めない項目・他のユーザーの共有の隔離・管理の API の未ログインの 401・CSRF トークンの無い要求の拒否を検証しなければならない。
- AC-15: THE system SHALL Playwright（Chromium）の e2e テストで、API の応答を差し替えて、ログインしているときに保存した構成から共有を作ると URL が示され一覧に出ること、未ログインで共有の URL を開くと構成が表示されること、取り消し済みの共有を開くと見つからない旨が出ることを検証しなければならない。

## スコープ外
- 受け手が共有の構成を自分の構成として保存する操作（decisions.md Q102）
- 共有の有効期限（decisions.md Q90）
- 共有の作り直し（取り消さずに内容を最新の名前で更新すること）（decisions.md Q90）
- 閲覧の API の流量の制限・キャッシュの制御
- Discord などに URL を貼ったときのプレビュー（OGP）
- 検索結果の構成を保存せずに直接共有すること
- 本番環境への公開と、共有の URL を SPA で開くための配信の設定（decisions.md Q71 のとおり区間外の運用作業）
- 構成の件数の上限の見直し（011 decisions.md Q66 のとおり一般公開の前に行う）

## 契約差分
- 追加: GET /api/shares（res: 自分の有効な共有の配列。各要素は id・shortId・buildId・name・createdAt。ID の降順・ページングなし）
- 追加: POST /api/shares（req: id・buildId。res: 201 作った共有、200 既存の有効な共有。404 元の構成が無い・409 ID の衝突・400 ID の形式の違反）
- 追加: DELETE /api/shares/{id}（res: 204。論理削除。冪等）
- 追加: GET /api/shared-builds/{shortId}（未ログイン可。res: 200 name・masterVersion・payload・schemaVersion・createdAt。404 取り消し済み・不在）
- 追加: スキーマ 共有（id・shortId・buildId・name・createdAt）・共有の作成の要求（id・buildId）・共有した構成（name・masterVersion・payload・schemaVersion・createdAt）。構成の内容は既存のスキーマ BuildPayload を使う
- 追加: テーブル shares(id, short_id, user_id, build_id, name, master_version, payload, schema_version, created_at, deleted_at)。項目の確定は区間 B で行う

## 影響範囲
触る領域: api, web, contracts
常時許可外の変更予定: なし

## 依存する機能ID
- 011
- 028
