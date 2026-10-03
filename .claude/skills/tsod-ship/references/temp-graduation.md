# 一次資料（`temp/`）の卒業（区間 E のドリフト検査で開く補助資料）

区間 E のドリフト検査のときに読む。

`temp/` 配下の一次資料（`initial-design.md` と `solver-types.ts` など）は最終形ではなく、内容を正の置き場へ振り分けたら卒業（完了記録または削除）させる一時置き場である。担当は区間 E のドリフト検査（卒業状況を確認するタイミング）。卒業は drift ブランチ（`docs/NNN-<slug>-drift`）で行う。

## 振り分け表（種別ごとの卒業先）

| 種別 | 卒業先 |
|---|---|
| API 仕様 | `contracts/openapi.yaml` |
| データモデル（テーブル） | `design/data-model-standard.md`＋`design/attributes.yaml` |
| 画面 | `specs/NNN-<slug>/screen-design.md` |
| 受入基準 | `specs/NNN-<slug>/spec.md` |
| ソルバーの入出力の型（`temp/solver-types.ts`） | `packages/solver` の型定義（`src/main/`）。その機能の薄仕様が、公開する型の範囲を定める |
| 技術スタックの選定・版 | `design/tech-stack.md` |
| UI の設計標準 | `design/ui-design-standard.md` |
| 横断業務ルール | `design/` 直下の新設文書（新設した場合は、下の配線不変条件により `.claude/rules/` への配線が1本必要になる） |
| 用語・要件概要（どの機能にも属さない節） | `design/` 直下の用語集・要件概要の文書。初回の卒業のときに drift ブランチで新設する。新設したら、`.claude/rules/` への配線を canon への要求として `tasks/lessons.md` に起票する（[lessons-guide.md](../../tsod-workflow/references/lessons-guide.md)） |
| 開発手法の外部資料（例: TSOD の原典） | `docs/method/`（改変しない・参照のみの資料はここへ移設する） |

## `design/` 直下文書の配線不変条件のスコープ

「`design/` 直下の各文書には `.claude/rules/` の配線を1本以上置く」という不変条件の対象は、`design/` 直下の文書に限る。`docs/**` および `design/` 配下のサブディレクトリは対象外。

## 卒業済みの記録方法

該当節を振り分け先へ反映したら、`temp/` 側の当該節に完了追記（または当該節を削除）する。全節が卒業して `temp/` が空になったら、`temp/` ごと削除する。

## 参照の付け替え

一次資料の実体を移設する場合、管理ファイル側の参照の書き換えは、実体の移設と同一の作業単位で行う（順序を誤ると参照切れになる）。非管理ファイル側の参照（ルート `README.md` 等。`README.md` は設計方針の一次資料として `temp/initial-design.md` を指している）の付け替えも、同一 PR で行う（[canon-boundary.md](../../tsod-workflow/references/canon-boundary.md) の「非管理側だけ先に直さない」規律の対）。

## 未卒業の回収

ドリフト検査では、`temp/` 全体を当該機能 ID で grep し、「未卒業（…機能NNN…）」の予約をすべて回収する。先行機能の卒業記録に書かれた予約は、当該機能の spec・plan に現れないため、影響範囲から辿るだけでは漏れる。grep の結果、当該機能 ID を含む未卒業の予約が残っていないことを確かめてから、ドリフト検査を閉じる（機械で出せる範囲は `drift-scan.mjs` が出す）。
