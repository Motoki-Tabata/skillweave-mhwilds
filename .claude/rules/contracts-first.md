---
paths:
  - contracts/**
---

# 契約ファースト運用（`contracts/`）

契約の規約（命名規則・`x-swv-status` 機構・配置ルール）の正は [`contracts/README.md`](../../contracts/README.md)。本ファイルは規約本文を再掲せず、要点だけを示す。

- `contracts/openapi.yaml` が契約の正（source of truth）。`apps/api` の `./gradlew contractTest` が実装と突合し、Web は `pnpm contract:types` で型を生成する（手書きしない）。
- 型の再生成（`pnpm contract:types`）は web-agent の責務で、生成差分は同じ領域のコミットに含める（コミットはメインが積む）。contract-agent は `contracts/**` だけを書き、`apps/web` の生成型には触れない。
- フォルダ分け: パスは `contracts/paths/<ドメイン>/`、スキーマは `contracts/components/schemas/<ドメイン>/` に置く。ドメインは URL の第1セグメント。複数ドメインで共有する部品は `schemas/common/`、`components/responses/` はフラット。スキーマ名は basename 由来で、フォルダを移しても変わらない。新しいドメインを足すときは `paths/<ドメイン>/` と `schemas/<ドメイン>/` を同時に作る。規約の正は `contracts/README.md`「フォルダ分けの規約」節。
- ファイル命名規約: 1パス＝1ファイルとし、パスからそのまま命名する。パスパラメータは `-by-` を付けずパラメータ名をそのままハイフン連結する（例: `/api/charms/{id}` → `paths/charms/charms-id.yaml`）。詳細の正は `contracts/README.md`「1パス=1ファイルの命名規約」節。
- 契約を実装より先に固める理由: 未実装オペレーションは `x-swv-status: draft` を付けて契約テストの対象から外せるため、実装が追いつく前に契約を書き切ってレビューできる。`draft` の外し方の詳細は `contracts/README.md` を参照する。
- **draft の回収は機構で担保される**: `x-swv-status: draft` が残ったまま実装パスが存在すると `contractTest`（`OpenApiContractTest`）が失敗する。回収の正の運用は `contracts/README.md`「`x-swv-status: draft` の意味」節、失敗条件を検出するテスト実体は非管理の `OpenApiContractTest`（本ファイルでは手順を転記しない）。
- 業務ルール（例: 「護石のスキルは最大3種類」）はここに書かない。EARS 受入基準の正は引き続き `specs/NNN-<slug>/spec.md` であり、契約側の `description` は当該エンドポイント1本の入出力挙動に閉じた要約に留める。両者が矛盾した場合は `spec.md` が正。`description` は日本語で書いてよいが、`refs specs/...` の併記を必須とし、複数機能にまたがる業務ルールを転記しない。`description` の書き方（固定テンプレート）は `contracts/README.md`「`description` の書き方（固定テンプレート）」節が正であり、本ファイルへテンプレート本文・Markdown 記法・禁止事項を再掲しない。
- spec.md「影響範囲」節（常時許可外の変更予定だけを書く）の定義と、`contracts/**` を書けるのが contract-agent だけ（メインの小修正を除く）であることの正は [`.claude/skills/impact-scope/SKILL.md`](../skills/impact-scope/SKILL.md)。
- `contracts/redocly.yaml` は `extends: recommended-strict` を維持し、`pnpm contract:lint` の警告0件を維持する。ルールを `off` にするときは理由コメント必須、緩いプリセットへ戻さない。認証不要エンドポイントのみ `security: []` を明示する。
- **実装済みオペレーションへの status code 追加は draft で保護できない**: `x-swv-status: draft` はオペレーション全体を契約テストの突合から外すため、既存オペレーションに status code だけを足す変更には付けない。契約と実装を同じ作業単位で揃える（contract-agent の完了から api-agent の完了までの間、`responseStatusCodesMatchImplementation` が落ちるのは想定内。実行順の正は `.claude/skills/tsod-build/SKILL.md`）。
