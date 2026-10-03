# コミット規約（唯一の正）

## メッセージ

```
<type>(<scope>): <summary>, refs specs/NNN-<slug>/spec.md
```

## コミットの単位

「1区間 = 1コミット」にしない。区間の中の成果物・ゲートの単位で積む。ゲートの直前で一度コミットしておくと、差し戻しが起きたときの復帰点が明確になる。PR は1機能につき1本のまま、その中でコミットを積む。

| 区間 | コミットの単位 |
|---|---|
| A | 「未確定事項の決定（decisions.md への移設と open-questions からの削除）」と「薄仕様（spec.md）」を別のコミットにする |
| B | 「画面（screen-design.md）」と「テーブル（マイグレーション・design 文書）」を別のコミットにする |
| C | 「plan.md」と「tasks.md」を別のコミットにする |
| D | 委譲の単位（領域）ごとに1コミット。領域は `.claude/skills/tsod-build/SKILL.md` の領域表（契約・api・web・solver・data の各実装、各テスト、E2E）を指す。是正はレビューの回ごとに別のコミットにする（元の領域のコミットに混ぜない） |
| E | ドリフトの是正と handoff の完了を、drift ブランチのコミットにする |

## handoff との関係

- handoff の更新は、そのゲートのコミットに含める。
- コミットハッシュを handoff に書くための `--amend` はしない。handoff に書けるのは、既に存在するコミットのハッシュだけ（自己参照にしない）。

## レビューの対象

レビューの対象はコミットの範囲（`<base>..<head>`）で指定する（reviewer-agent・`/code-review` とも）。差分は `node .claude/skills/tsod-build/scripts/review-diff.mjs <base> <head>` でファイルに保存して渡す。
