---
paths:
  - .github/workflows/**
  - .github/dependabot.yml
  - apps/web/wrangler.jsonc
  - apps/web/worker/**
  - release-please-config.json
  - .release-please-manifest.json
  - CHANGELOG.md
---

# デプロイ・リリース・Cloudflare・Neon の要点

正は `design/tech-stack.md` の「本番の構成」節と「リリースと版」節。この規則には要点だけを書き、手順や数値は書き写さない。

- Cloudflare の操作には wrangler（`pnpm --filter @swv/web exec wrangler ...`）を使い、cf CLI は使わない。`apps/web/wrangler.jsonc` があるため。
- Neon の操作には、直下の devDependencies の CLI（`pnpm exec neon ...`）を使う。グローバルの `neonctl` は使わない。接続文字列はパスワードを含むので、チャット・ログ・リポジトリに出さない。
- 本番の Web は `.github/workflows/release.yml` が出す。release-please のリリースの時に自動で出し、出し直しは `workflow_dispatch` で行う。手元の `wrangler deploy` は、ワークフローが使えない障害の時だけ使う。
- `CHANGELOG.md`・`.release-please-manifest.json`・直下の `package.json` の `version` は release-please が書く。手で編集しない。
- 上流の API のオリジンは Worker の secret の `API_ORIGIN` で渡す。`wrangler.jsonc` の `vars` に書かない。
- `.github/workflows/**` のジョブ名（secret-scan・api・web・packages）を変えるときは、`main` の Ruleset の必須チェックも同時に直す。名前が一致しないと PR をマージできなくなる。
- Actions は SHA で固定し、版をコメントで書く。新しく足す Action は 7 日のクールダウンを満たす版にする。
