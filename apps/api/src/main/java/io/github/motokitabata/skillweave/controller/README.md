# controller

REST コントローラの置き場所。

- 1 つのコントローラは `contracts/paths/<ドメイン>/` の 1 ドメインに対応させる（例: `CharmController` は `paths/charms/`）
- 入出力は `dto/request`・`dto/response` を使い、エンティティを直接返さない
- 業務ロジックは書かない（`service/` に置く）
