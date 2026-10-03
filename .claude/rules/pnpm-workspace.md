---
paths:
  - package.json
  - pnpm-workspace.yaml
  - pnpm-lock.yaml
  - .npmrc
  - apps/web/package.json
  - packages/*/package.json
---

# pnpm workspace — 既知の落とし穴

## pnpm 10+ の設定はリポジトリ直下の `pnpm-workspace.yaml` から読む
`minimumReleaseAge` 等のクールダウン設定を `.npmrc` に書いても
黙って無視される（`.npmrc` は registry/auth 専用）。

## `allowBuilds` はマップ形式
`パッケージ名: true/false` の形式。リスト形式（`- pkg`）で書くと
エラーにならず、代わりに pnpm が設定ファイル自体をプレースホルダーで
上書きすることがある。`allowBuilds` を書いたら必ず `cat` で中身を確認する。

## 依存の追加・更新はリポジトリ直下で行い、メインだけが行う
workspace は1つの `pnpm-lock.yaml` を共有する。ワーカーが各パッケージのディレクトリで
個別に `pnpm add` すると、lockfile が競合し、書込ガードの許可外のファイルにも触れる。
依存の追加・更新は、メインがリポジトリ直下で行う（宣言駆動の例外）。

## main を取り込んだ後はリポジトリ直下で `pnpm install --frozen-lockfile` を実行する
他のブランチで依存が変わっていると、`node_modules` が lockfile と食い違ったまま検証が走り、
手元だけ通る・手元だけ落ちるという差が出る。`main` を取り込んだ（merge・rebase）ら、
検証の前にリポジトリ直下で `pnpm install --frozen-lockfile` を実行する。

## `ERR_PNPM_TRUST_DOWNGRADE` が出たとき
`trustPolicy: no-downgrade` は、provenance・署名の信頼度が既存より下がる版への更新を拒否する。
出たら次の順に進める。

1. 拒否された版と直前の版の差分・公開者を確かめる。
2. 要求範囲を満たす provenance 付きの版があれば、リポジトリ直下の `pnpm-workspace.yaml` の
   `overrides` で固定し、理由と外す条件をコメントで残す。

provenance 付きの版が無い場合と、PWA 関連の依存の扱いは、ここでは決め打ちしない。
`design/tech-stack.md` の「主な判断」の該当項を正とし、方針が決まるまで当該依存を入れない。
