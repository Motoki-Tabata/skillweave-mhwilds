---
paths:
  - apps/api/**
  - apps/web/**
  - packages/**
  - .gitleaksignore
  - .githooks/**
---

# テスト固定値とシークレット検査（gitleaks）

①パスワード・トークン名の変数に入れるテスト固定値は低エントロピー値にする。
②`.gitleaksignore` の説明コメントに検出値そのものを書かない。
③`.githooks/pre-push`（`git config core.hooksPath .githooks` で有効化）が CI と同じ版で
push 範囲を自動検査するのでこれを正とし、手動で走らせる場合も pre-push と同じ版を使う
（`:latest` を書かない）。

本ファイルが唯一の置き場である。`apps/api/**`・`apps/web/**`・`packages/**` のどの作業でも自動ロードされるため、`api-spring.md`・`web-vue.md` などに同じ節を置かない。

## pre-push の「シークレット検出」表示の読み方
pre-push の gitleaks は docker で動く。docker に接続できないと検査が実行されないまま
「シークレットらしき文字列を検出しました」と表示される（誤表示）。その前に
`permission denied while trying to connect to the docker API` 等の接続エラーが
出ていないかを先に確認する。
