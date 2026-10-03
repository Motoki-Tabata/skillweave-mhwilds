# contracts — API 契約の単一実体

この YAML が **契約の正（source of truth）**。API（apps/api）の実装から生成される `/v3/api-docs`
（springdoc）ではなく、この YAML が正しい。apps/api の contract テスト（`./gradlew contractTest`）が
実装をこの YAML と突合し、ズレていれば CI を落とす。

Web（apps/web）はここから型を生成して使う（`pnpm contract:types`）。API の型を手書きしない。

## なぜ apps/api の外に置くか

契約は API だけでなく Web の型生成も参照する。`apps/api/` 配下に置くと Web が
`../api/src/...` を相対参照することになり、所有が非対称になる。ここに置くことで
TSOD（`docs/method/TSOD-薄仕様オーケストレーション開発.md`）の Contract Agent の書き込みスコープを
このディレクトリ 1 つに閉じられる。

## ディレクトリ構成

```
contracts/
├── openapi.yaml                ← ルート。info/servers/tags と、paths の $ref 一覧だけを持つ
├── paths/<ドメイン>/            ← 1 パス = 1 ファイル（HTTPメソッドをキーに持つ Path Item）
│   └── charms/                   例: paths/charms/charms-id.yaml（GET /api/charms/{id}）
├── components/
│   ├── schemas/<ドメイン>/      ← リクエスト/レスポンスのボディ形状（ドメインは paths と同じ）
│   │   └── common/               ← ドメインをまたいで使う部品（例: ProblemDetail）
│   └── responses/               ← 使い回すエラーレスポンス（400・401 等。フラットのまま）
└── redocly.yaml                 ← lint ルール設定
```

## フォルダ分けの規約

- `<ドメイン>` は URL の第1セグメント（`/api/` の直後）で決める（`/api/builds/{id}/shares` → `builds`）。
  openapi.yaml の `tags` は表示用の分類であり、フォルダ分けには使わない。
- `components/schemas/<ドメイン>/` には、そのエンティティを主に扱う API のドメインのフォルダへ置く
  （例: `CharmSummary` は `charms/`。ビルドの応答が参照していても移さない）。
  複数ドメインから使う汎用部品だけを `common/` に置く。
- スキーマ名はファイルの basename（拡張子を除く）で決まり、Web の生成型（`apps/web/src/main/lib/api/schema.ts`）の型名になる。
  フォルダを移すだけなら型名は変わらない。basename は全ドメインで一意に保つ。
- 新しいドメインを足すときは、`paths/<ドメイン>/` と `components/schemas/<ドメイン>/` を同時に作る。

## 1パス=1ファイルの命名規約

- ファイル名はパスからそのまま作る: `/api/charms` → `paths/charms/charms.yaml`
- パスパラメータを含む場合はパラメータ名をそのままハイフンでつなげる:
  `/api/charms/{id}` → `paths/charms/charms-id.yaml`、`/api/builds/{id}/shares` →
  `paths/builds/builds-id-shares.yaml`。`-by-` は付けない。
- 1 ファイルの中に同じパスの全 HTTP メソッド（GET/POST/...）をまとめる（Path Item Object の単位）
- `components/parameters/` は現在使っていない。共通のクエリ/パスパラメータが要る機能で初めて作る。

## `x-swv-status: draft` の意味

実装がまだ存在しないオペレーションには `x-swv-status: draft` を付ける。

- apps/api の contract テストは `draft` を **突合対象から除外**する
- これにより、**実装より先に契約を書ける**（TSOD の契約ファーストが成立する）
- 実装した時点でこのマーカーを外すこと。外した瞬間から実装との突合が強制される
- **外し忘れは機構で検出される**: `draft` が残ったまま実装（該当パス×メソッド）が
  存在すると、`./gradlew contractTest` の `OpenApiContractTest#draftOperationsMustNotBeImplemented`
  が失敗する。除外は「未実装である前提」の運用にすぎず、その前提が崩れたら CI が落ちる

現時点でオペレーションは 0 件。最初の API を持つ機能（009 discord-login 以降）から使う。

## `description` の書き方（固定テンプレート）

各 operation の `description` は次の固定テンプレートで書く。

```
**【機能概要】**

<1〜3文の説明>。refs specs/NNN-<slug>/spec.md

**【公開範囲・認証】**

- Token認証: <要否と方式>
- チャレンジレスポンス認証: <採否>

**【処理詳細】**

1. ...
2. ...

**【異常処理詳細】**

1. ...
2. ...
```

### Markdown 記法（Redoc・Swagger UI がここに Markdown として描画するため）

- YAML は `>-`（folded）ではなく **`|`（literal block）** を使う。`>-` は改行を空白に畳むため
  テンプレートの行構造が消える。
- **各見出し（`【…】`）の前後に必ず空行を1行入れる**。空行が無いと Markdown が段落を分けず、
  改行が潰れて1段落に連結される（本テンプレート最大の落とし穴）。
- 見出しは `**【…】**`（太字段落）にする。`####` 等の見出し記法は Redoc/Swagger UI で
  過大に描画される。
