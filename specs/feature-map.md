# 機能マップ

入力: `temp/initial-design.md`（§1・§2・§5・§7〜§9・§11）・`temp/solver-types.ts`。
020〜026 の入力（2026-10-28）: 実装済みの機能（001〜011・019）の `decisions.md`・`handoff.md`・`spec.md` のスコープ外で後で機能マップに足すとした事項と、`tasks/lessons.md` で専用の作業として切るとした共通化。
027 の入力（2026-10-28）: 021 crafted-charm の区間 A で分けた事項（021 decisions.md Q78）。
028 の入力（2026-10-29）: API・DB の公開（区間外の運用作業。open-questions.md Q71）の整理で、コードの変更が要るものとして分けた事項（Q86）。
029 の入力（2026-11-02）: 実装済みの機能の `handoff.md` に持ち越しとして残った事項と、`tasks/lessons.md` のコードの部分のうち、現行のコードで残っていることを確かめたもの。
031 の入力（2026-11-03）: 公開の構成（`design/tech-stack.md`「本番の構成」）で、Web の Worker が `/api/*` を Cloud Run へ転送する部分のうち、コードの変更が要るもの（open-questions.md Q130・Q142）。
032 の入力（2026-11-03）: 公開作業で本番を実測して分かった `/privacy` の表記と事実の食い違い（open-questions.md Q141）。
033 の入力（2026-11-04）: 公開作業の進行表（`tasks/20261103-launch/plan.md` の B3）。バックアップの方式を決めて分かった `/privacy` の記載の不足（open-questions.md Q143）。
035 の入力（2026-11-09）: 公開作業の進行表（`tasks/20261103-launch/plan.md` の B5）。Cloud Run で通常と AOT キャッシュ付きのイメージを比べた結果（open-questions.md Q150・`design/tech-stack.md`「API のデプロイ手順」）。
036 の入力（2026-11-15）: `temp/appraised-charm-table.md`。017 reverse-lookup の区間 A で、鑑定護石の抽選テーブルが空と分かり、整備を 017 より先に行うと決めた事項（017 decisions.md Q166）。
037・038 の入力（2026-11-15）: 023 element-damage の区間 A で、説明文に数値が無いスキルの効果の数値を Web から集めて設定する作業を、023 より先に別の機能として行うと決めた事項（023 decisions.md Q182。006 decisions.md Q37 の「攻略サイトは取り込まない」方針の見直しを含む）と、その起票の確認でオーナーが求めた、説明文に数値があるものを含めて数値に関わる効果をすべてマスターの項目にする変更。項目化（037）と Web からの収集（038）に分けた。
039〜052 の入力（2026-11-16）: 023 以外の機能が済んだ時点で、実装済みの機能（001〜038）の `handoff.md`（レビュー記録・要確認事項・区間メモの持ち越し）・`decisions.md` と `spec.md` のスコープ外で後の機能へ送るとした事項・`specs/open-questions.md` の仮で機能として起票するとした事項・`tasks/lessons.md` のコードの部分・公開作業の進行表（`tasks/20261103-launch/plan.md` の D5）。コードの事実は現行のコードで残っていることを確かめた。テストの穴（049・050 の一部）は各機能の区間 A で確かめ直す。採らないと決めた事項・ゲートで現状を許容した事項・後の機能で解消した事項・過去の記録の文書の古さ・`.claude/**` の改修と教訓の候補（再発したら起票するとした候補を含む）・運用作業（Q88 の API のデプロイ手順）・拡張「アセンダンス」の発売を待つ事項（002 decisions.md Q7 の極意・036 のレア度）・「必要になったら」とした事項（037 decisions.md Q192・038 decisions.md Q191・036 decisions.md Q174）は含めない。
機能 ID は実装順に振る（依存の表を満たす順で、同じ段では優先度の高いものを先にする）。初回の分解の後に追加した機能は、既存の ID を振り直さず末尾に採番する。その場合の実装順は依存の表が正である。

