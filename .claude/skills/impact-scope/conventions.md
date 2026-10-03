# テストと共有部品の規約（必要時に開く補助資料）

`impact-scope/SKILL.md` から分離した、ガードとは無関係な静的規約。api-test-agent・web-test-agent・solver-test-agent・data-test-agent・e2e-agent・web-agent・reviewer-agent・tsod-spec が節名で参照する。

## テスト配置・命名規約

- **api**（api-test-agent）: `apps/api/src/test/java/` に置く。テストは、検証対象の main クラスと同一パッケージに置く。例外は `contract/`・`support/`・ルート直下の `SmokeTest`・`TestcontainersConfiguration` の4種。列挙外の置き場所が必要なら、停止してユーザーの判断を仰ぐ。
- **web 単体**（web-test-agent）: `apps/web/src/test/<main と同じ相対パス>/<名前>.spec.ts`。`*.test.ts` は使わない。import は `@/` 別名。
- **solver・data**（solver-test-agent・data-test-agent）: `packages/<solver|data>/src/test/<main と同じ相対パス>/<名前>.spec.ts`。`*.test.ts` は使わない。
- **E2E**（e2e-agent）: `apps/web/e2e/<名前>.spec.ts`、補助は `apps/web/e2e/support/`。`apps/web/e2e/` は予約の場所で、e2e を導入する機能で作られる。

各テスト役は本節を適用し、reviewer-agent は本節との突合をチェック項目に持つ（本節を参照し、転記しない）。

**テストは自分が使う前提を自分で作る。** 同一実行内の他のテストクラスが残した状態（起動時処理の投入結果・前のクラスが作った行）を前提にしない。クラス間の実行順は JUnit も Spring も保証せず、`@TestMethodOrder` が効くのはクラス内のメソッド順だけである。起動時処理そのものを検証したいときは、テスト内でその Runner を明示的に実行し、必要な前提（依存する行）も同じテストが用意する。「他のクラスの後片付けのせいで落ちる」テストは、既存のフレーキネスとして申し送るのではなく、その場で自己完結する形に直す。

## 共有部品の扱い

共有部品に必要な機能が無いときは、**共有部品そのものを拡張する**。機能固有名の新規ファイルで同等機能を複製しない。共有部品が自分の許可フォルダの外にあれば、停止して報告する。2箇所以上に現れる UI・契約断片・例外処理は共有部品にする。

共有部品:

- `apps/web/src/main/components/ui/**`: shadcn-vue の CLI 生成物。扱いの正は `.claude/rules/ui-design.md`。予約の場所で、shadcn-vue を導入する機能で作られる。
- `apps/web/src/main/components/common/`: `ui/` を合成した共通部品。ここへ拡張する。予約の場所で、最初の共通部品を足す機能で作られる。
- `apps/web/src/main/lib/http.ts`: fetch ラッパー。API 呼び出しはここを通す（別の HTTP クライアントを足さない）。
- `apps/web/e2e/support/`: E2E の補助（予約）。
- 契約の共有部品: `contracts/` 配下の共通スキーマ・共通レスポンスの置き場（規約は `contracts/README.md`）。
- `packages/solver`・`packages/data` の公開 API（`src/main/index.ts` から export するもの）。web は内部ファイルでなく、この公開 API だけを import する。
- api のテスト支援の共有ヘルパー（`apps/api/src/test/java/` の `support/`）。

表の見出しセルをネイティブの `<th scope="col">` で書く規律は、共有部品の複製に当たらない。その規律の正は `.claude/rules/web-vue.md`（Sonar で繰り返し出るルールの避け方を扱う節）。
