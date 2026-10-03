# メインの直接修正の基準（唯一の正）

メイン（メインセッション）が、ワーカーを起動せずに自分でファイルを直してよい範囲と、メインの書込区分を定める。メインの書込は書込ガードの対象外（advisory）なので、この基準と、reviewer-agent の差分分類、ゲート D-1 での人間の `git diff` 確認が担保になる。

## 直接修正してよいもの

機械的な定型だけ。

- draft 行（`x-swv-status: draft`）の削除
- チェックボックスの更新
- handoff や `tasks/lessons.md` の記録
- 1行の定数化やリネーム程度

## ワーカーに直させるもの

ロジック・テストの中身・複数ファイルにわたる修正は、担当領域のワーカーを新しく起動して直させる（前回の会話でなく、差分と修正指示だけを渡す）。Sonar の是正も同じ扱い。判断を伴う修正をメインが抱え込むと、書込ガードの外で設計判断が通ってしまうため。

## 直接修正したとき

- 必ずフォーマッタを通す。api は `apps/api` で `./gradlew spotlessApply`、web・solver・data はリポジトリ直下で、直したファイルを指定して prettier（`pnpm exec prettier --write <ファイル>`）を実行する。`pnpm format` は全パッケージの `src/` を書き換えるので、直したファイル以外を巻き込まないよう、ファイル指定で実行する。
- 修正の直後、同じターンで handoff の「メインの直接修正」表に1行追記する（後でまとめて書かない）。ゲート D-1 ではこの表をそのまま提示する。

## メインの書込区分

| 区分 | 対象 | 条件 |
|---|---|---|
| (i) 成果物 | `specs/**`（handoff を含む）・`tasks/lessons.md` | 各区間の手順どおり。`tasks/lessons.md` はブランチを問わず発見時に即記録してよい |
| (ii) 宣言駆動の例外（共有構成ファイル） | 列挙は `.claude/skills/impact-scope/SKILL.md` の「共有する構成ファイル」節 | 下の許可条件 |
| (iii) 直接修正 | 任意のワーカー領域 | 上の「直接修正してよいもの」に限る |
| (iv) それ以外 | 下の「常に人間の明示指示を要するもの」・canon 管理下 | 書かない |

`tasks/lessons.md` の反映済み項目の削除は、メインでなく、canon の配置時に `lessons-ledger` が行う。台帳から項目を手で消さない。

### 共有構成ファイル（宣言駆動の例外）

どのワーカーの常設スコープにも含めず、メイン専有にする。常設にすると、薄仕様にも plan にも無い依存追加や設定変更が、ワーカーの判断だけで通ってしまうため。列挙は転記しない（`.claude/skills/impact-scope/SKILL.md` の「共有する構成ファイル」節が唯一の正）。上表に無いが「ビルド・実行時設定」に当たるものも同じ扱い。

| 項目 | 内容 |
|---|---|
| 許可条件 | (a) plan.md「常時許可外の変更」に列挙され、ゲート C-1 で承認済み → メインが、ワーカーへの委譲より前に書く。(b) plan に無く実装中に必要になった → ワーカーは書かずに停止して報告する。メインが AskUserQuestion でユーザーに提示し、承認後に書く。handoff の「PR 本文に必須の記載事項」へ記録する |
| 強度 | ワーカーに対しては deterministic（Write/Edit に加え、Bash 経由の書換・`pnpm add` 等も hook が deny する）。メイン自身の書込は advisory |
| 代わりの担保 | ゲート C-1 での `spec-check.mjs --compare-plan` の出力、reviewer-agent の差分分類、ゲート D-1 での人間の `git diff` 確認 |

### 常に人間の明示指示を要するもの

区間の中ではメインも書かず、ユーザーに提示する。

- リポジトリ直下の `pnpm-workspace.yaml`（サプライチェーン設定の集約先）
- `apps/api/gradle/wrapper/**`
- `docker/init/01_init.sql`（追記禁止）
- 検査機構: `.githooks/**`・`.gitleaksignore`・`sonar-project.properties`・`docker/compose.sonar.yaml`・`scripts/**`・`.github/workflows/**`
- リポジトリ直下の `README.md`

`.claude/**` と `CLAUDE.md` は canon の管理下で、誰も書かない。変更要求は `tasks/lessons.md` に起票する（[canon-boundary.md](./canon-boundary.md)）。
