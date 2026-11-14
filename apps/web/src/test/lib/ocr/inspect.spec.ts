import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectCharmImage, isWide, planPreviewRect } from '@/lib/ocr/inspect'

describe('16:9 の判定（AC-3）', () => {
  it.each([
    [1920, 1080],
    [2560, 1440],
    [1366, 768],
  ])('%i x %i は 16:9 とみなす', (w, h) => {
    expect(isWide(w, h)).toBe(true)
  })

  it.each([
    [1920, 1200],
    [3440, 1440],
    [1600, 1200],
    [0, 0],
  ])('%i x %i は 16:9 ではない', (w, h) => {
    expect(isWide(w, h)).toBe(false)
  })
})

describe('切り抜きの矩形（AC-3）', () => {
  it('1920x1080 では、スロットの行とスキルの3枠を含み、8px の余白がある', () => {
    expect(planPreviewRect(1920, 1080)).toEqual({ x: 1230, y: 256, width: 298, height: 287 })
  })

  it('2560x1440 では 4/3 倍', () => {
    expect(planPreviewRect(2560, 1440)).toEqual({ x: 1640, y: 341, width: 397, height: 383 })
  })
})

describe('inspectCharmImage（AC-3）', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubCanvas(): void {
    class FakeCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { drawImage: vi.fn() }
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob(['png']))
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  }

  it('画像として開けなければ notImage', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')))
    expect(await inspectCharmImage(new Blob(['x']))).toEqual({ kind: 'notImage' })
  })

  it('16:9 でなければ notWide（ビットマップは閉じる）', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1600, height: 1200, close }),
    )
    expect(await inspectCharmImage(new Blob(['x']))).toEqual({ kind: 'notWide' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('16:9 なら、切り抜きの PNG を返す（デコードは1回）', async () => {
    stubCanvas()
    const close = vi.fn()
    const decode = vi.fn().mockResolvedValue({ width: 1920, height: 1080, close })
    vi.stubGlobal('createImageBitmap', decode)
    const result = await inspectCharmImage(new Blob(['x']))
    expect(result.kind).toBe('ok')
    expect(result.kind === 'ok' && result.preview).toBeInstanceOf(Blob)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