### 機能マップ
| 機能ID | 名称 | 1行の価値 | 優先度 | 想定サイズ | 状態 |
|---|---|---|---|---|---|
| 001 | solver-spike | HiGHS WASM で実データ規模の ILP（必須スキル・防具5部位・護石・スロット Lv 別の装飾品個数）が数秒以内に解けるかを測り、最大の技術リスクを先に潰す | P0 | M | 済 |
| 002 | master-data-pipeline | MHDB（SHA 固定）の取得→gameId からの ID 生成→YAML オーバーレイ→検証→`master-<version>.json` と ja/en 辞書の出力を、1コマンドで再現できるようにする | P0 | L | 済 |
| 003 | solver-engine | `SolverRequest`→`SolverResponse` の本実装（シリーズ／グループスキル・部位の固定と除外・武器固定・装飾品の配置の後処理・複数解・タイムアウトとキャンセル・`masterVersion` 照合・Worker のメッセージ型）を DOM 非依存の純関数で提供する | P0 | M | 済 |
| 004 | solver-ui | ログインなしで、武器と必須スキルを指定して検索し、結果の構成（防具・装飾品・発動スキル・空きスロット）を見られる最初の画面（マスター読込・Worker 結線・二次創作表記とクレジット・e2e 基盤を含む） | P0 | L | 済 |
| 005 | charm-input | ゲストが鑑定護石を手入力して端末内（IndexedDB）に保存し、抽選テーブルで入力の妥当性を検査し、ソルバーの護石候補に使える | P0 | M | 済 |
| 006 | damage-model | スキル効果（`effectsByLevel`）と発動条件をオーバーレイで定義し、構成の期待値を計算して、ソルバーの `maximize: expectedDamage` で使えるようにする | P1 | M | 済 |
| 007 | damage-ui | 結果の構成ごとに火力（期待値）を表示し、発動条件をトグルで切り替え、スキル説明文の後ろに効果の数値を補完して表示する | P1 | M | 済 |
| 008 | user-weapon | 巨戟アーティア等の個体差がある武器（復元ボーナス・付与シリーズ／グループスキル）を端末内に入力し、ソルバーの固定武器に使える | P1 | M | 済 |
| 009 | discord-login | Discord OAuth でログイン・ログアウトでき、セッションを Spring Session JDBC で保持する | P1 | M | 済 |
| 010 | charm-save | ログインユーザーが護石をサーバーに保存し、複数端末で同じ護石一覧を使える（attributes.yaml の最初の確定） | P1 | M | 済 |
| 011 | build-save | ログインユーザーが検索結果の構成に名前を付けて保存し、一覧から開き直せる（作成時の `master_version` を記録する） | P1 | M | 済 |
| 012 | build-share | 保存した構成のスナップショットを短縮 ID の URL で共有し、受け手が閲覧できる（元を編集・削除しても内容は変わらない） | P1 | M | 済 |
| 013 | user-weapon-save | ログインユーザーが個体差のある武器をサーバーに保存し、複数端末で使える | P2 | S | 済 |
| 014 | guest-draft-import | ログイン時に、ゲストの端末内の下書き（護石・武器）を一方向・一回きりでサーバーへ取り込む | P2 | M | 済 |
| 015 | ocr-spike | Tesseract.js でゲーム画面のスクリーンショットから護石を、実用的な精度と時間でブラウザ内で読み取れるかを測る | P2 | S | 済 |
| 016 | charm-ocr | スクリーンショットから護石を読み取り、確認・修正のうえで護石一覧に登録できる（画像はサーバーへ送らない） | P2 | M | 済 |
| 017 | reverse-lookup | 「この護石があれば組める」構成を抽選テーブルから逆引きし、狙う護石の候補を示す | P2 | L | 済 |
| 018 | pwa-offline | アプリをインストールでき、オフラインでも閲覧とソルバー実行ができる | P2 | S | 済 |
| 019 | damage-solve-perf | `maximize: expectedDamage` の検索を実データで基準の 3 秒以内に収め（Q41）、2 段目の求解が解なしのときは 1 段目の解を返す縮退を入れる | P1 | M | 済 |
| 020 | armor-lock-exclude | 検索画面で防具の部位を固定し、使わない防具・装飾品を除外して検索できる（防具の固定・除外はソルバーが 003 で対応済み。装飾品の除外はソルバーにも足す（020 decisions.md Q79）） | P1 | M | 済 |
| 021 | crafted-charm | 生産護石（マスターの `charms`）をソルバーの護石候補にでき、鑑定護石を入力しなくても護石込みの構成を探せる | P1 | M | 済 |
| 022 | skill-category | スキルに攻撃系・会心系などの分類を持たせ、スキルを選ぶダイアログを分類ごとに並べる | P2 | M | 済 |
| 023 | element-damage | 属性の期待値（`element_add`・`element_mul`・会心撃【属性】）を計算し、結果の火力に出し、`maximize: expectedDamage` でも使えるようにする | P2 | L | 未着手 |
| 024 | worker-solve-perf | ブラウザの Worker 上の `expectedDamage` の1件目までの時間を基準の 3 秒以内に収める（Q50） | P2 | S | 済 |
| 025 | shared-parts-refactor | 機能ごとに複製された部品（削除確認ダイアログ・端末保存のストアの状態機械・ダイアログのオーバーレイ・404／409 の例外とハンドラ）を共有部品にまとめ、次の保存機能が同じ複製を増やさないようにする（画面と API の挙動は変えない） | P1 | M | 済 |
| 026 | design-system-alignment | MASTER.md と、shadcn-vue の既定・既存画面との食い違い（見出しのウェイト・影・オーバーレイの濃さ・警告の帯・outline の枠色）を、規約か実装のどちらかに揃える | P2 | M | 済 |
| 027 | crafted-charm-build-save | 生産護石を使った構成を保存し、保存した構成の画面で開き直せる | P1 | S | 済 |
| 028 | api-prod-config | API を公開できるよう、本番用の設定（Cookie の `Secure` 属性など。Q85）を入れ、認可を始めただけで作られる未ログインのセッションの行を短い有効期間にする（画面の挙動は変えない） | P1 | S | 済 |
| 029 | review-carryover | レビューで持ち越した未テストの分岐と検査の抜け（楽観ロックの 409・除外した装飾品の検査・`MD_OUTLINE_CLASS` の適用）を埋め、重複と未使用のコードを整理する（画面と API の挙動は変えない） | P2 | S | 済 |
| 030 | privacy-notice | 公開（フレンド公開）の前に、利用者のデータがどこへ送られ何が保存されるか（Google Fonts への IP アドレスの送信・Discord のログインで保存する情報・Cloudflare と Google Cloud のアクセスログ・端末内に保存するデータ）を、画面から読めるようにする | P0 | S | 済 |
| 031 | api-proxy | Web の Worker が `/api/*` を Cloud Run へ転送し、同じオリジンのまま本番でログイン・保存・共有 URL を使えるようにする（今は 503 を返す） | P0 | M | 済 |
| 032 | privacy-analytics | `/privacy` の表記を本番の事実に合わせ、Cloudflare Web Analytics で何が送られ何に使われるかを画面から読めるようにする | P0 | S | 済 |
| 033 | privacy-backup | 消去を依頼した後もデータがバックアップにいつまで、どんな形で残るかを、`/privacy` で読めるようにする | P0 | S | 済 |
| 034 | api-proxy-id-token | Web の Worker が Cloud Run の ID トークンを取り、`/api/*` の転送に `X-Serverless-Authorization` で付けて、Invoker の確認を有効にしたまま Cloud Run を呼べるようにする | P0 | S | 済 |
| 035 | api-aot-cache | API のコンテナイメージを AOT キャッシュ付きで作り、Cloud Run で停止した状態から最初の要求（ログイン開始など）に答えるまでの待ち時間を縮める（本番の DB 接続と実行時の設定は変えない） | P0 | S | 済 |
| 036 | appraised-charm-table | 鑑定護石の抽選テーブル（スキル枠のパターン・群の中身・スロットの並び）を overlay の `appraisedCharm` に入れてマスターの版を上げ、護石の照合（005）が「未検査」ではなく合否を判定し、017 の逆引きが使える土台を作る | P1 | M | 済 |
| 037 | skill-effect-stats | 効果の数値の種類（`effectsByLevel` の `stat`）を攻撃力・会心の 4 つから属性・状態異常・防御力などへ広げ、説明文に数値があるスキルの効果をすべてマスターの項目として持つ（計算は変えない。説明文の後ろの数値の補完に出る） | P1 | M | 済 |
| 038 | skill-effect-values | 説明文に数値が無いスキル（連撃・会心撃【属性】・会心撃【特殊】など）の効果の数値を、Web の情報源を読み比べてマスターに入れ、火力の期待値に数えられるようにする（出典の方針を見直す） | P1 | M | 済 |
| 039 | not-found-route | 存在しない URL を開いたときに「見つかりません」の画面を出し、デプロイで消えたチャンクの読み込みに失敗したときは再読み込みを案内する（今は空の画面・無反応） | P0 | S | 未着手 |
| 040 | session-cleanup | 期限切れの `spring_session` の行を、最小インスタンス 0 の Cloud Run でも確実に消す（今の `cleanup-cron` は一度も動いていない） | P0 | S | 未着手 |
| 041 | api-structured-log | `prod` の API のログを `stack_trace`・`severity` を持つ 1 行の JSON にし、例外が Error Reporting に載るようにする | P0 | S | 未着手 |
| 042 | worker-api-filter | Web の Worker が契約に無い `/api/*` の要求を Cloud Run へ転送せずに 404 で返し、スキャナーの要求で Cloud Run と Neon を起こさないようにする | P0 | S | 未着手 |
| 043 | weapon-type-effects | スキルの効果に武器種の区別を持たせ、武器種で値が違う会心撃【属性】・災禍転福・連撃の値をマスターに入れて火力の期待値に数える | P0 | M | 未着手 |
| 044 | skill-effect-values-verify | 038 で出典の読みが定まらず空にしたスキルの効果（Kiranico だけにある 17 件・出典が食い違う連携プログラム・1 サイトだけの研鑽と暗黒など）の値を確かめてマスターに入れる | P2 | M | 未着手 |
| 045 | skill-effect-combat | 攻撃の種類・部位・斬れ味で範囲を限るダメージ倍率（心眼・鈍器使い・飛燕・破壊王など）・斬れ味（匠・業物など）・被ダメージの軽減（ガード強化など）の数値をマスターの項目にし、説明文の後ろの補完に出す（計算は変えない） | P2 | M | 未着手 |
| 046 | skill-effect-actions | 行動の数値（体術・回復速度・効果時間・採取数など）をマスターの項目にし、説明文の後ろの補完に出す（計算は変えない） | P2 | M | 未着手 |
| 047 | ux-carryover | レビューで持ち越した画面の挙動の穴（選んだ武器を解決できないと検索が無反応・OCR の読み取り中に「待ち列を空にする」を押した後も結果が足される・構成の保存の失敗の後に入力欄へフォーカスが戻らない・護石の読込待ちの間の検索の扱い・フォームの `aria-describedby`）を直す | P2 | S | 未着手 |
| 048 | pc-layout | PC を主にしたブレークポイントを決めて検索画面のレイアウトを見直し、MASTER.md の Layout と「小見出し（刻印風）」を実装と揃える | P2 | L | 未着手 |
| 049 | carryover-api-contracts | レビューで持ち越した API と契約の整理（`NotFound.yaml` と ProblemDetail の例の説明・制約違反の走査と層の重複・置き場と可視性・未検証の分岐とテスト）を片づける（API の応答は変えない） | P2 | S | 未着手 |
| 050 | carryover-web-solver | レビューで持ち越した Web・ソルバー・データの整理（未テストの分岐と弱いテスト・文言の文字列置換・埋め込みの定数・式と定数の重複・測定の写し）を片づける（画面・ソルバーの結果・マスターは変えない） | P2 | M | 未着手 |
| 051 | api-limits | 一般公開の前に、ユーザーデータの API（護石・武器・構成・共有）の件数の上限・一覧のページング・要求の頻度の制限の要否と形を決めて入れる | P2 | M | 未着手 |
| 052 | account-deletion | 削除したデータの物理削除と、アカウントとデータの消去の手段を用意する（消去の依頼の本人確認の扱いは Q148 で決める） | P2 | M | 未着手 |

