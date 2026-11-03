# 032: privacy-analytics 計画

## スタック
- Web: 既存の Vue・Vue Router・Vitest・Playwright（Chromium）をそのまま使う。外部リンクは既存の `ExternalTextLink`。依存は足さず、版も変えない。

## データモデル
なし

## 決定事項

### 表記（AC-1〜AC-8）
- D1: `PrivacyView.vue` の文面と節の順は `screen-design.md` の「項目定義」「画面構成」のとおりにする。`アクセス解析` の節は `Web フォント` と `アクセスログ` の間に置き、他の節と同じ `section`・`h2Class` で書く。リンクは `ExternalTextLink`。新しい部品は作らない。
- D2: `LAST_UPDATED` は文面を変えた日（実装の環境の `date +%Y/%m/%d`。JST）にする。今の値は 030 が書いた `2026/11/03` で、同じ日に実装するなら値は変わらない。日をまたいだら、実装とテストの固定値（D5）を両方その日に変える。

### 単体テスト（AC-9）
- D3: `PrivacyView.spec.ts` に 032 の `describe` を足し、テスト名は `032 AC-N:` で始める。今の `AC-N:` は 030 の番号なので混ぜない。ファイル冒頭の「030 privacy-notice の AC-…」のコメントに 032 を足す。
- D4: アクセス解析の節の検査は、見出しが `アクセス解析` に完全一致する `h2` の `closest('section')` の中だけで行う。ページ全体には 030 AC-5 の「データベースに IP アドレスは保存しません」があるので、AC-3 の否定をページ全体で検査すると必ず落ちる。AC-3 の否定は、節の本文に `保存` と `クエリ` が無いことで確かめる。AC-5 のリンクも節の中から探し、`href`・`target="_blank"`・`rel="noopener noreferrer"`・「（新しいタブで開く）」を確かめる。
- D5: AC-8 は `最終更新日: <D2 の日付>` を固定値で確かめる（`.claude/rules/web-vue.md` の「テストの期待値と既定のモック」）。
- D6: `h2` の並びを固定値の配列で確かめ、D1 の順を守る。
- D7: 030 のテストを次のように追従する。他の 030 のテストは変えない。
  - `AC-9`: 期待を `広告は入れていません` に変え、`/アクセス解析[^。]*入れていません/` に一致しないことを足す。テスト名から「解析」を外す。AC-6 の `SESSION`・`XSRF-TOKEN` の検査はそのまま残す。
  - `AC-10`: `Cloudflare での扱いは` の行を `Cloudflare の処理については` に直す。切り出しの終端（`を確認してください`）と「数字が無い」の検査はそのまま動く。切り出しの外に出る「このポリシーは個々のサイトの扱いを定めるものではありません」は、ページ全体の `toContain` を全文で確かめ、`「End Users」の項を確認してください` も確かめる。

### e2e（AC-10）
- D8: `apps/web/e2e/privacy-analytics.spec.ts` を足す。e2e は機能ごとに1ファイルなので `privacy-notice.spec.ts` に混ぜない。`**/api/auth/me` を 401 で返して `/privacy` を開き、`getByRole('heading', { level: 2, name: 'アクセス解析', exact: true })` と、`Cloudflare Web Analytics の説明` のリンク（`href`・`target`）が表示されることを確かめる。`privacy-notice.spec.ts` に消す文言の検査は無い（`アクセス解析` の検索で 0 件）ので変えない。

### 確認の範囲
- D9: 実際の起動経路の確認は、e2e（`playwright.config.ts` の `pnpm run build` と `preview`）で行う。ビーコンは Cloudflare が配信のときに挿入するのでローカルでは出ず、本番の通信と表記の照合はスコープ外（launch の C5・C7、Q140 (d)）。D-1 の提示に未確認として書く。

## 常時許可外の変更
- なし
