# 026 design-system-alignment の決定記録

## Q27（決定: 2026-10-30）
- 問い: 警告の帯の見た目が MASTER.md と実装でずれている。`design-system/skillweave/MASTER.md` の「警告の帯」は左端に 3px の `--warning` の線を定めているが、`ResultAlert.vue` は薄い背景だけ（仮: 026 design-system-alignment で MASTER.md に合わせる）
- 決定: 仮のとおり、実装を MASTER.md の「警告の帯」に合わせる。`ResultAlert.vue` の `warning` に、1px の `--border` の枠と左端の 3px の `--warning` の線を付ける。MASTER.md は変えない。帯の背景の細部（`--warning` を混ぜる割合）は、既に MASTER.md に合わせて作られている `CharmMatchResult.vue` の帯と見比べて区間 B で決める。
- 理由: MASTER.md がデザインシステムの唯一の正で、左端の線は「色だけで伝えない」の形の手がかりになる。同じ帯を `CharmMatchResult.vue` は MASTER.md どおりに作っており、`ResultAlert.vue` だけが外れている。

## Q94（決定: 2026-10-30）
- 問い: 見出しの `font-semibold`（600）が MASTER.md「Typography」のウェイト3種（400・500・700）と食い違う（`tasks/lessons.md` 2026-10-26・2026-10-28）。MASTER.md に 600 を足すか、実装を 700 に揃えるか。
- 決定: 実装を 700 に揃える。`apps/web/src/main/**` の `font-semibold` をすべて `font-bold` に置き換える（`components/ui/` の `CardTitle`・`DialogTitle`・`AlertDialogTitle` を含む）。MASTER.md は変えない。
- 理由: Google Fonts は IBM Plex Sans JP と Inter を 400・500・700 だけ配信しており（`apps/web/index.html`）、600 の指定はフォントの読み込み後には既に 700 で描かれている。置き換えで見た目が変わるのはフォールバックのシステムフォントの間だけで、配信するフォントを増やさずに済む。

## Q95（決定: 2026-10-30）
- 問い: MASTER.md「Shape」は「影を使わない」と定めるが、手書きの部品と `components/ui/` に `shadow-*` のクラスが残っている（`tasks/lessons.md` 2026-10-28）。`main.css` は `--shadow-*` をすべて `0 0 #0000` にして打ち消しており、画面には影が出ていない。どう扱うか。
- 決定: `components/ui/` の `shadow-*` は残し、`main.css` のトークンで打ち消すことを MASTER.md に明記する（Q97 の節）。手書きの部品（`PickerDialog.vue`・`BuildDialogFrame.vue`・`AppToaster.vue`・`AuthControls.vue`・`ResultBuildCard.vue`）の `shadow-*` は消す。`shadow-none` のように影を消す指定も、トークンで打ち消し済みなので消す。
- 理由: 見た目は既に MASTER.md どおりで、食い違いはソースの書き方だけにある。手書きの部品の `shadow-*` は新しい部品に書き写されて増えてきた（011 の `BuildDialogFrame.vue`）ので消す。`components/ui/` は shadcn の元のソースとの差分を増やさないために残す。

## Q96（決定: 2026-10-30）
- 問い: `components/ui/button` の `outline` が MASTER.md「Buttons」の `.btn-outline`（枠 `--input`・背景は透明・hover で `--muted`）と違う。ライトの枠が `--border`、ダークの面が `bg-input/30` になっている（009 handoff.md の持ち越し）。どこまで揃えるか。
- 決定: ライトとダークの両方で MASTER.md の `.btn-outline` に揃える（枠 `--input`・背景は透明・hover で `--muted`）。ダークの `bg-input/30` の面も無くなる。`outline` の見た目を複製したクラス列（`AuthControls.vue` のログインのリンク・`ResultBuildCard.vue` の保存のボタン。`md` 以上だけ outline にしている）も、同じ見た目に揃える。複製を部品に寄せるかは区間 C で決める。
- 理由: MASTER.md がデザインシステムの唯一の正で、`--input` は部品の境界を示す線として 3:1 のコントラストを確かめた色（MASTER.md「Contrast」）。ライトの `--border` は装飾の罫線で 3:1 を求めていない。複製を残すと、`outline` を直したときに食い違う（009 のレビュー記録の持ち越し）。

## Q97（決定: 2026-10-30）
- 問い: 生成部品（`components/ui/`）の見た目が MASTER.md と違うとき、どこを直すか。`ui/` のソースを直すか、使う側の `class` で上書きするか（`tasks/lessons.md` 2026-10-28「MASTER.md 側で shadcn の既定の扱いを決める」）。
- 決定: `components/ui/` のソースを直接直す。026 で直すのは、Title 3つのウェイト（Q94）、`outline`（Q96）、オーバーレイの濃さ（`AlertDialogContent.vue`・`DialogOverlay.vue`・`DialogScrollContent.vue` の `bg-black/80` を MASTER.md「Modals」の 0.6 にする）。MASTER.md に「生成部品（`components/ui`）の扱い」を足し、トークンで打ち消すもの（角丸・影）と、ソースを直したもの（Title のウェイト・`outline`・オーバーレイの濃さ）を列挙し、shadcn-vue の CLI で上書きしたときは列挙したものを直し直すと書く。
- 理由: 憲法は shadcn-vue の部品を npm の依存ではなくソースのコピーとして持つと定めており、ソースを直すのが素直である。`AlertDialogContent.vue` はオーバーレイに `class` を渡す口を持たないので、使う側の上書きでは直せない。直したものを MASTER.md に列挙しておけば、CLI で上書きしたときに戻ったものが分かる。
