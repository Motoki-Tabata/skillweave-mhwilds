# service

業務ロジックの置き場所。トランザクション境界（`@Transactional`）はここに置く。

- コントローラから呼ばれ、`repository/` を通して永続化する
- 業務ルールの違反は `common/exception` の業務例外で表す
