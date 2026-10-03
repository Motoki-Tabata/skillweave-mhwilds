# 依存更新の棚卸し（四半期。`chore/deps-review-YYYYQn`）

メジャー版の更新と、Dependabot の対象外の点検を、四半期ごとにまとめて行う手順。区間 A〜E の外の作業で、`specs/` の機能とは対応させない。**上げる条件・ランタイムの基準・点検の具体は、`design/tech-stack.md` の「更新の方針」節が正**で、ここには転記しない（数値や基準を2か所に書くと、片方だけ古くなる）。この文書は、棚卸しを進める流れと、手順の置き場だけを持つ。

## 流れ

1. **ブランチを切る**: 機能開発の区切りに、`chore/deps-review-YYYYQn`（例: `chore/deps-review-2027Q1`）を `main` から切る。機能ブランチ（`feat/NNN-<slug>`）には混ぜない。
2. **点検する**: `design/tech-stack.md` の「更新の方針」節の「メジャー: 四半期の棚卸しで計画して上げる」の手順1・2に従い、メジャーの差分・非推奨のパッケージ・Dependabot の対象外（`.nvmrc`・`.github/workflows/ci.yml` の `java-version`・compose のイメージのメジャー）を一覧にする。
3. **上げる・見送るを決めて記録する**: 1件ずつ判断する。見送るものは、`design/tech-stack.md` の見送り・是正待ちの一覧に、理由と次に見直す条件を書く。上げると決めたものは、版の選定理由を同文書に残す。
4. **1メジャー1PR で上げる**: 上げるものは、1つのメジャー更新を1本の PR にする。リポジトリ直下の `pnpm-workspace.yaml` の `catalog` の版は、共有する依存を1か所で上げる。
5. **検証する**: `CLAUDE.md` の「Commands」節の表の全段を通す。一括検証は `node .claude/skills/tsod-verify/scripts/verify.mjs`（表との意図的な差は同節に従う）。e2e は未設定の間は SKIP になる。

## 書込の扱い

棚卸しは区間の外なので、区間の中の宣言駆動の例外（plan.md の「常時許可外の変更」とゲート C-1）は使えない。依存定義と `design/tech-stack.md` の更新は、ユーザーが棚卸しを明示的に指示したうえで、メインが行う。リポジトリ直下の `pnpm-workspace.yaml` と `apps/api/gradle/wrapper/**` の変更は、常に人間の明示指示を要する（[direct-edit.md](./direct-edit.md)）。ワーカーは起動しない。

## Dependabot の PR

- パッチ・マイナーのまとめ PR は、区間の外で扱う。CI が緑ならマージしてよい。機能ブランチには混ぜない。
- セキュリティ更新は、棚卸しを待たずに個別に取り込む。
- メジャー更新の PR は、`design/tech-stack.md` の方針で Dependabot からは届かない。届いた場合は、その方針と食い違っているので、マージせずにこの棚卸しで扱う。

## 起票

棚卸しの手順や基準が実態と合わなくなったら、`design/tech-stack.md` の該当節を直す。この文書（`.claude/**`）の変更要求は、`tasks/lessons.md` に起票する（[lessons-guide.md](./lessons-guide.md)）。
