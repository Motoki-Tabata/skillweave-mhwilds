import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bundle, dictionary, skillByName } from '../../support/masterFixture'

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  setParameters: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
  prepareImage: vi.fn(),
}))

vi.mock('tesseract.js', () => ({
  createWorker: mocks.createWorker,
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: '6' },
}))
vi.mock('@/lib/ocr/preprocess', () => ({ prepareImage: mocks.prepareImage }))

import { createCharmReader } from '@/lib/ocr'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createWorker.mockResolvedValue({
    setParameters: mocks.setParameters,
    recognize: mocks.recognize,
    terminate: mocks.terminate,
  })
  mocks.prepareImage.mockResolvedValue({
    skillImage: new Blob(['skill']),
    slotPixels: new Uint8ClampedArray(4),
    slotWidth: 1,
    slotHeight: 1,
  })
})

describe('createCharmReader の Tesseract.js の配線', () => {
  it('createWorker に自オリジンの3つのパス・workerBlobURL: false・cacheMethod: none を渡す（AC-4）', async () => {
    await createCharmReader(bundle, dictionary)
    expect(mocks.createWorker).toHaveBeenCalledTimes(1)
    const [lang, oem, options] = mocks.createWorker.mock.calls[0]
    expect(lang).toBe('jpn')
    expect(oem).toBe(1)
    const base = import.meta.env.BASE_URL
    expect(options).toMatchObject({
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/core`,
      langPath: `${base}tesseract/lang`,
      workerBlobURL: false,
      cacheMethod: 'none',
    })
    for (const key of ['workerPath', 'corePath', 'langPath']) {
      expect(options[key]).not.toMatch(/^[a-z]+:\/\//i)
    }
    expect(mocks.setParameters).toHaveBeenCalledWith({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: expect.stringContaining('Lv0123456789'),
    })
  })

  it('認識した文字列を解釈して、スキル・スロット・生の行を返す（AC-1・AC-2・AC-3）', async () => {
    mocks.recognize.mockResolvedValue({ data: { text: '見切り Lv3\n\nABCDEFG Lv1\n' } })
    const reader = await createCharmReader(bundle, dictionary)
    const image = new Blob(['image'])
    const result = await reader.read(image)
    expect(mocks.prepareImage).toHaveBeenCalledWith(image)
    expect(mocks.recognize).toHaveBeenCalledWith(expect.any(Blob))
    expect(result.skills).toEqual([{ skillId: skillByName('見切り').id, level: 3 }, null])
    expect(result.slots).toEqual([])
    expect(result.lines).toEqual(['見切り Lv3', 'ABCDEFG Lv1'])
  })

  it('terminate で worker を終了する', async () => {
    const reader = await createCharmReader(bundle, dictionary)
    await reader.terminate()
    expect(mocks.terminate).toHaveBeenCalledTimes(1)
  })
})
