# このプロジェクトの Claude Code カスタマイズ

この README は claude-canon の emit-manifest.js が、生成物の frontmatter と設定から規則で導いたものです。
手で直しても次の配置で置き換わります。

## できること

### Skill

| Skill | 起動のしかた | できること |
|---|---|---|
| `lessons-ledger` | `/lessons-ledger check\|apply [--root <リポジトリ root>] [--accept-additions]` で起動する（自動では動かない） | canon の配置時に tasks/lessons.md（教訓台帳）を照合・更新する。canon が生成時に記録した台帳のスナップショットと配置直前の台帳を突き合わせ（check）、一致すれば配置後に反映済みの項目だけを削除する（apply）。canon の配置手順で実行する。台帳が無いとき・反映済みの項目が0件のときは、何も消さずに正常終了する。 |
| `tsod-build` | `/tsod-build <NNN または NNN-slug>` で起動する（自動では動かない） | 区間 D。handoff でゲート C-1 の承認を確かめてから、tasks.md の担当領域ごとの委譲・一括検証・レビュー・是正・最終検証をゲート D-1 まで進め、承認後に停止して /tsod-ship を案内する区間コマンド。ユーザーが「/tsod-build NNN」と打ったときだけ起動する。文脈が膨らんで中断した区間 D の再開にも使う。 |
| `tsod-discover` | 頼むと自動で使われる。`/tsod-discover [<入力文書のパス>]（省略時は temp/initial-design.md）` でも起動できる | 区間 A〜E の連鎖の外で、新機能の要件（入力文書。既定は temp/initial-design.md）を読み、specs/feature-map.md の機能マップ・機能同士の依存の表と specs/open-questions.md の未確定事項へ追記・まとめる。機能単位の未確定事項の決定は行わない（機能ごとの /tsod-spec NNN の最初の工程で行う）。「要求文書を機能分解して」「機能マップを作って」「機能の依存を整理して」「曖昧点を洗い出して」「新しい要件を機能マップに追加して」等のときに使う。 |
| `tsod-plan` | `/tsod-plan <NNN または NNN-slug>` で起動する（自動では動かない） | 区間 C。承認済みの薄仕様と画面・テーブル設計から plan.md（スタック・データモデル・決定事項・常時許可外の変更）と tasks.md（受入基準を引用し、担当領域を1つずつ付けたタスク分解）を specs/NNN-<slug>/ へ作り、ゲート C-1 で止めて、承認後に停止して /tsod-build を案内する区間コマンド。ユーザーが「/tsod-plan NNN」と打ったときだけ起動する。 |
| `tsod-screen-table` | `/tsod-screen-table <NNN または NNN-slug>` で起動する（自動では動かない） | 区間 B。承認済みの薄仕様から、画面設計（ゲート B-1。UI を持つ機能だけ）とテーブル設計（ゲート B-2。変更がある機能だけ）を進め、handoff に承認を記録して、停止して /tsod-plan を案内する区間コマンド。ユーザーが「/tsod-screen-table NNN」と打ったときだけ起動する。 |
| `tsod-ship` | `/tsod-ship <NNN または NNN-slug>` で起動する（自動では動かない） | 区間 E。handoff でゲート D-1 の承認を確かめてから、PR 作成・CI 完了待ち・CI 失敗の是正・承認後のマージ（手動マージ済みの分岐を含む）・ドリフト検査と drift PR のマージ・ブランチ掃除を進め、handoff を完了にする区間コマンド。ユーザーが「/tsod-ship NNN」と打ったときだけ起動する。 |
| `tsod-spec` | `/tsod-spec <NNN または NNN-slug>` で起動する（自動では動かない） | 区間 A。1機能について、未確定事項の決定（ゲート A-1）と薄仕様 specs/NNN-<slug>/spec.md の作成（ゲート A-2）を進め、handoff に承認を記録して、停止して次のコマンドを案内する区間コマンド。ユーザーが「/tsod-spec NNN」と打ったときだけ起動する。 |
| `tsod-spec-check` | 頼むと自動で使われる。`/tsod-spec-check` でも起動できる | spec.md の数えられる条件（必須6節・受入基準5〜15個・分量・触る領域3つ以下・影響範囲の書式・常時許可外の妥当性）を決定論スクリプトで判定し、判定表をそのまま返す。plan.md との常時許可外の変更の突合（--compare-plan）も行う。ファイルは書かない。「薄仕様をチェックして」「spec.md の体裁を確認して」「受入基準の数を数えて」等のときに使う。 |
| `tsod-verify` | 頼むと自動で使われる。`/tsod-verify` でも起動できる | CLAUDE.md の Commands が定める検証コマンド一式（api・web・packages、必要に応じて e2e・Sonar）を1コマンドで実行し、ステップごとの PASS/FAIL/SKIP/XFAIL（想定内の失敗）と Sonar の件数行だけを返す。担当領域の変更したファイルだけを Sonar で解析する領域モード（--sonar-area）も持つ。「検証を回して」「全部のテストを流して」「CIと同じ検証をして」「担当領域の Sonar を確かめて」等のときに使う。 |

