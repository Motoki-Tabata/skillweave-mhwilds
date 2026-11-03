# 030: privacy-notice タスク

順序: T1 → T2 → T3 → T4 → T5。契約の変更は無い（spec §契約差分）。T2 と T3 は互いの出力を前提にしない。

- [ ] T1 [main]           `design-system/skillweave/MASTER.md`「画面骨格」のクレジットのバーの項に、`/privacy` へのリンクとその高さを足す（plan D11）     refs spec §受入基準 AC-2
- [ ] T2 [api-agent]      `SecurityConfig` の `oauth2Login` で認証の詳細を付けないようにし（D1）、`DiscordOAuth2UserService` のコメントを事実に直す（D2）。`SessionPolicyTest` に、セッションの行に接続元のアドレスが入らないことのテストを足し、D1 の前に失敗することを確かめる。既存のテストは書き換えずに通す（D3）（plan D1〜D3）     refs spec §受入基準 AC-12
- [ ] T3 [web-agent]      `/privacy` のルート（D4）、`CreditBar` のリンク（D5）、`PrivacyView.vue` の文面・最終更新日・先頭の表示とフォーカス・外部リンク（D6〜D8）。`PrivacyView.spec.ts` を足し、`App.spec.ts`・`router/index.spec.ts` に確認を足す。テスト用ルーターの追従は、`support/mount.ts` が本物の `routes` を使うので要らない（D9）（plan D4〜D9）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11
- [ ] T4 [e2e-agent]      `apps/web/e2e/privacy-notice.spec.ts` を足す。直接開く・認証の状態の違い・タイトル・フォーカス、フッターのリンクの遷移、幅 360px で切り詰めないこと（plan D10）     refs spec §受入基準 AC-1, AC-2
- [ ] T5 [main]           実際の起動経路での確認: ビルドをやり直して `wrangler dev` で起動し、`/privacy` が 200 で `index.html` を返すことを `curl` で確かめて、handoff の区間メモに記録する。ファイルは書かない。本物の Discord とデプロイした環境は未確認として D-1 の提示に書く（plan D12）     refs spec §受入基準 AC-1, AC-12