- 箇条書きは **`- `** を使う（全角 `・` は Markdown のリストマーカーではなく、1段落に連結される）。
- 番号リストは `1.` `2.` を使う。2行目以降へ続く場合は3スペースのぶら下げインデントで揃える。
- `refs specs/NNN-<slug>/spec.md` は **【機能概要】の末尾に必須で残す**（下記「spec.md との関係」）。

### 書く粒度

- 【処理詳細】【異常処理詳細】は **API 利用者から観測可能な振る舞い**（入力検証 → 認証/認可 →
  主処理 → 副作用 → 応答）を書く。内部クラス名・メソッド名・DBカラム名の列挙は書かない
  （実装のリファクタで陳腐化するため）。応答に現れる項目の由来など、利用者の理解に資する
  範囲であれば固有名（例: `is_active`）の言及は可。
- 設定値の数値は直書きしない（例: セッションタイムアウトの分数は書かず、
  「`spring.session.timeout` の設定に従う」のように設定キー名で参照する）。
- **複数機能・複数エンドポイントにまたがる業務ルール**（例:「護石のスキルは最大3種類」）は、従来どおりここに書かない。`specs/NNN-<slug>/spec.md` の EARS 受入基準に書く。
  `description` に書いてよいのは、**当該エンドポイント1本の入出力挙動に閉じた処理**のみ。

### spec.md との関係（正の所在）

EARS 受入基準の正は引き続き `specs/NNN-<slug>/spec.md`。`description` はその要約であり、
両者が矛盾した場合は spec.md が正。そのため `refs specs/...` の併記は省略しない。

### 禁止事項

契約に存在しない HTTP ステータスコードを、`description` に書いたからといって
`responses:` へ追加しない。`OpenApiContractTest#responseStatusCodesMatchImplementation`
が実装（springdoc の `/v3/api-docs`）と status code の集合を厳密比較しているため、
契約側だけ増やすと `./gradlew contractTest` が失敗する（例: CSRF 検証失敗の 403 は
フィルタ段で拒否されコントローラの `responses` には現れないため、`description` には
散文で言及してよいが `responses:` には追加しない）。

### レンダリング確認

`description` を書き換えたら、以下のいずれかで生成した HTML を目視し、改行やリストが
崩れていないか確認する（生成物は `contracts/dist/`、非コミット）。

- `pnpm contract:docs` — Redoc 版
- `pnpm contract:swagger` — Swagger UI 版

## 更新手順

1. `specs/NNN-<slug>/spec.md` の「契約差分」に従って `paths/<ドメイン>/` `components/` を編集する。
   `description` は「`description` の書き方」節のテンプレートに従って書く
2. `pnpm contract:lint` で構文・規約違反を確認する
3. `pnpm contract:types` で型を再生成し、生成差分をコミットに含める。
   `description` を書き換えた場合は `pnpm contract:docs`（または `pnpm contract:swagger`）で
   生成した HTML を目視し、改行・リストが崩れていないか確認する
4. API 側の実装を行い、該当オペレーションから `x-swv-status: draft` を外す
5. `cd apps/api && ./gradlew contractTest` で実装との突合を確認する

## 定義書の生成

契約（`contracts/openapi.yaml`）から、読める形の定義書 HTML を2種類生成できる。
どちらも `contracts/dist/` 配下に出力され、`openapi.yaml` から再生成できるため
非コミット（`.gitignore` で除外）。

| コマンド | 生成物 | 用途 |
|---|---|---|
| `pnpm contract:docs` | `contracts/dist/index.html`（Redoc） | 通読向けの1ページ定義書 |
| `pnpm contract:swagger` | `contracts/dist/swagger/index.html`（Swagger UI） | スキーマ探索・対外提出向けの標準フォーマット |

Swagger UI 版は `swagger-ui-dist`（devDependency。生成時のみ使う静的アセット）を
`redocly bundle` の出力（単一 JSON）と組み合わせて生成する。CDN 版 Swagger UI を
使わないのは、閲覧のたびに第三者ホストの JS を実行させないため（axios を使わず
サプライチェーン攻撃の攻撃面を減らすのと同じ考え方）。

「Try it out」機能は無効化している。`file://` や CORS 未設定の API に対して
有効にすると必ず失敗し、CSRF トークンも自動付与されないため。実際に API を
叩いて試したい場合は API を起動し、springdoc が提供する動的な
`/swagger-ui.html`（`/v3/api-docs` を表示する。契約 YAML ではなく実装が正）を使う。

## 薄仕様の「影響範囲」との関係

契約を変える機能は、薄仕様の「影響範囲」節の `触る領域:` に `contracts` を含める。
`contracts/**` を書くのは contract-agent だけで、書込は agent 単位の PreToolUse フックが
ロールごとの許可フォルダで判定する（「影響範囲」節は判定に使わない）。書式と許可フォルダの
唯一の定義は [`.claude/skills/impact-scope/SKILL.md`](../.claude/skills/impact-scope/SKILL.md)。
