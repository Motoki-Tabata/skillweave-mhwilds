import type { Slot, SlotLevel, SlotTarget } from '@swv/data'

/**
 * スロット欄の判定（画素のみ。画像・canvas・Tesseract.js に依存しない純粋な関数）。
 *
 * 規則の根拠: オーナーが置いた 1920x1080 の護石の詳細画面（e2e/measure/charm-ocr/images/）の
 * 「装備詳細」の「スロット」の行（x 1396〜1520・y 264〜300）を拡大して見た。
 * - 行には3つの位置が 40px 間隔で並ぶ。スロットがある位置は、装飾品の台座の絵（幅 約27px）と、
 *   その右上のバッジ（武器用＝剣・防具用＝兜）が描かれ、無い位置は灰色の短い横線（—）だけが描かれる。
 *   無い位置は必ず右側に並ぶ（charm-001 の 2個・charm-003 の 1個・charm-008 の 3個など）。
 * - 武器用か防具用か: バッジの明るい画素の色味で分ける。剣は桃色（R−B が約 +10。charm-001 の1番目）、
 *   兜は青みの白（R−B が約 −12。charm-001 の2番目・3番目）。
 * - Lv: 台座の下端の三角形の数が Lv と等しい（Lv1＝1個・Lv2＝2個・Lv3＝3個。charm-001・charm-011・
 *   charm-015 で確認）。台座の下端近くの1本の走査線で、暗い画素（三角形の内側）の連続した区間を数える。
 *   Lv4 は画像に無いため確かめていない。同じ規則で4個として扱う。
 * 公式のアイコンの画像・切り抜きはテンプレートに使わない。色と画素数だけで判定する。
 * 座標は基準の幅 SLOT_REGION.width の領域を前提に、入力の幅に合わせて比例させる。
 */

/** 切り出すスロットの行の矩形（1920x1080 の画像に対する画素。preprocess が比率にして使う） */
export const SLOT_REGION = { x: 1396, y: 264, width: 124, height: 36 } as const

const POSITIONS = 3
const PITCH = 40
const FIRST_CELL_X = 4

/** バッジの窓（セルの左端からの相対）。右隣のセルの台座にかからない範囲 */
const BADGE = { x: 24, y: 3, width: 16, height: 19 } as const
const BRIGHT_LUMA = 150
/** バッジの明るい画素がこの数に満たなければ、スロットは無い（灰色の横線は明るさが足りない） */
const MIN_BADGE_PIXELS = 12
/** 明るい画素の R−B の平均の絶対値がこの値未満なら、剣か兜か判断しない */
const MIN_TINT = 3

/** 三角形を数える走査線の y と x の範囲（セルの左端からの相対） */
const TRIANGLE_ROW = { y: 30, from: 1, to: 26 } as const
const DARK_LUMA = 26
const MIN_RUN = 3

interface Frame {
  pixels: ArrayLike<number>
  width: number
  height: number
  scale: number
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function rgbAt(frame: Frame, x: number, y: number): [number, number, number] | null {
  const px = Math.round(x * frame.scale)
  const py = Math.round(y * frame.scale)
  if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return null
  const k = (py * frame.width + px) * 4
  return [frame.pixels[k], frame.pixels[k + 1], frame.pixels[k + 2]]
}

/** バッジの窓の明るい画素の数と、R−B の平均 */
function badgeStats(frame: Frame, cellX: number): { count: number; tint: number } {
  let count = 0
  let tintSum = 0
  for (let y = BADGE.y; y < BADGE.y + BADGE.height; y++) {
    for (let x = cellX + BADGE.x; x < cellX + BADGE.x + BADGE.width; x++) {
      const c = rgbAt(frame, x, y)
      if (c && luma(...c) >= BRIGHT_LUMA) {
        count++
        tintSum += c[0] - c[2]
      }
    }
  }
  return { count, tint: count === 0 ? 0 : tintSum / count }
}

function targetOf(tint: number): SlotTarget | null {
  if (tint >= MIN_TINT) return 'weapon'
  if (tint <= -MIN_TINT) return 'armor'
  return null
}

/** 台座の下端の走査線にある暗い区間（三角形）の数 */
function countTriangles(frame: Frame, cellX: number): number {
  let runs = 0
  let length = 0
  for (let x = cellX + TRIANGLE_ROW.from; x <= cellX + TRIANGLE_ROW.to + 1; x++) {
    const c = x <= cellX + TRIANGLE_ROW.to ? rgbAt(frame, x, TRIANGLE_ROW.y) : null
    if (c && luma(...c) < DARK_LUMA) {
      length++
      continue
    }
    if (length >= MIN_RUN) runs++
    length = 0
  }
  return runs
}

function isSlotLevel(n: number): n is SlotLevel {
  return n >= 1 && n <= 4
}

/**
 * スロット欄の RGBA の画素から、スロットを左から並べて返す。スロットが無い位置は配列に入れない。
 * スロットはあるが別か Lv を判定できない位置は null にする（推測で埋めない）。
 */
export function readSlots(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): (Slot | null)[] {
  const frame: Frame = { pixels, width, height, scale: width / SLOT_REGION.width }
  const slots: (Slot | null)[] = []
  for (let i = 0; i < POSITIONS; i++) {
    const cellX = FIRST_CELL_X + PITCH * i
    const badge = badgeStats(frame, cellX)
    if (badge.count < MIN_BADGE_PIXELS) continue
    const target = targetOf(badge.tint)
    const level = countTriangles(frame, cellX)
    slots.push(target && isSlotLevel(level) ? { target, level } : null)
  }
  return slots
}
