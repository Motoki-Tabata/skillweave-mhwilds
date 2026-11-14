import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { EffectScope } from 'vue'
import type { MasterBundle, MasterDictionary } from '@swv/data'
import { inspectCharmImage } from '@/lib/ocr/inspect'
import { createCharmReader } from '@/lib/ocr/reader'
import type { CharmReader, CharmReadResult } from '@/lib/ocr/types'
import { OCR_MAX_IMAGES, useCharmOcrQueue } from '@/lib/ocr/useCharmOcrQueue'
import type { CharmOcrQueue } from '@/lib/ocr/useCharmOcrQueue'

vi.mock('@/lib/ocr/inspect', () => ({ inspectCharmImage: vi.fn() }))
vi.mock('@/lib/ocr/reader', () => ({ createCharmReader: vi.fn() }))

const inspectMock = vi.mocked(inspectCharmImage)
const createReaderMock = vi.mocked(createCharmReader)

const SOURCE = { bundle: {} as MasterBundle, dictionary: {} as MasterDictionary }
const EMPTY: CharmReadResult = { skills: [], slots: [], lines: [] }

const file = (name: string): File => new File(['x'], name, { type: 'image/png' })

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useCharmOcrQueue（待ち列・D11〜D13）', () => {
  let scope: EffectScope
  let queue: CharmOcrQueue
  let enabled = true
  let terminate: ReturnType<typeof vi.fn>
  let read: ReturnType<typeof vi.fn>
  let urlCounter = 0
  let revoked: string[] = []
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  function setup(): void {
    scope = effectScope()
    queue = scope.run(() =>
      useCharmOcrQueue({ source: () => SOURCE, enabled: () => enabled }),
    ) as CharmOcrQueue
  }

  beforeEach(() => {
    enabled = true
    urlCounter = 0
    revoked = []
    URL.createObjectURL = () => `blob:preview-${(urlCounter += 1)}`
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url)
    }
    inspectMock.mockReset()
    inspectMock.mockImplementation(async (image) => {
      const name = (image as File).name
      if (name.startsWith('bad')) return { kind: 'notImage' }
      if (name.startsWith('tall')) return { kind: 'notWide' }
      return { kind: 'ok', preview: new Blob(['p']) }
    })
    terminate = vi.fn(async () => undefined)
    read = vi.fn(async (image: Blob) => ({ ...EMPTY, lines: [(image as File).name] }))
    createReaderMock.mockReset()
    createReaderMock.mockImplementation(async () => ({ read, terminate }) as CharmReader)
    setup()
  })

  afterEach(() => {
    scope.stop()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('AC-9: accept するまで createCharmReader を呼ばず、最初の accept で1回だけ呼んで使い回す', async () => {
    expect(createReaderMock).not.toHaveBeenCalled()
    await queue.accept([file('a.png')], 'pick')
    expect(createReaderMock).toHaveBeenCalledTimes(1)
    expect(createReaderMock).toHaveBeenCalledWith(SOURCE.bundle, SOURCE.dictionary)
    await queue.accept([file('b.png')], 'pick')
    expect(createReaderMock).toHaveBeenCalledTimes(1)
  })

  it('AC-9: 読み取れる画像が無いとき（すべて対象外）は reader を作らない', async () => {
    await queue.accept([file('tall.png'), file('bad.png')], 'pick')
    expect(createReaderMock).not.toHaveBeenCalled()
    expect(queue.phase.value).toBe('idle')
  })

  it('AC-1: 渡した順に読み取り、待ち列の末尾へ足す', async () => {
    await queue.accept([file('c.png'), file('a.png'), file('b.png')], 'drop')
    expect(queue.items.value.map((item) => item.name)).toEqual(['c.png', 'a.png', 'b.png'])
    expect(queue.items.value.map((item) => item.result.lines[0])).toEqual([
      'c.png',
      'a.png',
      'b.png',
    ])
    expect(queue.head.value?.name).toBe('c.png')
    expect(queue.phase.value).toBe('idle')
    // 読み終えた後に渡した画像は、末尾に足す
    await queue.accept([file('d.png')], 'pick')
    expect(queue.items.value.map((item) => item.name)).toEqual(['c.png', 'a.png', 'b.png', 'd.png'])
  })

  it('AC-1: 貼り付けた画像は、ファイル名によらず「貼り付けた画像 <i>」にする', async () => {
    await queue.accept([file('image.png'), file('image.png')], 'paste')
    expect(queue.items.value.map((item) => item.name)).toEqual([
      '貼り付けた画像 1',
      '貼り付けた画像 2',
    ])
  })

  it('AC-1: 読み取り中は進み具合（k / n）を出し、読み取り中に渡された画像は受け付けない', async () => {
    const gate = deferred<CharmReadResult>()
    read.mockImplementationOnce(() => gate.promise)
    const running = queue.accept([file('a.png'), file('b.png')], 'pick')
    await vi.waitFor(() => expect(queue.phase.value).toBe('reading'))
    expect(queue.progress.value).toEqual({ k: 1, n: 2 })
    const callsBefore = inspectMock.mock.calls.length
    await queue.accept([file('c.png')], 'pick')
    expect(inspectMock).toHaveBeenCalledTimes(callsBefore)
    gate.resolve(EMPTY)
    await running
    expect(queue.items.value.map((item) => item.name)).toEqual(['a.png', 'b.png'])
    expect(queue.progress.value).toEqual({ k: 2, n: 2 })
  })

  it('AC-1: 準備中（reader を作っているあいだ）も新しい画像は受け付けない', async () => {
    const gate = deferred<CharmReader>()
    createReaderMock.mockImplementationOnce(() => gate.promise)
    const running = queue.accept([file('a.png')], 'pick')
    await vi.waitFor(() => expect(createReaderMock).toHaveBeenCalled())
    expect(queue.phase.value).toBe('preparing')
    await queue.accept([file('b.png')], 'pick')
    expect(inspectMock).toHaveBeenCalledTimes(1)
    gate.resolve({ read, terminate } as unknown as CharmReader)
    await running
    expect(queue.items.value).toHaveLength(1)
  })

  it('AC-1: 無効のあいだ・0枚のときは何もしない', async () => {
    enabled = false
    await queue.accept([file('a.png')], 'pick')
    enabled = true
    await queue.accept([], 'pick')
    expect(inspectMock).not.toHaveBeenCalled()
    expect(queue.items.value).toHaveLength(0)
  })

  it('AC-2: 先頭の 20 枚だけを読み取り、読み取らなかった枚数を数える', async () => {
    const files = Array.from({ length: 23 }, (_, i) => file(`img-${i + 1}.png`))
    await queue.accept(files, 'pick')
    expect(OCR_MAX_IMAGES).toBe(20)
    expect(inspectMock).toHaveBeenCalledTimes(20)
    expect(queue.items.value).toHaveLength(20)
    expect(queue.items.value[19].name).toBe('img-20.png')
    expect(queue.overflow.value).toBe(3)
  })

  it('AC-2: 対象外の画像も 20 枚の数に含める', async () => {
    const files = [file('tall-1.png'), ...Array.from({ length: 20 }, (_, i) => file(`ok-${i}.png`))]
    await queue.accept(files, 'pick')
    expect(queue.items.value).toHaveLength(19)
    expect(queue.overflow.value).toBe(1)
    expect(queue.skipped.value).toHaveLength(1)
  })

  it('AC-3: 16:9 でない画像・画像として開けない画像は理由を残して読まず、ほかの画像は続ける', async () => {
    await queue.accept([file('a.png'), file('tall.png'), file('bad.png'), file('b.png')], 'pick')
    expect(queue.skipped.value).toEqual([
      { name: 'tall.png', reason: 'notWide' },
      { name: 'bad.png', reason: 'notImage' },
    ])
    expect(queue.items.value.map((item) => item.name)).toEqual(['a.png', 'b.png'])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('AC-3: 読み取らなかった画像の記録は、次に accept したときと clear で消える', async () => {
    await queue.accept([file('tall.png'), file('a.png')], 'pick')
    expect(queue.skipped.value).toHaveLength(1)
    queue.clear()
    expect(queue.skipped.value).toEqual([])
    await queue.accept([file('tall.png')], 'pick')
    expect(queue.skipped.value).toHaveLength(1)
    await queue.accept([file('b.png')], 'pick')
    expect(queue.skipped.value).toEqual([])
  })

  it('AC-8: reader を作れなかったら、準備の失敗として記録し、次の accept で作り直す', async () => {
    createReaderMock.mockRejectedValueOnce(new Error('load failed'))
    await queue.accept([file('a.png')], 'pick')
    expect(queue.failure.value).toEqual({ kind: 'prepare' })
    expect(queue.phase.value).toBe('idle')
    expect(queue.items.value).toHaveLength(0)
    await queue.accept([file('a.png')], 'pick')
    expect(queue.failure.value).toBeNull()
    expect(createReaderMock).toHaveBeenCalledTimes(2)
    expect(queue.items.value).toHaveLength(1)
  })

  it('AC-8: k 枚目の読み取りが失敗したら、残りを読まず、reader を終了し、読めた分を残す', async () => {
    read.mockImplementationOnce(async () => EMPTY)
    read.mockImplementationOnce(async () => {
      throw new Error('boom')
    })
    await queue.accept([file('a.png'), file('b.png'), file('c.png')], 'pick')
    expect(queue.failure.value).toEqual({ kind: 'read', index: 2 })
    expect(queue.items.value.map((item) => item.name)).toEqual(['a.png'])
    expect(read).toHaveBeenCalledTimes(2)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(queue.phase.value).toBe('idle')
    // 次の accept で reader を作り直す
    await queue.accept([file('d.png')], 'pick')
    expect(createReaderMock).toHaveBeenCalledTimes(2)
    expect(queue.failure.value).toBeNull()
  })

  it('AC-10: 待ち列の項目は元の画像を持たない', async () => {
    await queue.accept([file('a.png')], 'pick')
    const values = Object.values(queue.items.value[0])
    expect(values.some((value) => value instanceof Blob)).toBe(false)
    expect(queue.items.value[0].previewUrl).toBe('blob:preview-1')
  })

  it('AC-6: next は先頭の1件と切り抜きの URL を捨てる', async () => {
    await queue.accept([file('a.png'), file('b.png')], 'pick')
    queue.next()
    expect(revoked).toEqual(['blob:preview-1'])
    expect(queue.items.value.map((item) => item.name)).toEqual(['b.png'])
    queue.next()
    queue.next()
    expect(queue.items.value).toEqual([])
    expect(queue.head.value).toBeNull()
  })

  it('AC-10: clear は待ち列と切り抜きの URL をすべて捨てる', async () => {
    await queue.accept([file('a.png'), file('b.png')], 'pick')
    queue.clear()
    expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
    expect(queue.items.value).toEqual([])
  })

  it('AC-10: スコープを離れたら、待ち列の URL を捨て、worker を終了する', async () => {
    await queue.accept([file('a.png'), file('b.png')], 'pick')
    scope.stop()
    expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
    expect(queue.items.value).toEqual([])
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1))
  })

  it('AC-10: 読み取り中にスコープを離れたら、読みを止め、届いた結果を捨てる', async () => {
    const gate = deferred<CharmReadResult>()
    read.mockImplementationOnce(() => gate.promise)
    const running = queue.accept([file('a.png'), file('b.png')], 'pick')
    await vi.waitFor(() => expect(queue.phase.value).toBe('reading'))
    scope.stop()
    gate.resolve(EMPTY)
    await running
    expect(queue.items.value).toEqual([])
    expect(read).toHaveBeenCalledTimes(1)
    expect(urlCounter).toBe(0)
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1))
  })

  it('AC-10: 準備中にスコープを離れたら、作れた reader を終了する', async () => {
    const gate = deferred<CharmReader>()
    createReaderMock.mockImplementationOnce(() => gate.promise)
    const running = queue.accept([file('a.png')], 'pick')
    await vi.waitFor(() => expect(createReaderMock).toHaveBeenCalled())
    scope.stop()
    gate.resolve({ read, terminate } as unknown as CharmReader)
    await running
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(read).not.toHaveBeenCalled()
  })
})
