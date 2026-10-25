次の番号: Q50

## 要確認事項
- [ ] Q5: デプロイ（Web: Cloudflare Pages / API: Cloud Run / DB: Neon または Supabase）を TSOD の機能として切るか、区間外の運用作業とするか。フレンドに使ってもらう時期と、独自ドメイン（Cookie の同一サイト化）・マネージド DB の未決事項（§11）にも関わる（仮: 機能にはしない。004 solver-ui の後に Web だけ区間外で先に公開し、API・DB の公開は 009 discord-login の ship の前に区間外で行う）
- [ ] Q6: 018 pwa-offline の導入方式。`vite-plugin-pwa` は `design/tech-stack.md`「判断 3」でサプライチェーン対策の判断待ちになっている（仮: 判断が出るまで 018 は着手しない。自前の Service Worker で置き換える案もそこで比べる）
- [ ] Q27: 警告の帯の見た目が MASTER.md と実装でずれている。`design-system/skillweave/MASTER.md` の「警告の帯」は左端に 3px の `--warning` の線を定めているが、`ResultAlert.vue` は薄い背景だけ（仮: 次に `ResultAlert.vue` を触る機能で MASTER.md に合わせる）
- [ ] Q28: PC を主にしたレイアウトの見直し。MASTER.md の方向性は「PC を主とし、スマホでも同じ情報構造にする」だが、Layout の対応画面サイズはモバイルファーストのまま（`md` で最大幅 720px）（仮: 次に検索画面（`SearchView.vue`）のレイアウトを触る機能でブレークポイントを決め、MASTER.md の Layout を直す。005 charm-input では扱わない［005 decisions.md Q26 の検討時に、検索画面の作り直しに波及するため外した］）
- [ ] Q31: 生産護石（マスターの `charms`）をソルバーの候補にする方式。`SolverCharm.id` は `Uuid` 型で、マスターの `CharmId`（`ch:...`）を渡すには `packages/solver` の型の変更が要る。防具と同じく「すべて持っている」とみなすか、所持を入力させるかも未定（仮: 鑑定護石の手入力（005）の後に `/tsod-discover` で機能として機能マップに追加するか決める）
- [ ] Q40: 属性の期待値（`element_add`・`element_mul`・会心撃【属性】）を扱う機能。006 damage-model は物理の期待値だけを扱う（006 decisions.md Q35）（仮: 007 damage-ui の後に `/tsod-discover` で機能として機能マップに追加するか決める）