### 依存
| 機能 | 直接の依存 | 備考 |
|---|---|---|
| 001 solver-spike | なし | 002 を待たずに着手する。実データ規模の入力の用意は Q2 |
| 002 master-data-pipeline | なし | オーバーレイの仕組みまでを持つ。抽選テーブル（005）・効果数値（006）・個体差武器の選択肢（008）の中身は各機能で埋める |
| 003 solver-engine | 001, 002 | 001 の定式化を拡張する（Q1）。入出力型は `temp/solver-types.ts` が起点 |
| 004 solver-ui | 002, 003 | 画面を持つ最初の機能。武器はマスター武器の選択のみ（個体差の武器は 008）。目的関数は `feasible`・`defense`・`freeSlots`（`expectedDamage` は 006） |
| 005 charm-input | 002, 004 | 抽選テーブルのデータは 002 のオーバーレイで作る（Q3） |
| 006 damage-model | 002, 003 | 期待値の計算は DOM 非依存なので `packages/solver` に置く |
| 007 damage-ui | 004, 006, 019 | §11「火力の可視化の機能分割」への答え: solver-ui から独立させ、計算（006）と表示（007）に分ける。007 の区間 B は 019 のマージの後に始める（007 decisions.md Q42） |
| 008 user-weapon | 002, 004 | ソルバー側の個体差武器（`SolverWeapon` の `custom`）は 003 で扱う |
| 009 discord-login | 004 | 画面の骨格（ヘッダーのログイン導線）が 004 にある。最初の API を持つ機能 |
| 010 charm-save | 005, 009 | 護石の入力 UI とスキーマは 005 のものを使う（端末側とサーバー側でスキーマを同一にする §2.1） |
| 011 build-save | 009, 010 | 構成は護石を UUID で参照する |
| 012 build-share | 011, 028 | 共有 URL を受け手に開いてもらうには、API・DB の公開（009 decisions.md Q5 の区間外の運用作業）が先に要る。公開の時機は Q71 で、012 のマージの後、共有をフレンドに使ってもらう前（012 は公開を待たずにローカルで完結させた）。公開の前提: 独自ドメイン Q83・Web から API への経路 Q84・マネージド DB Q87・デプロイの手順 Q88。012 自身の前提: 共有の ID と憲法の UUIDv7 Q89・未ログインで読める最初のユーザーデータの API Q90。スナップショットには 011 の構成の内容（護石・武器の写しを含む）をそのまま使え、マスターの版の違いは 011 decisions.md Q67 の扱いに揃えられる |
| 013 user-weapon-save | 008, 009, 025 | サーバー保存の3つ目の機能。例外とハンドラ・端末保存のストアの共通化（025）の後に行う |
| 014 guest-draft-import | 010, 013 | 一般公開段階で行う（§2.1）。ゲストの構成は端末内に保存しないので取り込みの対象から外した（014 decisions.md Q70）。件数の上限とページングの見直し（010 decisions.md Q62）は 014 に含めず Q107 として残した（014 decisions.md Q106） |
| 015 ocr-spike | なし | フェーズ②の前に行う |
| 016 charm-ocr | 005, 015 | 着手の前に Q117 を決める。015 handoff.md の持ち越しを含める: `parse.ts` が空行を落とすため枠が空だと以降のスキルが上に詰まる・`reader.ts` の `setParameters` の失敗で worker が残る・測定の通信検査が同一オリジンへの POST を検出しない |
| 017 reverse-lookup | 003, 005, 036 | フェーズ③。鑑定護石の抽選テーブル（overlay の `appraisedCharm`）が空のため、少なくとも 1 つのレア度のテーブルがマスターに入ってから区間 A のゲート A-2 を再開する（017 decisions.md Q166） |
| 018 pwa-offline | 004 | 導入方式は自前の Service Worker（018 decisions.md Q6） |
| 019 damage-solve-perf | 006 | `packages/solver` だけを触る。対策の中身は 019 の区間 A で Q41 として決める。ID は追加順で末尾だが、実装は 007 の区間 B より前に行う |
| 020 armor-lock-exclude | 004 | 004 decisions.md Q22 で 004 のスコープ外にした。検索画面のレイアウトを変えるなら Q28 に当たる |
| 021 crafted-charm | 003, 005 | 方式は 021 decisions.md Q31・Q77。生産護石を使った構成の保存は 027（Q78） |
| 022 skill-category | 002, 004 | 004 handoff.md の区間メモでユーザーが後で作るとした。分類はマスターに無いので `packages/data` の overlay で持つ見込み |
| 023 element-damage | 006, 007, 008, 038, 043 | 006 decisions.md Q35 で物理だけにした。扱う範囲は Q40。属性の効果の種類と書式（023 decisions.md Q40 は区間 C で決めるとした）は 037 で入り、会心撃【属性】など説明文に数値が無いスキルの値は 038 で揃える。038 がマスターに入ってからゲート A-2 を再開する（023 decisions.md Q182）。038 で会心撃【属性】の値は武器種で違うため空のままなので、043 を先に行い、043 がマスターに入ってからゲート A-2 を再開する（023 decisions.md Q197） |
| 024 worker-solve-perf | 007, 019 | `packages/solver` の性能改善か基準の見直しかは Q50 |
| 025 shared-parts-refactor | 008, 010, 011 | `tasks/lessons.md` の 2026-10-26「削除確認ダイアログと、端末保存のストアの状態機械が護石と武器で二重になった」・2026-10-28「例外クラスと ApiExceptionHandler のハンドラが機能ごとに並行して増える」・2026-10-28「ダイアログのオーバーレイの記述が PickerDialog と BuildDialogFrame で複製された」を扱う。011 の `DeleteConfirmDialog` と既存の2つの削除ダイアログの併存（011 plan D16）も含む |
| 026 design-system-alignment | 011 | `tasks/lessons.md` の 2026-10-26「見出しの font-semibold（600）が MASTER.md のウェイト3種と食い違う」・2026-10-28「MASTER.md の Typography／Shape と、shadcn-vue の既定・既存画面が食い違ったまま増えている」と、Q27（警告の帯）・009 handoff.md の持ち越し（ライトの outline の枠色）を扱う。どちらに揃えるかは区間 A・B で決める。025 と同じ部品を触るなら 025 の後に行う |
| 027 crafted-charm-build-save | 011, 021 | 021 decisions.md Q78 で 021 のスコープ外にした。`BuildCharm` の契約（`id` は `format: uuid`）と API の検査を変える。`BuildCharm` の形は鑑定護石が参照と写し、生産護石が参照だけ（027 decisions.md Q93） |
| 028 api-prod-config | 009 | API・DB の公開（Q71）の前に行う。扱う本番の設定は Q85、この機能に切った理由は Q86、セッションの掃除の間隔は Q91。Q84 で別オリジンの経路を選ぶなら、Web の API の呼び方と CSRF の Cookie の読み方の変更も含める |
| 029 review-carryover | 011, 020, 026 | 楽観ロックの 409 の未テスト（010・011 handoff.md。護石・武器・構成）、`verifyBuild.ts` が除外した装飾品を検査しない（020）、`MD_OUTLINE_CLASS` の単体テストが無くダークの hover も実ブラウザで未確認（026）、`damageModel.ts` の `thetaCol` が未使用（019）を扱う。あわせて、e2e の `uuidV7()` の `e2e/support/` への切り出し（3 本の spec）、スケルトンの手書きの遅延を `useSkeletonDelay` へ寄せる（`BuildsGate`・`SearchView`・`CharmsView`・`WeaponsView`・`WeaponDialog`・`CharmCard`）、Combobox の入力欄の共通化（`CharmSkillRow`・`ArmorLockRow`・`ExcludeCard`・`WeaponBonusRow`）、`WeaponPayload.element.type` を契約の列挙に揃える（`lib/api/weapons.ts` の差し替えを解消する。契約の型を使う境界を `.claude/rules/web-vue.md` に書く作業は、`tasks/lessons.md` に起票してマージの後に区間の外で行う）、`lib/api/charms.ts` の未使用の `CHARMS_FAILURE_MESSAGES` の再エクスポート（025）、`ExcludeCard.vue` の未使用の `root` ref（020）を扱う。`NotFound.yaml` の説明が `getSharedBuild` と合わない点（012）は、触る領域が 4 つになるので外した（029 decisions.md Q119・open-questions.md Q123） |
| 030 privacy-notice | 004, 009 | `design/tech-stack.md` 判断 6（Google Fonts で IP アドレスが Google に送られる。「公開前にプライバシーの表記へ含める」）が出どころ。入力文書は無く、公開作業の依頼（2026-11-03）が入力。URL をフレンドへ配る前（Q88 の公開作業の段階 3 以降）にマージしておく。扱う範囲・置き場所・連絡先は Q132〜Q135 |
| 031 api-proxy | 028 | 028 decisions.md Q84 の同一オリジンの経路を実装する。扱う範囲は Q130・Q142。デプロイと Cloud Run への直接の到達の制限は含めない（Q88） |
| 032 privacy-analytics | 030 | 030 の AC-9 のうち、アクセス解析を入れていないとする部分を取り消す。扱う範囲は Q141。URL をフレンドへ配る前にマージしてデプロイする |
| 033 privacy-backup | 030 | 030 の AC-6（完全な消去は連絡先へ依頼する）の案内に、バックアップの説明を足す。バックアップの方式は 028 decisions.md Q131。扱う範囲は Q143〜Q147。URL をフレンドへ配る前にマージしてデプロイする |
| 034 api-proxy-id-token | 031 | Q88 の直接の到達の決定（Invoker の確認を有効にしたまま、Worker が専用のサービスアカウントで ID トークンを付ける）を実装する。扱う範囲は Q151〜Q153。031 の AC-9 の転送のヘッダーの扱いに `X-Serverless-Authorization` の付与が加わる。デプロイ・鍵の発行と登録・本番での確認は含めない（C3・C5）。C5 のログインの確認の前にマージしてデプロイする |
| 035 api-aot-cache | なし | Q150 の C3 での比較（2026-11-09）で差が出たので起票した。`apps/api/build.gradle.kts` の `bootBuildImage` に `BP_JVM_AOTCACHE_ENABLED` と訓練の実行の設定を足す。扱う範囲は Q154〜Q156。`design/tech-stack.md`「API のデプロイ手順」の更新を含め、本番の `swv-api` へのデプロイと測定は含めない（公開作業の B5・C8）。URL を配る（C8）前にマージし、本番へ出す |
| 036 appraised-charm-table | 002, 005 | 017 decisions.md Q166 で 017 より先に行うと決めた。型（`AppraisedCharmPattern`・`CharmSkillGroup`）と overlay の検証（規則 `appraised-charm`）は 002 で実装済みで、型を変えずに overlay を書くだけで済む見込み。照合（`apps/web/src/main/lib/charms/match.ts`）は 005 のもの。扱う範囲は Q170〜Q177。少なくとも 1 つのレア度のテーブルがマスターに入れば 017 を再開できる |
| 037 skill-effect-stats | 002, 006, 007 | 型 `EffectStat` は data・solver（`damage.ts` の種類ごとの合計）・web（`effectSummary.ts` の補完の文言）が使うので、触る領域は 3 つの見込み。効果の overlay（`effects.yaml`）と検証は 006、数値の補完は 007 のもの。扱う範囲は Q187・Q192 |
| 038 skill-effect-values | 037 | 023 decisions.md Q182 で 023 より先に行うと決めた。037 で広げた種類に、説明文に数値が無いスキルの値を入れる。出典の方針（006 decisions.md Q37・`design/master-data.md` §2・§8）の見直しは Q185・Q186、扱う範囲は Q188〜Q191。サイトの取得と下書きの進め方は 036 decisions.md Q170 が先例。マスターに入れば 023 を再開できる |
| 039 not-found-route | 009, 018 | Q136 が出どころ（公開作業の進行表 D5。v1.0.0 の範囲。`design/tech-stack.md`「リリースと版」）。経路にキャッチオールを足すと、`safeReturnPath` がキャッチオールの経路の不在に依っている点（009 handoff.md の持ち越し）に当たるので合わせて見る。存在しないファイルに `index.html` が 200 で返る点（`wrangler.jsonc` の `not_found_handling`）と、Service Worker のナビゲーションの扱い（018）との関係は区間 A で決める |
| 040 session-cleanup | 028 | Q149 が出どころ（D5。v1.0.0 の範囲）。掃除の方法（Cloud Scheduler からの要求・ログインの時の掃除・DB 側のジョブなど）は区間 A で決める。035 の spec.md のスコープ外から送られた |
| 041 api-structured-log | 028 | Q158 が出どころ（D5。v1.0.0 の範囲）。Spring Boot の組み込みの構造化ログで `severity` まで載るかは区間 A で確かめる |
| 042 worker-api-filter | 031, 034 | Q159 が出どころ（D5。v1.0.0 の範囲）。契約に有るパスを Worker がどう知るか（契約からの生成か手で持つ一覧か）は区間 A で決める。あわせて、`tasks/lessons.md` の 2026-11-03 の 2 件（`apps/web/worker/**` が Sonar の解析対象・coverage・`format:check` に入っていない）を常時許可外の変更として扱う見込み（`sonar-project.properties` は人間の明示の指示を要する）と、031 handoff.md の持ち越し（Worker の転送の有効側の肯定テストが無い）を含める |
| 043 weapon-type-effects | 038 | 038 decisions.md Q196 が出どころ（038 の区間 E で起票すると決めた）。武器種ごとの値は `design/master-data.md` §11 に記録済み。触る領域は data・solver（武器種による効果の絞り込み）・web（補完の文言）の 3 つの見込み。023 より先に行う（023 decisions.md Q197）。023 を出す v1.0.0 の前に要る |
| 044 skill-effect-values-verify | 038 | 038 handoff.md の区間 E の持ち越し（値が大半空になった点は出典の読みの確かさの問題）が出どころ。空にした理由は `design/master-data.md` §11。値の確かめ方は Q198。武器種で違う 3 件は 043 で扱う |
| 045 skill-effect-combat | 037 | Q194 が出どころ（仮のとおり 2 つに分けた 1 つ目）。037 handoff.md の持ち越し（`effects.ts` の `ELEMENTS`・`STATUSES` と `index.ts` の `EffectElement` の二重定義）も、同じ型を触るので含める。説明文に数値が無いものの値は 038 と同じ出典の方針（038 decisions.md Q190）で入れる |
| 046 skill-effect-actions | 045 | Q194 が出どころ（2 つ目）。`EffectStat` の型と overlay の検証を 045 と同じ箇所で広げるので、045 の後に行う |
| 047 ux-carryover | 008, 011, 016 | Q118（武器を解決できないときの検索画面。008 handoff.md）・016 handoff.md の持ち越し（読み取り中に「待ち列を空にする」を押したときの動きが未定義。`CharmsView.vue` の `clearQueue` は読み取りを止めない）・011 handoff.md の持ち越し（保存・名前の変更の失敗の後にフォーカスが入力欄に戻らない。仕様に決めが無い）・029 の spec.md のスコープ外（`lib/api/builds.ts` の `isElement` を列挙で検査する）・005 handoff.md の持ち越し（護石の読込待ちの間に前の検索の要約が残る・待ちの経路が進行中の前の求解を止めないことがある・`CharmCard` の補助文の `aria-describedby` がエラーの要素が無くても付く）・008 handoff.md の持ち越し（`WeaponForm` の `aria-describedby` が存在しない id を指すことがある）を扱う。どれも画面の挙動が変わるので、挙動を変えない 050 と分けた |
| 048 pc-layout | 020, 022, 026 | Q28 が出どころ（「次に検索画面のレイアウトを触る機能で扱う」）。`tasks/lessons.md` の 2026-11-02「MASTER.md の小見出し（刻印風）が実装に 1 か所も無い」（揃えるなら別の機能として起票するとした）も含める。どちらに揃えるかは区間 A・B で決める |
| 049 carryover-api-contracts | 012, 035 | Q123（`NotFound.yaml` の説明。029 decisions.md Q119 で外した）・009 handoff.md の持ち越し（ProblemDetail の例が 401 に寄っている・`SessionCookieRefreshFilter` の `flushBuffer` で応答が chunked になりうるか未実測・`AuthorizationBypassTest` の `%2F` の 400 を返すのがファイアウォールか Tomcat か）・010 handoff.md の持ち越し（読んだ後に削除が割り込む競合の自動テストが無い）・012 handoff.md の持ち越し（`ConstraintViolations` と `PrimaryKeyViolations` の走査のループの重複）・035 handoff.md の持ち越し（`TrainingProfileTest` が環境変数 `SPRING_DATASOURCE_URL` などに影響されうる）・010 handoff.md の持ち越し（検査の record（`CharmPayload` など）が `entity/` にある）・013 handoff.md の持ち越し（木を経由する冗長なコード・`Charm`／`Weapon`／`Build` の層の重複・衝突のテストが `version` を見ない）・025 handoff.md の持ち越し（`ID_EXISTS` が package-private・コントローラがサービスの `NOT_FOUND` の定数を参照）・029 handoff.md の持ち越し（3 つのテストが `merge` の古い版の拒否に依る）を扱う。区間 A で各項目が残っていることを確かめ直す |
| 050 carryover-web-solver | 017, 021, 024, 036 | 010 handoff.md の持ち越しのうち 029 で外した分（Web の作成の 409 の分岐・`reload()` 経由の 401・API 層の本文と CSRF の検査のテスト）・017 handoff.md の持ち越し（`toReverseReason` が検索側の文言を文字列置換で流用・`reverseModel.ts` の重みの `3` が定数と別に埋め込み・AC-10 のテストが `yieldControl` の回数を求解の回数の代理にする）・019 handoff.md の持ち越し（`stage1Cost` の名前。029 の spec.md のスコープ外）・024 handoff.md の持ち越し（`expectedDamage` の判定式の重複。今は 4 箇所）・021 handoff.md の持ち越し（測定の `topRankCraftedCharms` が web の規則の写し）・016 handoff.md の持ち越し（D11 の `File` の参照の破棄に実効が無い・`SKILL_BOUNDS` の直書きと枠ごとの再計算・e2e の `output` のロケーターの範囲・空の枠の画素の判定が 1920x1080 以外の 16:9 で未検証（オーナーの画像が要る））を扱う。あわせて、テストの穴と重複の持ち越しを扱う: 005（data のテストの `describe` の見出しに 002 と 005 の番号が混在・`fixtures.ts` の `READINGS_YAML` と `READINGS` の二重・検索の条件の変更のテストの判別力）、006（data の `conditionId` の不正な型のテスト・solver の `NEGATIVE_SLOPE` と合計レベルの式の重複・非整数などの素の `Error`・`SetBonus` が無いときの黙った脱落）、008（e2e の期待値のセレクターの重複・設定の案内の文言と `output` の不在のテスト）、009（ログイン中に端末内のデータを送らないことの明示のテスト）、011（e2e の保存後の「保存済み」の確認・`rename` の戻り値の非対称）、012（AC-7 の確認の段の本文の後半・ログアウトで D9／D10 が閉じるテスト）、013（削除時の端末の件数・409／404 の後の入力の破棄・登録モードの 401 の入力の保持のテスト）、015（`slots.spec`・`preprocess.spec` の定数の写し・`match.spec` の実マスターへの依存）、018（新しい版への切り替えの実ブラウザの確認）、019（キャンセルのテストが求解の前の 1 パターンだけ）、020（AC-11 の e2e の補強・固定→除外の一覧の更新を画面で見るテスト・`buildSolverRequest` が固定と除外の重なりを除かない・除外で解なしの経路のテスト・`describe` 名）、021（AC-9 の包含のテストがスロットの `target` を比べない・テストの質の小項目）、024（AC-4 の総当たりにシリーズ／グループのスキルが無い・`damage-ui.measure.ts` の冒頭の記述・serial モードの `afterAll` の部分データでの合否）、027（AC-10 の護石名の確認の範囲・crafted が有効なマスターでの「護石なし」）、029（`describe` 名の `[AC13]`・除外の装飾品が無い否定のケース）、030・032（`/privacy` の 360px の検証の弱さ・030 AC-10 の数字なしの検査の範囲）、036（`dist.spec.ts` のスロットの検査が `slotPatterns` が空でも通る・`charm-save.spec.ts` の 409 のテストの前提）、037（`resistance_add` の `element` が欠けたときの分岐・solver の検算の基準の感度と目的関数の 4 種の直接の検証）。触る領域は web・solver・data の 3 つの見込み。区間 A で各項目が残っていることを確かめ直す |
| 051 api-limits | 014 | Q107 が出どころ（010 decisions.md Q62・011 decisions.md Q66・014 decisions.md Q106 が「一般公開の前に見直す」とした）。v1.0.0 の範囲ではない。着手は一般公開を決めた時点で、フレンドへの公開での件数の実績を見て上限を決める |
| 052 account-deletion | 030, 033 | Q139（物理削除とアカウントの削除。030 decisions.md Q138）と Q148（消去の依頼者の本人確認）が出どころ。v1.0.0 の範囲ではない。着手は一般公開を決めた時点。保持期間・外部キーの順序・バックアップ（028 decisions.md Q131）の扱いと、`/privacy` の消去の案内（030 AC-6・033）の書き換えを含める |
