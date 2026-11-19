# Changelog

## [1.0.0](https://github.com/Motoki-Tabata/skillweave-mhwilds/compare/v0.4.0...v1.0.0) (2026-11-19)


### 機能

* 正式版（v1.0.0）として公開する ([ac0e215](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/ac0e2152cd0e351c9e8ee62c7bd2bec4acf64b29))
* 正式版（v1.0.0）として公開する, refs specs/feature-map.md ([3ae1e63](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/3ae1e6369bdbf498d16ff15c463c677267dcfd64))

## [0.4.0](https://github.com/Motoki-Tabata/skillweave-mhwilds/compare/v0.3.0...v0.4.0) (2026-11-19)


### 機能

* **016:** 護石の画面に画像からの読み取りの流れを足す, refs specs/016-charm-ocr/spec.md ([1f7289f](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/1f7289f1597dfc79575c6371a14caf87ab557b59))
* **016:** 護石の読み取りを枠ごとの認識と空の枠の画素判定に改める, refs specs/016-charm-ocr/spec.md ([00764c4](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/00764c4b6c354e40ffe344ddd025962193069226))
* **017:** solver に護石の逆引きを実装する, refs specs/017-reverse-lookup/spec.md ([89c8c1d](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/89c8c1df2406bb10e7a42b7e244f78e4c7b0a175))
* **017:** web に護石の逆引きを実装する, refs specs/017-reverse-lookup/spec.md ([6183f0f](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/6183f0fd48b44e2745e998bf629869b1482c92a0))
* **018:** SW とビルド時生成（マニフェスト・アイコン・事前キャッシュ）を実装する, refs specs/018-pwa-offline/spec.md ([3a65039](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/3a650398b25d6993f0a6dd49c64e2c669911eac6))
* **018:** vite.config.ts に PWA のプラグインを結線する, refs specs/018-pwa-offline/spec.md ([7a0faa1](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/7a0faa19b27df64e097552e835a03ea94c988479))
* **018:** 画面側の SW 登録・新しい版の通知・プライバシー表記を実装する, refs specs/018-pwa-offline/spec.md ([d2367e3](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/d2367e3f54e803ab7958888c6fe65a711c55d85c))
* **023:** ソルバーに属性値と属性の最大化を足す（T2・T3）, refs specs/023-element-damage/spec.md ([dcfbd82](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/dcfbd82f871dd4fb078f3faedc25949d934f3280))
* **023:** 属性の最大化と構成カードの属性表示を足す（T4）, refs specs/023-element-damage/spec.md ([f51db4e](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/f51db4e64a46c6449ac06e3611fc9b71ac148bd3))
* **037:** スキルの補完を11種類と区別に広げる, refs specs/037-skill-effect-stats/spec.md ([77008fd](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/77008fd47747a1d6ffb81c39712f5edf83d21cc1))
* **037:** ソルバーの集計の型を数える4種に絞り、新しい種類が結果を変えないことを確かめる, refs specs/037-skill-effect-stats/spec.md ([5d154ea](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/5d154ea40f3f3d67f8300484140cbc4bd3f64fc9))
* **037:** マスターを 2026.11.2 に再生成する, refs specs/037-skill-effect-stats/spec.md ([ab6f920](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/ab6f9201683a96de947dfaa2947811e4d54632ad))
* **037:** 効果の種類を11個に広げ、対象スキルの効果を overlay に書く, refs specs/037-skill-effect-stats/spec.md ([0952b86](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/0952b863d773f685a4b74385d6b5b7db1ad8fbdd))
* **038:** effects.yaml にオメガレゾナンス・シールドオプションの値を足し、版を 2026.11.3 に上げる, refs specs/038-skill-effect-values/spec.md ([720a94e](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/720a94e4d087f63e084961dc75a225fae8c8c17a))
* **039:** 見つかりません画面と読み込み失敗の通知を web に実装する, refs specs/039-not-found-route/spec.md ([7cff8bd](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/7cff8bd90a340e429d7c726c221c35857b8186ed))
* **042:** Worker が契約に無い /api/* を 404 にする, refs specs/042-worker-api-filter/spec.md ([8372b26](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/8372b26aa60517b60692064ab5ef37cc1c34fe1c))
* **api:** prod のログを stack_trace と severity を持つ 1 行の JSON にする, refs specs/041-api-structured-log/spec.md ([28887b2](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/28887b292f19be4db7af76882bc1d712457ca37f))
* **api:** 起動時に期限切れセッションを掃除する, refs specs/040-session-cleanup/spec.md ([af7dcaf](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/af7dcaf0bdf5f3bcede9e89e218881cb3bb353c9))
* **data:** マスターを 2026.11.4 に再生成する, refs specs/043-weapon-type-effects/spec.md ([f3f36c4](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/f3f36c41af5aecaa7df942f803222ed6571a116d))
* **data:** 武器種で値が違う効果を weaponTypes で入れる, refs specs/043-weapon-type-effects/spec.md ([74af465](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/74af4650261e135fb2f6cf5d639af6c566a96da2))
* **data:** 鑑定護石の抽選テーブルの overlay を足し、マスターの版を 2026.11.1 に上げる, refs specs/036-appraised-charm-table/spec.md ([55a1359](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/55a1359e613d53410b02fda26da0908ab52631d1))
* **solver:** 火力の計算を選んだ武器の武器種で絞る, refs specs/043-weapon-type-effects/spec.md ([ebbfa5a](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/ebbfa5a3d89016404cee03da2dc3dc662d69409a))
* **web:** 補完に武器種を示し、火力と補完を武器種で絞る, refs specs/043-weapon-type-effects/spec.md ([419ddce](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/419ddce8c2a55c057fc1af72044e20b8f804ed71))


### 修正

* **016:** e2e の通信検査を context で記録し、3種の記録を確認する, refs specs/016-charm-ocr/spec.md ([ec75a76](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/ec75a76f668f063aae740981f06674f641d6b9bd))
* **016:** 未読の印の文字サイズと再測定の記録の食い違いを直す, refs specs/016-charm-ocr/spec.md ([83c6835](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/83c6835198014b14ad1cdaa7b4952a88a0460ddb))
* **017:** 逆引きの並べ替えを web の型検査が通る形にする, refs specs/017-reverse-lookup/spec.md ([1f7d401](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/1f7d401c28ce533ab1d85e09b61bfd70d905c97f))
* **018:** 事前キャッシュの版に SW 本体のコードを含める, refs specs/018-pwa-offline/spec.md ([9e52d1b](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/9e52d1b1f44d0b9181448cad5ff04fb2e41ccf0a))
* **023:** e2e の表示名の期待値で欠落を隠さず throw する, refs specs/023-element-damage/spec.md ([bcfc7a8](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/bcfc7a8d9d7b1caa5a9a9d4486ce3f54d001f5a4))
* **023:** 属性の最大化の ILP で affinity_add に属性の種類の絞り込みをかけない, refs specs/023-element-damage/spec.md ([07d72f4](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/07d72f41deb05833b82383f516c0d13f37f80b23))
* **023:** 属性の最大化のテストデータから element_crit_mul の element を外す, refs specs/023-element-damage/spec.md ([673389f](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/673389f8cb72841911f942e0a251256999da646e))
* **023:** 属性の最大化の測定で打ち切りと1件目の欠落を PASS にしない, refs specs/023-element-damage/spec.md ([1329b4f](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/1329b4f2114815d588c418263fa298c402c570b1))
* **023:** 無効の目的のラベルを薄くし、個体差のある武器の判定のテストを足す, refs specs/023-element-damage/spec.md ([f3252dc](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/f3252dca7109728041fcaeb60311b6c8ac6dc7be))
* **042:** b64url の末尾 = の除去を Sonar S8786 に合わせる, refs specs/042-worker-api-filter/spec.md ([543cf10](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/543cf10e00bd16390178bdac0b2d93f712271129))

## [0.3.0](https://github.com/Motoki-Tabata/skillweave-mhwilds/compare/v0.2.0...v0.3.0) (2026-11-14)


### 機能

* **api:** AOT キャッシュの訓練用 training プロファイルとその起動テストを足す, refs specs/035-api-aot-cache/spec.md ([7ec87ce](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/7ec87ce9310ff42d48b9cfe76c6193624c597156))


### 修正

* **deps:** Bump the npm-prod-minor-patch group with 4 updates ([4dfbf21](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/4dfbf21494a80927630e4a753c3c4aa0742010d1))
* **deps:** Bump the npm-prod-minor-patch group with 4 updates ([38b046f](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/38b046f31ae3eaff0c63965c39f846f8700f39b5))

## [0.2.0](https://github.com/Motoki-Tabata/skillweave-mhwilds/compare/v0.1.0...v0.2.0) (2026-11-07)


### 機能

* **web:** Worker が ID トークンを取得して X-Serverless-Authorization を付ける, refs specs/034-api-proxy-id-token/spec.md ([c5dc2e2](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/c5dc2e291025e070fb0f1da00f2a475fc153f863))


### 修正

* **deps:** Bump the npm-prod-minor-patch group with 2 updates ([535b289](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/535b289ebb158b7d999cde81de3db92950cbe564))
* **deps:** Bump the npm-prod-minor-patch group with 2 updates ([81071a6](https://github.com/Motoki-Tabata/skillweave-mhwilds/commit/81071a6e0b9803c4ed0dd702dab18abf278b55d9))
