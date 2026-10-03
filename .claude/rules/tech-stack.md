---
paths:
  - apps/api/build.gradle.kts
  - apps/api/gradle/libs.versions.toml
  - apps/api/gradle/wrapper/gradle-wrapper.properties
  - package.json
  - pnpm-workspace.yaml
  - apps/web/package.json
  - packages/*/package.json
  - .nvmrc
  - .github/dependabot.yml
  - docker/compose.yaml
  - sonar-project.properties
  - docker/compose.sonar.yaml
---

# 技術スタック選定の要点

正は `design/tech-stack.md`。本ファイルは全文を再掲せず、依存追加・バージョン変更を行う実行時点で思い出すべき要点だけを示す。

- 技術選定（api・web・packages を横断する採用ライブラリとバージョン方針）の正は `design/tech-stack.md` である。本ファイルはその配線であり、版・日数などの数値を転記しない。
- 版を変える前に `design/tech-stack.md` の「更新の方針」節を確かめる。
- 依存を追加・変更する前に `design/tech-stack.md` の該当節を確認し、既存の選定方針（`CLAUDE.md` の憲法を参照）と矛盾しないことを確かめる。
- 本ファイルの `paths:` は「技術選定に触れるファイル群」を指す。単一ディレクトリの glob では技術スタック横断の変更点を捕捉できないため、依存追加・バージョン変更が起きるファイルを個別にリスト列挙している（ブレース展開は使わない）。
- 静的解析（SonarQube）の採否・版の正は `design/tech-stack.md`。実行コマンドの正は `CLAUDE.md`「Commands」節、ワーカーの検証の下限の正は `.claude/skills/tsod-build/SKILL.md`「検証の下限」節（本ファイルへ転記しない）。
