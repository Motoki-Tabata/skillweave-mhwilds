# ドリフト検査のチェックリスト

区間 E のドリフト検査で、仕様・計画・タスク・コードの乖離を判定する観点。**乖離が見つかったら、仕様側（`spec.md`／`plan.md`）を直す。コードを事後正当化しない。**

各項目に、`drift-scan.mjs` が機械で出すもの（スキャン）と、メインが判断するもの（判断）を分けて書く。スキャンの出力は、判断の入力であって結論ではない。

## 検査項目

- [ ] 実装で変更した設計判断が plan.md に反映されているか（判断）
- [ ] 追加された受入基準が spec.md に反映されているか（判断）
- [ ] 実装しなかった項目が「スコープ外」に移動されているか（判断）
- [ ] spec の受入基準の番号が、tasks.md とテスト（テスト名・コメント）に現れるか。テストの置き場は `apps/api/src/test`・`apps/web/src/test`・`packages/solver/src/test`・`packages/data/src/test`・`apps/web/e2e`（スキャン。番号が現れないものを、判断で「テストが無い」か「番号の書き忘れ」かに分ける）
- [ ] 契約の実体（`contracts/openapi.yaml`）と実装が一致しているか。spec の契約差分のエンドポイントが `openapi.yaml` から辿れ、`x-swv-status: draft` が残っていないか（スキャン。実装との一致は判断）
- [ ] 当該機能で解消した Q 番号が `decisions.md` に移り、`open-questions.md` に残っていないか（スキャン。`specs/open-questions.md` が無ければ「無し」）。横断項目（機能に属さない項目）の棚卸し（判断）
- [ ] `design/` 直下文書の配線不変条件（`design/` 直下の各文書について、`.claude/rules/**` のいずれかがそのパスを「正」として参照しているか。配線の無い `design/` 直下文書はゼロ件。`docs/**` と `design/` 配下のサブディレクトリは対象外）が保たれているか（判断）
- [ ] `.claude/rules/*.md` 各ファイルの `paths:` frontmatter の有無と、`.claude/README.md` のロード条件列の記載が一致するか（判断）
- [ ] 当該機能が実装した節（API・画面・テーブル・ソルバー・マスターデータ・確認事項）すべてに、`temp/` の卒業記録（完了追記または削除）があるか（判断。`.claude/skills/tsod-ship/references/temp-graduation.md` に従う）
- [ ] `temp/` 全体を当該機能 ID で grep し、「未卒業（…機能NNN…）」の予約がすべて回収されているか（スキャン）
- [ ] `specs/feature-map.md` の当該機能の状態が「済」に更新されているか（判断）
- [ ] リポジトリ直下 `README.md` の「現在の状態」記述が実態と一致するか（判断）
- [ ] 同 README のディレクトリ構成記述が実在構成と一致するか（判断）
- [ ] `design/**` に時点依存の記述（「現在は未実装」等）が残っていないか（判断）
- [ ] `design/tech-stack.md` の版数が `apps/api/gradle/libs.versions.toml`・各 `package.json`・`pnpm-workspace.yaml` の `catalog`・`docker/compose.yaml` の実版と一致するか（判断）
- [ ] 全 Markdown の相対リンクと節見出し参照の参照先が実在するか（判断）
- [ ] `CLAUDE.md`「Commands」の表・`verify.mjs` の実行計画・`ci.yml` の `run:` 行が一致するか。`CLAUDE.md` に列挙された「意図的な差」以外は不一致とみなす（スキャン。差の妥当性は判断）。e2e を CI に足した機能では、`ci.yml` の e2e ジョブ・`apps/web` の `test:e2e` と `e2e/`・表の e2e の行が揃っているか
- [ ] `.claude/README.md` の Subagent 一覧と `.claude/agents/` の実在が一致するか（スキャン）
- [ ] `specs/NNN-<slug>/handoff.md` のゲート行がすべて承認済みまたは該当なしで、「未起票の教訓」「要確認事項」が空か、持ち越し先が書かれているか（判断）
- [ ] handoff の「現在地」が完了の定型（次に起動するコマンド: なし・推奨モデル: なし・ブランチ: なし）になっているか、「メインの直接修正」表が PR 本文へ転記されているか（判断）

## 手順

1. `node .claude/skills/tsod-ship/scripts/drift-scan.mjs NNN` を実行し、出力されたチェックリストのファイルを読む（要約の件数が0でも、「判断」の項目は残る）。
2. マージ済みの差分と `specs/NNN-<slug>/{spec.md,plan.md,tasks.md}` を突合する。
3. 上の全項目について、乖離の有無を確かめる。
4. 乖離が見つかった項目は、`spec.md`／`plan.md` を実装の実態に合わせて更新する（例: 追加の設計判断を「決定事項」に足す、追加した受入基準を EARS 文で追記する、実装しなかった項目を「スコープ外」へ移す）。
5. 更新内容をユーザーに提示する（ゲート E-2）。
