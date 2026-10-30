次の番号: Q108

## 要確認事項
- [ ] Q6: 018 pwa-offline の導入方式。`vite-plugin-pwa` は `design/tech-stack.md`「判断 3」でサプライチェーン対策の判断待ちになっている（仮: 判断が出るまで 018 は着手しない。自前の Service Worker で置き換える案もそこで比べる）
- [ ] Q28: PC を主にしたレイアウトの見直し。MASTER.md の方向性は「PC を主とし、スマホでも同じ情報構造にする」だが、Layout の対応画面サイズはモバイルファーストのまま（`md` で最大幅 720px）（仮: 次に検索画面（`SearchView.vue`）のレイアウトを触る機能でブレークポイントを決め、MASTER.md の Layout を直す。005 charm-input では扱わない［005 decisions.md Q26 の検討時に、検索画面の作り直しに波及するため外した］）
- [ ] Q40: 属性の期待値（`element_add`・`element_mul`・会心撃【属性】）を扱う機能。006 damage-model は物理の期待値だけを扱う（006 decisions.md Q35）（仮: 機能マップに 023 element-damage として追加した。扱う範囲（属性の種類・個体差のある武器の属性値・会心撃【属性】）は 023 の区間 A で決める）
- [ ] Q83: 独自ドメイン（`temp/initial-design.md` §11）をどう取るか。Cookie の同一サイト化の前提（`design/tech-stack.md`「§3.3 の確認結果」の表）。ドメイン名・取得先・DNS の置き場所と、同じく §11 で未決のホスティング費用の上限（無料枠を超えたときの方針）を合わせて決める（仮: Cloudflare で取得して DNS も Cloudflare に置く。費用の上限は Cloud Run・Neon・Cloudflare の無料枠の範囲とし、超えそうなら公開を止めて見直す）
- [ ] Q87: マネージド DB（`temp/initial-design.md` §11）を Neon に確定するか。Neon は PostgreSQL 18 を提供している（`design/tech-stack.md`「§3.3 の確認結果」）。あわせて、地域（Cloud Run との距離）、無料枠、マイグレーションを流す時機（いまは API の起動時に Flyway が流す）と、`design/tech-stack.md`「更新の方針」の PostgreSQL のメジャーの見送りの解除を決める（仮: Neon に確定し、Cloud Run に近い地域を選ぶ。マイグレーションは今と同じく API の起動時に流す）
- [ ] Q88: デプロイの手順と自動化をどうするか。リポジトリに公開の設定（API のコンテナイメージの作り方・Cloudflare の設定・デプロイのワークフロー）が無い。Web を先に公開したかも記録が無い（009 decisions.md Q5 の問いの仮は「004 の後に Web だけ先に公開」だったが、決定には書かれていない）（仮: 最初は手元から手動で出し、手順を `design/` に記録する。GitHub Actions からの自動のデプロイは、公開が落ち着いてから、認証情報の渡し方（Workload Identity 連携など）と合わせて決める）
- [ ] Q107: 一般公開の前に、ユーザーデータの API（護石・武器・構成・共有）に件数の上限・一覧のページング・要求の頻度の制限を設けるか。010 decisions.md Q62 は「一般公開の前に見直す」とし、014 decisions.md Q106 で 014 には含めないとした（仮: 一般公開を決める時点で、フレンドへの公開での件数の実績を見て決める。設けるなら、超えたときの応答と画面の扱いを合わせて決める）
