次の番号: Q58

## 要確認事項
- [ ] Q6: 018 pwa-offline の導入方式。`vite-plugin-pwa` は `design/tech-stack.md`「判断 3」でサプライチェーン対策の判断待ちになっている（仮: 判断が出るまで 018 は着手しない。自前の Service Worker で置き換える案もそこで比べる）
- [ ] Q27: 警告の帯の見た目が MASTER.md と実装でずれている。`design-system/skillweave/MASTER.md` の「警告の帯」は左端に 3px の `--warning` の線を定めているが、`ResultAlert.vue` は薄い背景だけ（仮: 次に `ResultAlert.vue` を触る機能で MASTER.md に合わせる）
- [ ] Q28: PC を主にしたレイアウトの見直し。MASTER.md の方向性は「PC を主とし、スマホでも同じ情報構造にする」だが、Layout の対応画面サイズはモバイルファーストのまま（`md` で最大幅 720px）（仮: 次に検索画面（`SearchView.vue`）のレイアウトを触る機能でブレークポイントを決め、MASTER.md の Layout を直す。005 charm-input では扱わない［005 decisions.md Q26 の検討時に、検索画面の作り直しに波及するため外した］）
- [ ] Q31: 生産護石（マスターの `charms`）をソルバーの候補にする方式。`SolverCharm.id` は `Uuid` 型で、マスターの `CharmId`（`ch:...`）を渡すには `packages/solver` の型の変更が要る。防具と同じく「すべて持っている」とみなすか、所持を入力させるかも未定（仮: 鑑定護石の手入力（005）の後に `/tsod-discover` で機能として機能マップに追加するか決める）
- [ ] Q40: 属性の期待値（`element_add`・`element_mul`・会心撃【属性】）を扱う機能。006 damage-model は物理の期待値だけを扱う（006 decisions.md Q35）（仮: 007 damage-ui の後に `/tsod-discover` で機能として機能マップに追加するか決める）
- [ ] Q50: ブラウザの Worker 上の `expectedDamage` の1件目までの時間が 3 秒を超えた（最大 3353.6 ms。Node の 2609.6 ms より約 0.74 秒遅い。記録は `design/tech-stack.md`「ブラウザの Worker 上の expectedDamage の測定（007 damage-ui・2026-10-26）」）。また解ありの 3 ケースは合計時間が画面の上限 30 秒に近く、k=3 は 3 回とも打ち切られた（8 件）。求解の高速化（1件目の求解の短縮・候補の絞り込みなど）で 3 秒以内に収めるか、基準を見直すか（仮: 007 では対処せず、`packages/solver` の性能改善を独立した機能として `/tsod-discover` で機能マップに追加するか決める。逐次表示（007）で1件目は 3.4 秒後に画面に出るので、使えないほどではない）
