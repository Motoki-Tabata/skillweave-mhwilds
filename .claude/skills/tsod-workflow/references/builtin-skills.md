# 組込み Skill の依存一覧（唯一の正）

Claude Code の組込み Skill は、提供側の都合で起動の可否や引数が変わりうる。依存するものを1か所に集め、使えないときの代わりの手順の所在を示す。各項目は「使う場面・起動主体・前提・代わりの手順の所在・Claude Code の更新時に確かめる点」で書く。

## `/design`（Claude Design。research preview）

- 使う場面: 区間 B の画面設計。
- 起動主体: ユーザーだけ。モデル・サブエージェントからの起動は確かめていないので、手順に組み込まない。メインはユーザーに `/design <説明文>` の実行を依頼する。
- 前提（すべて満たすときだけ使える）:
  - Claude Code v2.1.265 以降。
  - Pro・Max・Team・Enterprise のいずれかのプラン。
  - claude.ai アカウントでのログイン（API キー認証は使えない）。
  - Anthropic API を使っていること（Bedrock・Vertex・Foundry は使えない）。
  - 組織が Design を無効にしていない。
  - CMEK・HIPAA・ZDR が無効。
- キャンバスの公開範囲の既定は、作成者だけ。
- 代わりの手順: `.claude/skills/tsod-screen-table/SKILL.md`「画面設計」節の「使えないとき」（前提を満たさない、または起動できないときは、キャンバス無しで `screen-design.md` を正として進める）。
- 更新時に確かめる点: ユーザーが `/design <説明文>` を実行して、キャンバス URL が返るか。

## `/code-review`

- 使う場面: 区間 D のレビューの補助（必須の関門ではない）。
- 引数: `[effort] [--fix] [--comment] [--post] [target]`。target にコミット範囲を渡す（公式の報告。この対象での起動は確かめていない）。
- 起動主体: モデル。拒否されたらユーザーに依頼せず、省く。
- 代わりの手順: `.claude/skills/tsod-build/SKILL.md`「レビュー」節の「使えないとき」（reviewer-agent の所見だけで受入判定する）。
- 更新時に確かめる点: target に ref range を渡せるか。拒否されないか。

## `/simplify`

- 使う場面: 区間 D の補助（任意。メインが不要と判断すれば使わない）。引数は `[target]`。
- 代わりの手順: 使わない（必須の工程に含めない）。

## `/security-review`

- 使う場面: 区間 D の補助。認証・認可・入力検証に触れる機能だけ。
- 引数・前提: 引数なし。origin が必須。
- 起動主体: ユーザー（メインが実行を依頼する）。モデルからの起動可否は確かめていない。
- 代わりの手順: reviewer-agent のチェックリストのセキュリティ項目で判定する。

## `/run`

依存しない。起動の可否と引数が確かめられていないため、手順に使わない。

## `/fewer-permission-prompts`

- 使う場面: 区間の外の保守で、ユーザーが実行する。
- 扱い: 結果を `.claude/settings.json` に入れる前に、push・merge・削除を許可リストに入れない方針の範囲に収まるかを確かめる。`.claude/settings.json` は canon の管理対象なので、直接は書き換えず、canon への改修要求として `tasks/lessons.md` に起票する。

## 区間 E

区間 E は組込み Skill に依存しない（定型は `.claude/skills/tsod-ship/scripts/` の自作スクリプトで行う）。
