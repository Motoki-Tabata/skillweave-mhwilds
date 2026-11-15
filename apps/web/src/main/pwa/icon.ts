// アプリのアイコンの幾何（screen-design.md「アイコンの図案」・plan.md D13）。
// 1つのデータ（rect の並び）から、SVG と PNG の両方を作る。後に並ぶ rect が上に描かれる。

export type IconKind = 'any' | 'maskable'

export interface IconRect {
  /** キャンバスの一辺を 1 とした座標と大きさ。 */
  x: number
  y: number
  w: number
  h: number
  /** `#rrggbb` */
  color: string
}

export const ICON_GROUND = '#0f1317'
export const ICON_VERTICAL = '#f68534'
export const ICON_HORIZONTAL = '#a1a9b0'

// 印の一辺を 9 とした単位。帯の太さ 1・隙間は帯の 0.3 倍・帯の中心は 2 / 4.5 / 7。
const MARK_UNITS = 9
const BAND = 1
const GAP = 0.3
const CENTERS = [2, 4.5, 7]
// 印の一辺がキャンバスに占める割合。
const MARK_RATIO: Record<IconKind, number> = { any: 0.62, maskable: 0.5 }

type UnitRect = Omit<IconRect, 'color'> & { color: string }

function rect(x: number, y: number, w: number, h: number, color: string): UnitRect {
  return { x, y, w, h, color }
}

// 交点 (i, j)（i: 縦の帯・j: 横の帯）で上になる帯の両側に地の色の隙間を入れ、その帯で交点を塗る。
function crossing(i: number, j: number): UnitRect[] {
  const x = CENTERS[i]! - BAND / 2
  const y = CENTERS[j]! - BAND / 2
  if ((i + j) % 2 === 0) {
    return [
      rect(x - GAP, y, BAND + 2 * GAP, BAND, ICON_GROUND),
      rect(x, y, BAND, BAND, ICON_VERTICAL),
    ]
  }
  return [
    rect(x, y - GAP, BAND, BAND + 2 * GAP, ICON_GROUND),
    rect(x, y, BAND, BAND, ICON_HORIZONTAL),
  ]
}

function markRects(): UnitRect[] {
  const verticals = CENTERS.map((c) => rect(c - BAND / 2, 0, BAND, MARK_UNITS, ICON_VERTICAL))
  const horizontals = CENTERS.map((c) => rect(0, c - BAND / 2, MARK_UNITS, BAND, ICON_HORIZONTAL))
  const crossings = CENTERS.flatMap((_, i) => CENTERS.flatMap((__, j) => crossing(i, j)))
  return [...verticals, ...horizontals, ...crossings]
}

export function iconRects(kind: IconKind): IconRect[] {
  const ratio = MARK_RATIO[kind]
  const unit = ratio / MARK_UNITS
  const origin = (1 - ratio) / 2
  return [
    rect(0, 0, 1, 1, ICON_GROUND),
    ...markRects().map((r) =>
      rect(origin + r.x * unit, origin + r.y * unit, r.w * unit, r.h * unit, r.color),
    ),
  ]
}

const SVG_SIZE = 1000

function num(value: number): string {
  return String(Number((value * SVG_SIZE).toFixed(2)))
}

/** `/icons/icon.svg`（通常の置き方）。 */
export function iconSvg(): string {
  const body = iconRects('any')
    .map(
      (r) =>
        `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" fill="${r.color}"/>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="512" height="512">${body}</svg>\n`
}

function parseColor(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
}

const SAMPLES = 4

/** 画素ごとに 4×4 の標本の色を平均した RGBA 8bit の生データ（フィルタなし）。 */
export function rasterize(kind: IconKind, size: number): Uint8Array<ArrayBuffer> {
  const grid = size * SAMPLES
  const rects = iconRects(kind)
  const palette = rects.map((r) => parseColor(r.color))
  // 標本の格子に、rect を順に塗って（後の rect が上）、各標本がどの rect の色かを持つ。
  const owner = new Uint8Array(grid * grid)
  // 標本 i の中心 (i + 0.5) / grid が [from, from + length) に入る i の範囲。
  const span = (from: number, length: number): [number, number] => [
    Math.max(0, Math.ceil(from * grid - 0.5)),
    Math.min(grid, Math.ceil((from + length) * grid - 0.5)),
  ]
  rects.forEach((r, index) => {
    const [x0, x1] = span(r.x, r.w)
    const [y0, y1] = span(r.y, r.h)
    for (let y = y0; y < y1; y++) owner.fill(index, y * grid + x0, y * grid + x1)
  })
  const out = new Uint8Array(size * size * 4)
  const count = SAMPLES * SAMPLES
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        const row = (py * SAMPLES + sy) * grid + px * SAMPLES
        for (let sx = 0; sx < SAMPLES; sx++) {
          const rgb = palette[owner[row + sx]!]!
          sum[0]! += rgb[0]
          sum[1]! += rgb[1]
          sum[2]! += rgb[2]
        }
      }
      const at = (py * size + px) * 4
      out[at] = Math.round(sum[0]! / count)
      out[at + 1] = Math.round(sum[1]! / count)
      out[at + 2] = Math.round(sum[2]! / count)
      out[at + 3] = 255
    }
  }
  return out
}
