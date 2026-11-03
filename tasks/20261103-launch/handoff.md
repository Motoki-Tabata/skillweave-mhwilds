# handoff: launch

## 現在地
段階2 完了（2026-11-03）。A1・A2 まで完了（PR #87）。
公開までの残りを `plan.md` に整理した。Web は `https://skillweave.app` にデプロイ済みで、`/api/*` は 503 を返す。`/privacy` の「アクセス解析は入れていません」が事実と合わないので、直して再デプロイするまで URL は配らない。

## 次のセッション
- 推奨モデル: Opus（effort medium）
- 最初に打つコマンド: `/flow-*` は使わない。次の文を貼る。

```text
SkillWeave の公開作業の続き。応答は日本語。tasks/20261103-launch/handoff.md と plan.md を全文読み、未完了の最初のタスクから進める。plan.md の「守ること」に従う。
```

- 最初のタスク: B1。始める前に、リポジトリの本体の `main` で `git pull --ff-only` を実行する。機能マップには 031 api-proxy と 032 privacy-analytics を足してあるので（PR #88、`067b18c`）、`/tsod-discover` は不要で、`/tsod-spec 032` から始める。材料は plan.md「B1 の材料」と `specs/open-questions.md` の Q141。B2 は `/tsod-spec 031` から始め、論点は Q130・Q142。

## 判断ログ
- 2026-11-03 段階2: サブセッションに分けず、1 つの進行表で進める（理由: ユーザーの指示）
- 2026-11-03 段階2: `/flow-*` は使わず、`plan.md` と `handoff.md` の書式だけを使う（理由: `tsod-workflow` があるリポジトリでは `/flow-*` が停止し、段階の分け方も運用作業に合わない）
- 2026-11-03 段階2: コードとテストの変更は TSOD で進める（理由: ユーザーの指示）
- 2026-11-03 段階2: Web Analytics を残し、`/privacy` の表記を直す（理由: ユーザーの決定）
- 2026-11-03 段階2: Workers Logs は無効のままにし、必要になったら `wrangler.jsonc` に書いて有効にする（理由: 今の Worker は 503 を返すだけで使い道が少なく、設定をリポジトリに残せる）
- 2026-11-03 段階2: Q136 は URL を配る前には直さず、機能として起票して公開後に扱う（理由: 提案をユーザーが受け入れた。古いタブの問題は再読み込みで解消する見込みで、フレンド公開の規模なら許容できる。古いタブでの再現は未実施）

## レビュー記録

## メモ
- このフォルダは TSOD の作業の邪魔にならないよう、ローカルの `chore/launch-notes` ブランチにだけコミットしてある（push していない。`main` には無い）。読むときは `git show chore/launch-notes:tasks/20261103-launch/plan.md` を使う。更新するときはそのブランチへ切り替える。
- 本番の版は `5b864842-fb1a-4fb1-83a9-73a47d5e00ca`。wrangler はログイン済みで、4.153.0 のまま。
- PR #86 で `design/tech-stack.md` の手順と `tasks/lessons.md` の教訓を `main` に入れた（`e2d7639`）。
