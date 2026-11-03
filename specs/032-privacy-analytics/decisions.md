# 032 privacy-analytics の決定記録

## Q141（決定: 2026-11-03）
- 問い: `/privacy` の「アクセス解析と広告は入れていません」が本番の事実と合わない。Cloudflare が Web Analytics のビーコン（`static.cloudflareinsights.com/beacon.min.js`）を HTML に挿入し、ブラウザが `/cdn-cgi/rum` へ URL と計測値を送る（2026-11-03 に実測）。ユーザーは Web Analytics を残して表記を直すと決めた（2026-11-03）。030 の AC-9 の取り消しと、`PrivacyView.vue` と `PrivacyView.spec.ts` の修正が要る。AC-9 は Cookie の用途と広告を入れていないことも定めているので、取り消すのはアクセス解析の部分だけにするかを決める。Cloudflare のプライバシーポリシーは顧客のサイトに適用しないと書き、読めた範囲に Web Analytics の名前が無いので、`PrivacyView.vue` の「Cloudflare での扱いは」のリンクも見直す。ビーコンの設定元はダッシュボードで見ていない（Web Analytics の自動設定と推定）（仮: 032 privacy-analytics として起票し、URL を配る前にマージしてデプロイする。IP の保存は公式資料に記載が見つからないので断定しない）
- 決定: Web Analytics を残し、`/privacy` に新しい節を足して次の事実を書く。030 の AC-9 のうち、取り消すのはアクセス解析を入れていないとする部分だけで、Cookie の用途と広告を入れていないことは残す。

  | 項目 | 書くこと | 確かめた先 |
  |---|---|---|
  | 目的 | アクセス数と表示の速さを知るため | ユーザーの決定（2026-11-03）。訪問数の集計は Cloudflare Web Analytics の公式資料 |
  | 送る内容 | 開いたページの URL と読み込みの時間などの計測値 | 本番の `/cdn-cgi/rum` の通信（2026-11-03 に実測） |
  | 集計する項目 | 国・ページのパス・参照元・ブラウザ・OS・端末の種類 | https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/ |
  | IP アドレス | この通信でも Cloudflare に届く。保存については書かない | HTTP の通信の事実。保存は公式資料に記載が無い |
  | Cookie と localStorage | Cloudflare の説明では、この計測に使わない | https://www.cloudflare.com/web-analytics/ （未ログインの状態で Cookie・localStorage・sessionStorage が空なことを実測） |
  | 保持 | 詳細なデータは 7 日間保持され、その後は約 10% に集約される | https://developers.cloudflare.com/web-analytics/faq/ |
  | リンク | Cloudflare Web Analytics の説明（https://www.cloudflare.com/web-analytics/） | 同上 |

  クエリ文字列の扱いは書かない。アクセスログの節（030 の AC-10）の Cloudflare のプライバシーポリシーへのリンクは残し、導入文を「Cloudflare の処理については、プライバシーポリシーの「End Users」の項を見てください。このポリシーは個々のサイトの扱いを定めるものではありません」の趣旨に直す。ビーコンの設定元の確認は Q140 (d) に残す。
- 理由: 表記を事実に合わせることが目的で、Cookie の用途と広告については事実が変わっていない。目的を表示の速さだけに限ると、訪問数も集計する実態より狭く読める。IP アドレスは、届くと書かないと送られないと誤解されるので Google Fonts の節と同じ扱いで書くが、保存は資料で確かめられないので断定しない。保持期間は公式資料に食い違いが無く、確かめたものは載せるとした 030 decisions.md Q135 の方針に合う。クエリ文字列は 1 回の実測と「ログに残さない」の記述しか根拠が無く、送信の有無を断定できない。Cloudflare のプライバシーポリシーは顧客のサイトには適用しないと書く一方で、「End Users」の項に顧客のサイトの訪問者の処理（IP アドレスを含む）を書いているので、リンクの価値はあるが「Cloudflare での扱いは」は言い過ぎになる。
