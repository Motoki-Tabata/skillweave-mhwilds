# 教訓と canon 改修要求の永続化

`tasks/lessons.md` は、canon への改修要求と作業の教訓を永続化する唯一の台帳である。

1. **台帳は1つ**: `tasks/lessons.md` のみ。git 追跡対象とする（`.gitignore` に入れない）。反映済みの項目は canon の配置時に `lessons-ledger` が台帳から削除する（手作業で消さない。履歴は commit・PR 本文・`git log` で追う）。台帳の先頭には「# 教訓台帳」の見出しと案内文があり、項目（`## ` で始まる行）は起票のたびに末尾へ足す。
2. **即時記録**: メインは、教訓・矛盾を発見したその場で（ブランチを問わず・`feat/` 上でも）台帳に追記し、次のゲートのコミットに含める。ワーカーは台帳を書けない（許可フォルダ外）。完了報告の「教訓候補」に書かせ、メインが起票する。まとまりきらない候補は handoff の「未起票の教訓」に置き、区間の終わりまでに起票するか、持ち越す理由を書く。

## 軽量書式

```
## YYYY-MM-DD <1行の要約>（機能NNN・区間X）
- 種別: 矛盾是正 | 規律昇華
- 何が起きたか: <1〜3行。一次情報の所在（コミット・ファイルの節）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

区間の外の作業で起票するときは、末尾を「（<作業の名前>・区間外）」とする。

## 行き先の選定基準

| 領域 | 行き先 |
|---|---|
| Spring Boot / Testcontainers / Flyway / JPA | `.claude/rules/api-spring.md` |
| pnpm の依存・workspace・サプライチェーン設定 | `.claude/rules/pnpm-workspace.md` |
| Vue / TypeScript / lint・テスト（単体・E2E） | `.claude/rules/web-vue.md` |
| ソルバー（`packages/solver`） | `.claude/rules/solver.md` |
| マスターデータのパイプライン（`packages/data`） | `.claude/rules/data.md` |
| テスト固定値・シークレット検査（gitleaks） | `.claude/rules/secret-scan.md` |
| コンテナ基盤・PostgreSQL ボリューム方式等 | `.claude/rules/docker-infra.md` |
| 契約運用 | `.claude/rules/contracts-first.md` |
| 薄仕様の直接編集 | `.claude/rules/specs-authoring.md` |
| DB 命名・型・監査カラム | `.claude/rules/data-model.md` |
| UI 設計標準（フォントスケール等） | `.claude/rules/ui-design.md` |
| 技術スタック選定（依存追加・バージョン変更） | `.claude/rules/tech-stack.md` |
| 調査・判断の規律 | `.claude/skills/tsod-workflow/references/judgment.md` |
| 区間の運用・ブランチ・コミット・handoff | `.claude/skills/tsod-workflow/` |
| 区間ごとの手順 | 各区間コマンド（`.claude/skills/tsod-spec/` ほか） |
| 書込範囲・ワーカーへの委譲 | `.claude/skills/impact-scope/`・`.claude/skills/tsod-build/` |

行き先の `.claude/**` は canon の管理下であり、対象側を直接編集せず、canon への要求として `tasks/lessons.md` へ書く（[canon-boundary.md](./canon-boundary.md)）。
