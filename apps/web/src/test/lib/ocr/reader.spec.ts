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
  PSM: { SINGLE_LINE: '7' },
}))
vi.mock('@/lib/ocr/preprocess', () => ({ prepareImage: mocks.prepareImage }))

import { createCharmReader } from '@/lib/ocr'

const frame = (empty: boolean) => ({ image: new Blob(['skill']), empty })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.setParameters.mockResolvedValue(undefined)
  mocks.terminate.mockResolvedValue(undefined)
  mocks.createWorker.mockResolvedValue({
    setParameters: mocks.setParameters,
    recognize: mocks.recognize,
    terminate: mocks.terminate,
  })
  mocks.prepareImage.mockResolvedValue({
    skillFrames: [frame(false), frame(false), frame(true)],
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
      tessedit_pageseg_mode: '7',
      tessedit_char_whitelist: expect.stringContaining('Lv0123456789'),
    })
  })

  it('枠ごとに認識し、読めない枠は null で位置に残し、空の枠は認識しない（AC-7）', async () => {
    mocks.recognize
      .mockResolvedValueOnce({ data: { text: '見切り Lv3\n' } })
      .mockResolvedValueOnce({ data: { text: 'ABCDEFG Lv1\n' } })
    const reader = await createCharmReader(bundle, dictionary)
    const image = new Blob(['image'])
    const result = await reader.read(image)
    expect(mocks.prepareImage).toHaveBeenCalledWith(image)
    expect(mocks.recognize).toHaveBeenCalledTimes(2)
    expect(result.skills).toEqual([{ skillId: skillByName('見切り').id, level: 3 }, null])
    expect(result.slots).toEqual([])
    expect(result.lines).toEqual(['見切り Lv3', 'ABCDEFG Lv1'])
  })

  it('途中の枠が読めなくても、後の枠を前に詰めない（AC-7）', async () => {
    mocks.prepareImage.mockResolvedValue({
      skillFrames: [frame(false), frame(false), frame(false)],
      slotPixels: new Uint8ClampedArray(4),
      slotWidth: 1,
      slotHeight: 1,
    })
    mocks.recognize
      .mockResolvedValueOnce({ data: { text: '見切り Lv3' } })
      .mockResolvedValueOnce({ data: { text: '' } })
      .mockResolvedValueOnce({ data: { text: '渾身 Lv1' } })
    const reader = await createCharmReader(bundle, dictionary)
    const result = await reader.read(new Blob(['image']))
    expect(result.skills).toEqual([
      { skillId: skillByName('見切り').id, level: 3 },
      null,
      { skillId: skillByName('渾身').id, level: 1 },
    ])
  })

  it('すべて空の枠なら認識せず、スキルなしを返す（AC-7）', async () => {
    mocks.prepareImage.mockResolvedValue({
      skillFrames: [frame(true), frame(true), frame(true)],
      slotPixels: new Uint8ClampedArray(4),
      slotWidth: 1,
      slotHeight: 1,
    })
    const reader = await createCharmReader(bundle, dictionary)
    const result = await reader.read(new Blob(['image']))
    expect(mocks.recognize).not.toHaveBeenCalled()
    expect(result.skills).toEqual([])
  })

  it('setParameters が失敗したら、worker を終了して例外を投げ直す（AC-8）', async () => {
    mocks.setParameters.mockRejectedValue(new Error('param'))
    await expect(createCharmReader(bundle, dictionary)).rejects.toThrow('param')
    expect(mocks.terminate).toHaveBeenCalledTimes(1)
  })

  it('setParameters の失敗の後の terminate が失敗しても、元の例外を投げる（AC-8）', async () => {
    mocks.setParameters.mockRejectedValue(new Error('param'))
    mocks.terminate.mockRejectedValue(new Error('term'))
    await expect(createCharmReader(bundle, dictionary)).rejects.toThrow('param')
  })

  it('createWorker が失敗したら例外を投げ、reader を返さない（AC-8）', async () => {
    mocks.createWorker.mockRejectedValue(new Error('init'))
    await expect(createCharmReader(bundle, dictionary)).rejects.toThrow('init')
  })

  it('terminate で worker を終了する', async () => {
    const reader = await createCharmReader(bundle, dictionary)
    await reader.terminate()
    expect(mocks.terminate).toHaveBeenCalledTimes(1)
  })
})
