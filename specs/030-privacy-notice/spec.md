# 030: privacy-notice

## 目的 / ユーザーストーリー
利用者として、SkillWeave を使う前やログインする前に、自分のデータがどこへ送られ、何が保存され、どう消せるかを読みたい。安心して使うか判断するためである。運営者として、URL をフレンドへ配る前（Q88 の公開の作業）に、事実と合った表記を出しておきたい。

用語:
- プライバシーの表記: 新しい画面 `/privacy` に出す日本語の文章。書く事実の正は decisions.md Q135 の表で、確かめていないことは書かない。
- セッションの行: `spring_session` と `spring_session_attributes` の行。

## 受入基準（EARS記法）
- AC-1: WHEN 利用者が `/privacy` を開いたとき THE system SHALL ログインの状態にかかわらずプライバシーの表記を表示し、ページのタイトルを `プライバシー | SkillWeave` にしなければならない。URL を直接開いても表示しなければならない（decisions.md Q132）。
- AC-2: THE system SHALL どの画面でも、フッター（`CreditBar`）に `/privacy` へのリンクを出さなければならない。幅が足りないときも、リンクを切り詰めてはならない（マスターデータの出典の切り詰め方は変えない）。
- AC-3: THE system SHALL 表記に、Web フォントの読み込みで IP アドレス・要求の URL・User-Agent などが Google に届くことを書き、Google Fonts の公式の FAQ へリンクしなければならない。Google 側の用途を断定してはならない（decisions.md Q135）。
- AC-4: THE system SHALL 表記に、Discord のログインで使うのは ID と表示名だけで、メールアドレスを受け取らず、アクセストークンを保持しないことを書かなければならない。保存するのは Discord の ID と、セッションの行に入る表示名（最長 30 日）で、他の項目を保存しないことも書かなければならない。
- AC-5: THE system SHALL 表記に、ログイン中に保存した護石・構成・個体差のある武器・共有がサーバーのデータベース（シンガポールなど日本国外）に保存されること、データベースに IP アドレスを保存しないことを書かなければならない（decisions.md Q135・Q137）。
- AC-6: THE system SHALL 表記に、画面から削除してもデータがデータベース上に残ること、完全な消去は連絡先へ依頼することを書かなければならない（decisions.md Q138）。
- AC-7: THE system SHALL 表記に、共有した構成（名前を含む）は URL を知っていれば誰でも読めること、Discord の ID や表示名は共有の応答に含まれないことを書かなければならない。
- AC-8: THE system SHALL 表記に、端末内に保存するデータ（護石と個体差のある武器の下書き・テーマの設定・ログイン後に戻る画面）を書き、下書きはログインして取り込むとサーバーへ送られることを書かなければならない。装備検索の計算はブラウザ内で行うことも書かなければならない。
- AC-9: THE system SHALL 表記に、Cookie `SESSION`（ログインの維持）と `XSRF-TOKEN`（不正な要求の防止）の用途を書き、アクセス解析と広告を入れていないことを書かなければならない。
- AC-10: THE system SHALL 表記に、Cloudflare と Google Cloud のアクセスログに IP アドレス・User-Agent・参照元・要求の URL などが記録されることがあると書かなければならない。保持期間の数値は Google Cloud の既定の 30 日だけを載せ、Cloudflare は期間を書かず公式のポリシーへリンクしなければならない（decisions.md Q135）。
- AC-11: THE system SHALL 表記に、連絡先 `contact@skillweave.app` を `mailto:` のリンクで出し、表記の最終更新日を書かなければならない（decisions.md Q134）。
- AC-12: WHEN Discord のログインに成功したとき THE system SHALL セッションの行に接続元のアドレスを保存してはならない。ログイン・ログアウト・セッションの延長など、009 discord-login の挙動は変えてはならない（decisions.md Q137）。

## スコープ外
- 物理削除とアカウントの削除の機能（Q139）
- `contact@skillweave.app` の転送の設定、本番の設定と表記の照合（Q140）
- 英語の表記（decisions.md Q133）
- フォントのセルフホスト（`design/tech-stack.md` 判断 6 は変えない）
- 同意の取得（同意のボタン・Cookie のバナー）、利用規約
- ナビゲーションへのリンクの追加、ログインのボタンの横のリンク（decisions.md Q132）
- 存在しない URL の画面（Q136）
- 表記の法的な十分性の確認

## 契約差分
- なし（エンドポイント・スキーマを変えない。AC-12 はセッションの行の中身の変更で、応答は変えない）

## 影響範囲
触る領域: web, api
常時許可外の変更予定:
- `design-system/skillweave/MASTER.md`（画面骨格のクレジットのバーに、`/privacy` へのリンクとその高さを足す）

## 依存する機能ID
- 004, 009
