import { describe, expect, it } from 'vitest'
import { readSlots, SLOT_REGION } from '@/lib/ocr/slots'

type Rgb = [number, number, number]
const SWORD: Rgb = [217, 207, 207] // 武器用のバッジ（桃色）
const HELMET: Rgb = [211, 221, 223] // 防具用のバッジ（青みの白）
const DASH: Rgb = [110, 110, 110] // スロットが無い位置の横線
const BODY: Rgb = [62, 62, 62]
const DARK: Rgb = [18, 26, 32]

const { width: W, height: H } = SLOT_REGION

function blank(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < px.length; i += 4) px.set([BODY[0], BODY[1], BODY[2], 255], i)
  return px
}

function paint(px: Uint8ClampedArray, x: number, y: number, c: Rgb): void {
  px.set([c[0], c[1], c[2], 255], (y * W + x) * 4)
}

interface CellSpec {
  badge: Rgb | null // null は横線だけ（スロット無し）
  triangles: number
}

/** 合成した画素で、セルごとにバッジ・横線・三角形（暗い区間）を描く。 */
function build(cells: CellSpec[]): Uint8ClampedArray {
  const px = blank()
  cells.forEach((cell, i) => {
    const cx = 4 + 40 * i
    if (cell.badge === null) {
      for (let x = 10; x < 20; x++) paint(px, cx + x, 20, DASH)
      return
    }
    for (let y = 4; y < 20; y++) for (let x = 27; x < 35; x++) paint(px, cx + x, y, cell.badge)
    for (let t = 0; t < cell.triangles; t++) {
      for (let x = 0; x < 3; x++) paint(px, cx + 2 + t * 6 + x, 30, DARK)
    }
  })
  return px
}

describe('readSlots（AC-1・AC-3・AC-6）', () => {
  it('スロットが無い位置は配列に入れず、有る位置の別と Lv を左から返す', () => {
    const px = build([
      { badge: SWORD, triangles: 1 },
      { badge: HELMET, triangles: 2 },
      { badge: null, triangles: 0 },
    ])
    expect(readSlots(px, W, H)).toEqual([
      { target: 'weapon', level: 1 },
      { target: 'armor', level: 2 },
    ])
  })

  it('3つとも有るとき、Lv3 は三角形が3つ', () => {
    const px = build([
      { badge: SWORD, triangles: 1 },
      { badge: HELMET, triangles: 3 },
      { badge: HELMET, triangles: 4 },
    ])
    expect(readSlots(px, W, H)).toEqual([
      { target: 'weapon', level: 1 },
      { target: 'armor', level: 3 },
      { target: 'armor', level: 4 },
    ])
  })

  it('スロットが1つも無ければ空の配列', () => {
    const px = build([
      { badge: null, triangles: 0 },
      { badge: null, triangles: 0 },
      { badge: null, triangles: 0 },
    ])
    expect(readSlots(px, W, H)).toEqual([])
  })

  it('別を判断できない色（無彩色）・Lv を数えられない位置は null', () => {
    const px = build([
      { badge: [200, 200, 200], triangles: 1 },
      { badge: SWORD, triangles: 0 },
      { badge: HELMET, triangles: 0 },
    ])
    expect(readSlots(px, W, H)).toEqual([null, null, null])
  })

  it('入力の幅が基準の整数倍でも、比例させて同じ判定にする', () => {
    const base = build([{ badge: SWORD, triangles: 2 }])
    const scale = 2
    const big = new Uint8ClampedArray(W * scale * H * scale * 4)
    for (let y = 0; y < H * scale; y++) {
      for (let x = 0; x < W * scale; x++) {
        const from = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4
        big.set(base.subarray(from, from + 4), (y * W * scale + x) * 4)
      }
    }
    expect(readSlots(big, W * scale, H * scale)).toEqual([{ target: 'weapon', level: 2 }])
  })

  it('画素が領域の外にかかる小さな入力でも例外にしない', () => {
    expect(readSlots(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toEqual([])
  })
})
