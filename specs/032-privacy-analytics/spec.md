# 032: privacy-analytics

## 目的 / ユーザーストーリー
利用者として、SkillWeave を使う前に、アクセス解析で何が Cloudflare へ送られ、何に使われるかを `/privacy` で読みたい。自分のデータの扱いを正しく判断するためである。運営者として、本番の事実と合わない「アクセス解析は入れていません」を、URL をフレンドへ配る前に直したい。

用語:
- アクセス解析の節: `/privacy` に足す Cloudflare Web Analytics の説明。書く事実の正は decisions.md Q141 の表で、確かめていないことは書かない。

## 受入基準（EARS記法）
- AC-1: THE system SHALL `/privacy` にアクセス解析の節を設け、アクセス数と表示の速さを知るために Cloudflare Web Analytics を使っていることを書かなければならない（decisions.md Q141）。
- AC-2: THE system SHALL アクセス解析の節に、ブラウザが開いたページの URL と読み込みの時間などの計測値を Cloudflare へ送ること、Cloudflare が国・ページのパス・参照元・ブラウザ・OS・端末の種類を集計することを書かなければならない。
- AC-3: THE system SHALL アクセス解析の節に、この通信でも IP アドレスが Cloudflare に届くことを書かなければならない。IP アドレスの保存の有無とクエリ文字列の扱いを書いてはならない（decisions.md Q141）。
- AC-4: THE system SHALL アクセス解析の節に、Cloudflare の説明ではこの計測に Cookie と localStorage を使わないこと、詳細なデータは 7 日間保持され、その後は約 10% に集約されることを書かなければならない。
- AC-5: THE system SHALL アクセス解析の節から、`https://www.cloudflare.com/web-analytics/` へ新しいタブで開くリンクを出さなければならない。
- AC-6: THE system SHALL アクセス解析を入れていないとする文を表記から除かなければならない。これは 030 の AC-9 のアクセス解析の部分を取り消すものである。Cookie `SESSION`・`XSRF-TOKEN` の用途と、広告を入れていないことは書き続けなければならない。
- AC-7: THE system SHALL アクセスログの節の Cloudflare のプライバシーポリシーへのリンクを残し、導入文を、Cloudflare の処理についてポリシーの「End Users」の項を見るよう案内し、このポリシーが個々のサイトの扱いを定めるものではないと示す文にしなければならない。これは 030 の AC-10 の導入の文言だけを変えるもので、記録される項目・Google Cloud の 30 日・Cloudflare の期間を書かないことは変えてはならない（decisions.md Q141）。
- AC-8: WHEN 表記の文面を変えたとき THE system SHALL 最終更新日を、変えた日の日付にしなければならない。
- AC-9: THE system SHALL Web の単体テストで AC-1〜AC-8 を検証し、030 の AC-9 と AC-10 のテストをこの仕様に合わせなければならない。
- AC-10: THE system SHALL Playwright（Chromium）の e2e テストで、`/privacy` を開くとアクセス解析の節の見出しと AC-5 のリンクが表示されることを検証しなければならない。

## スコープ外
- Web の再デプロイと、本番の設定・ブラウザの通信先と表記の照合（`tasks/20261103-launch/plan.md` の C5・C7、Q140 (d)）
- Cloudflare Web Analytics の設定の変更（EU の訪問者の除外、手動のスニペットへの切り替え、停止）
- 同意の取得（同意のボタン・Cookie のバナー）
- 030 の spec.md・decisions.md の書き換え（AC-9 の取り消しは本仕様と decisions.md Q141 に記録する）
- 表記の法的な十分性の確認

## 契約差分
- なし（画面の文面だけを変える）

## 影響範囲
触る領域: web
常時許可外の変更予定: なし

## 依存する機能ID
- 030
