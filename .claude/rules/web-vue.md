---
paths:
  - apps/web/**
---

# Web / Vue 3 — 既知の落とし穴

版の選定まわりの落とし穴（TypeScript 7 系を使わない理由、jsdom の型定義など）は `apps/web/package.json` とリポジトリ直下の `pnpm-workspace.yaml` の `catalog` に反映済みで、理由は `design/tech-stack.md` の「主な判断」節と「Web（apps/web）と packages」節にある。

## `<script setup>` は名前付き ES module export を含められない
`export const buttonVariants = cva(...)` のような値エクスポートは
プレーンな `<script lang="ts">` ブロックに書き、props 等は
`<script setup lang="ts">` に分ける（shadcn-vue コンポーネントの標準パターン）。
型のみの `export interface` / `export type` は `<script setup>` 内でも可。

## `composite: true` な tsconfig では型を export する
vue-tsc の project references（composite）はコンポーネントの型
（例: `Props` interface）が外部から参照可能である必要がある。
非公開の型を使うと `TS4025` で宣言ファイル生成に失敗する。

## API モジュールを丸ごと `vi.mock` するテストでは、関数の追加とモックの追加をセットで行う
そのモジュールに関数を足したら、既存モックへの追加と既定の `mockResolvedValue` を
セットで行う（素の `vi.fn()` は undefined を返し、`.catch` 呼出しで TypeError になる）。
契約に追加があるタスクは、web-test-agent による既存テストの追従を計画に含める。

## テスト（Vitest・Playwright）の失敗・flake は推定で直さない
切り分けの手順の正は `.claude/skills/tsod-build/references/triage.md`。

## 非同期で内容を読み込むモーダルは、読込中にフォームを描画しない
読込中の状態ではフォームを描画しない（スケルトンの表示有無とは独立に分岐する）。
描画すると前回の値のまま操作でき、遅れて届いた取得結果が入力を上書きする。

## モーダル／ダイアログ系 spec の後始末
`afterEach` は `document.body.innerHTML = ''` だけで済ませず、`wrapper.unmount()` を明示的に呼ぶ。
グローバルな `enableAutoUnmount(afterEach)` は `setupFiles` に置かず、ダイアログ系の spec は各 spec で個別に後始末する。
Dialog 系 spec が `document.body.innerHTML = ''` の後に自動 unmount して失敗するため。DOM だけを消すと、
マウント済みのコンポーネントがタイマーやリスナーを残したまま次のテストへ持ち越されるので、
明示の `unmount()` を必ず呼ぶ。

## Reka UI の Select を開閉するテストは、カバレッジ計測下のタイムアウトを見る
`pnpm test:unit` で通っても、`pnpm test:coverage`（Sonar と同じカバレッジ計測の経路）では
計測のオーバーヘッドで 5000ms を超えることがある。カバレッジ計測下で 5000ms を超えたら、
開閉の回数によらず、そのテストに個別のタイムアウトを明示する。テストの合否は
`pnpm test:unit` と `pnpm test:coverage` の両方で確かめる。

## アイコン（lucide）
shadcn-vue の CLI からコピーしたコンポーネントは `lucide-vue-next` から import している。
`lucide-vue-next` は deprecated なので、コピーしたら import を `@lucide/vue` に書き換える。
アイコンの依存はまだ導入していない（shadcn-vue を導入する機能で入れる）。導入時の版の確認は
`design/tech-stack.md` の「後の機能で導入するもの」の表の「アイコン」の行を見る。

## Sonar で繰り返し出たルールの避け方（web）
このルール群の正はここだけ。

- **`Web:S5256`**: 表の見出しセルはネイティブの `<thead><tr><th scope="col">` で書く。
  `TableHead` 等のラッパー越しだと Sonar の静的解析がコンポーネントの中身を追わず、この指摘が出る。
- **`typescript:S3776`（認知的複雑度）**: 関数が分岐を重ねたら、判定を名前付きの小さな関数に分けるか、
  早期 return にして入れ子を減らす。