このほかに、内部で参照される知識として `impact-scope`・`tsod-workflow` がある（利用者が起動するものではない）。

### Subagent

| Subagent | 使われ方 |
|---|---|
| `api-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）に従って Spring Boot の API・ドメイン・永続化層を apps/api/src/main/java/** と application*.yml に実装するバックエンドワーカー。tsod-build から、担当タスクが API の本体実装を含むときに委譲される。テストは api-test-agent、マイグレーションは data-model-agent の担当で、本エージェントは書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `api-test-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準ごとに、API のテスト（契約テストを含む）を apps/api/src/test/** に書くテストワーカー。tsod-build から、api-agent・contract-agent の実装の後に委譲される。実装は書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `contract-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の「契約差分」節に従って contracts/** を更新する OpenAPI 契約ワーカー。tsod-build から、担当タスクの影響範囲に契約変更（エンドポイント・スキーマの追加・変更・廃止）が含まれるときに委譲される。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `data-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）に従って、データパッケージの実装を packages/data/src/main/** に書く実装ワーカー。tsod-build から、担当タスクが packages/data の実装を含むときに委譲される。テストは data-test-agent の担当で、本エージェントは書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `data-model-agent` | 次のときメインが自動で使う: 区間 B（tsod-screen-table）でユーザーと合意したテーブル設計を、design/data-model-standard.md・design/attributes.yaml・マイグレーションへ書き出すデータモデルワーカー。tsod-screen-table から、当該機能に必要な最小のテーブル設計が合意された直後に委譲される。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `data-test-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準ごとに、データパッケージのテストを packages/data/src/test/** に書くテストワーカー。tsod-build から、data-agent の実装の後に委譲される。実装は書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `e2e-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準ごとに E2E テスト（Playwright）を apps/web/e2e/** に書くテストワーカー。tsod-build から、web-agent の実装の後に、画面を持つ機能で委譲される。単体テストは web-test-agent・api-test-agent の担当。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `reviewer-agent` | 次のときメインが自動で使う: 実装差分と薄仕様（specs/NNN-<slug>/spec.md）を突合し、受入判定のチェックリストを所見として返すレビューワーカー。ファイルは1バイトも書かない。tsod-build から、実装・テストのワーカーの完了後、ゲート D-1 の提示材料を作るために委譲される。組込みの /code-review の結果には依存せず、単独で判定材料を作る。 |
| `screen-design-agent` | 次のときメインが自動で使う: 薄仕様（spec.md）・UI 設計標準・既存画面を読み、screen-design.md の下書き（画面構成・部品・状態・項目定義）と、ユーザーが /design に渡す説明文の案を応答で返す画面設計ワーカー。tsod-screen-table から、UI を持つ機能の画面設計の下書きが要るときに委譲される。/design は起動せず、ファイルも書かない。再生成のための再委譲は新規起動で行われ、修正要望だけが渡される（前回の会話は前提にしない）。 |
| `solver-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）に従って、ソルバーの本体実装を packages/solver/src/main/** に書く実装ワーカー。tsod-build から、担当タスクがソルバーの実装を含むときに委譲される。テストは solver-test-agent の担当で、本エージェントは書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `solver-test-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準ごとに、ソルバーのテストを packages/solver/src/test/** に書くテストワーカー。tsod-build から、solver-agent の実装の後に委譲される。実装は書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `test-investigator` | 次のときメインが自動で使う: テスト（vitest・Playwright・JUnit）の失敗や flake の原因を、修正せずに再現・反復実行で切り分けて報告する調査専用ワーカー。tsod-build（区間 D）と tsod-ship（CI 失敗の再現）から委譲される。リポジトリのファイルは書かない。直す担当領域は提案するが、自分では直さない。 |
| `web-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準を満たす画面・状態管理・API 結線を apps/web/src/main/** に実装する Web ワーカー。tsod-build から、担当タスクが Web の本体実装を含むときに委譲される。契約は contract-agent、テストは web-test-agent・e2e-agent の担当で、本エージェントは書かない。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |
| `web-test-agent` | 次のときメインが自動で使う: 薄仕様（specs/NNN-<slug>/spec.md）の受入基準ごとに、Web の単体テストを apps/web/src/test/** に書くテストワーカー。tsod-build から、web-agent の実装の後に委譲される。実装と E2E は書かない（E2E は e2e-agent）。再委譲は新規起動で行われ、差分と修正指示だけが渡される（前回の会話は前提にしない）。 |

### Rule

| Rule | 読み込まれる条件 |
|---|---|
| `api-spring` | `apps/api/**` を扱うときに読み込まれる |
| `contracts-first` | `contracts/**` を扱うときに読み込まれる |
| `data` | `packages/data/**` を扱うときに読み込まれる |
| `data-model` | `apps/api/src/main/resources/db/migration/**` を扱うときに読み込まれる |
| `docker-infra` | `docker/**` を扱うときに読み込まれる |
| `pnpm-workspace` | `package.json`・`pnpm-workspace.yaml`・`pnpm-lock.yaml`・`.npmrc`・`apps/web/package.json`・`packages/*/package.json` を扱うときに読み込まれる |
| `secret-scan` | `apps/api/**`・`apps/web/**`・`packages/**`・`.gitleaksignore`・`.githooks/**` を扱うときに読み込まれる |
| `solver` | `packages/solver/**` を扱うときに読み込まれる |
| `specs-authoring` | `specs/**` を扱うときに読み込まれる |
| `tech-stack` | `apps/api/build.gradle.kts`・`apps/api/gradle/libs.versions.toml`・`apps/api/gradle/wrapper/gradle-wrapper.properties`・`package.json`・`pnpm-workspace.yaml`・`apps/web/package.json`・`packages/*/package.json`・`.nvmrc`・`.github/dependabot.yml`・`docker/compose.yaml`・`sonar-project.properties`・`docker/compose.sonar.yaml` を扱うときに読み込まれる |
| `ui-design` | `apps/web/src/main/**` を扱うときに読み込まれる |
| `web-vue` | `apps/web/**` を扱うときに読み込まれる |

## 前提セットアップと配置後の手作業

なし

## 使用例

次の形で起動する（それぞれが何をするかは「できること」の表）。

```text
/lessons-ledger check|apply [--root <リポジトリ root>] [--accept-additions]
/tsod-build <NNN または NNN-slug>
/tsod-discover [<入力文書のパス>]（省略時は temp/initial-design.md）
/tsod-plan <NNN または NNN-slug>
/tsod-screen-table <NNN または NNN-slug>
/tsod-ship <NNN または NNN-slug>
/tsod-spec <NNN または NNN-slug>
/tsod-spec-check
/tsod-verify
```

## 注意と制約

- Rule `api-spring` は `apps/api/**` を扱うときだけ効く。
- Rule `contracts-first` は `contracts/**` を扱うときだけ効く。
- Rule `data` は `packages/data/**` を扱うときだけ効く。
- Rule `data-model` は `apps/api/src/main/resources/db/migration/**` を扱うときだけ効く。
- Rule `docker-infra` は `docker/**` を扱うときだけ効く。
- Rule `pnpm-workspace` は `package.json`・`pnpm-workspace.yaml`・`pnpm-lock.yaml`・`.npmrc`・`apps/web/package.json`・`packages/*/package.json` を扱うときだけ効く。
- Rule `secret-scan` は `apps/api/**`・`apps/web/**`・`packages/**`・`.gitleaksignore`・`.githooks/**` を扱うときだけ効く。
- Rule `solver` は `packages/solver/**` を扱うときだけ効く。
- Rule `specs-authoring` は `specs/**` を扱うときだけ効く。
- Rule `tech-stack` は `apps/api/build.gradle.kts`・`apps/api/gradle/libs.versions.toml`・`apps/api/gradle/wrapper/gradle-wrapper.properties`・`package.json`・`pnpm-workspace.yaml`・`apps/web/package.json`・`packages/*/package.json`・`.nvmrc`・`.github/dependabot.yml`・`docker/compose.yaml`・`sonar-project.properties`・`docker/compose.sonar.yaml` を扱うときだけ効く。
- Rule `ui-design` は `apps/web/src/main/**` を扱うときだけ効く。
- Rule `web-vue` は `apps/web/**` を扱うときだけ効く。
