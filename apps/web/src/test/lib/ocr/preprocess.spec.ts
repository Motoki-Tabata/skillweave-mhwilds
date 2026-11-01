import { afterEach, describe, expect, it, vi } from 'vitest'
import { planSkillRows, planSlotRegion, prepareImage } from '@/lib/ocr/preprocess'

describe('読み取り範囲の計画（AC-1）', () => {
  it('1920x1080 では、スキルの枠が 60px 間隔で3つ並び、名前と Lv を1行に並べ直す', () => {
    const plan = planSkillRows(1920, 1080)
    expect(plan.rows).toHaveLength(3)
    const [name0, level0] = plan.rows[0]
    const [name1] = plan.rows[1]
    expect(name1.source.y - name0.source.y).toBe(60)
    expect(level0.source.y).toBeGreaterThan(name0.source.y)
    // 並べ直した画像の同じ行に、名前（左）と Lv（右）を置く
    expect(level0.destination.x).toBeGreaterThan(name0.destination.x + name0.destination.width)
    expect(level0.destination.x + level0.destination.width).toBeLessThanOrEqual(plan.width)
    expect(plan.height).toBeGreaterThan(plan.rows[2][1].destination.y)
  })

  it('比率の矩形なので、解像度が変わっても同じ位置を指す', () => {
    const full = planSkillRows(1920, 1080).rows[0][0].source
    const half = planSkillRows(960, 540).rows[0][0].source
    expect(half.x).toBe(full.x / 2)
    expect(half.y).toBe(full.y / 2)
    expect(planSlotRegion(960, 540).width).toBe(planSlotRegion(1920, 1080).width / 2)
  })
})

describe('prepareImage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('画像を canvas に描き、スキル欄の画像とスロット欄の画素を返す（ブラウザ内だけで処理する）', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1920, height: 1080, close }),
    )
    const draws: number[][] = []
    class FakeCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        const { width, height } = this
        return {
          fillRect: vi.fn(),
          drawImage: (_b: unknown, ...a: number[]) => draws.push(a),
          getImageData: () => ({
            data: new Uint8ClampedArray([200, 100, 50, 255]),
            width,
            height,
          }),
          putImageData: vi.fn(),
        }
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob(['png']))
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)

    const prepared = await prepareImage(new Blob(['x']))

    expect(prepared.skillImage).toBeInstanceOf(Blob)
    expect(prepared.slotWidth).toBe(planSlotRegion(1920, 1080).width)
    expect(prepared.slotHeight).toBe(planSlotRegion(1920, 1080).height)
    // スキル欄の6か所とスロット欄の1か所を描く
    expect(draws).toHaveLength(7)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
