import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { inspectCharmImage } from '@/lib/ocr/inspect'
import { createCharmReader } from '@/lib/ocr/reader'
import type { CharmReader, CharmReadResult } from '@/lib/ocr/types'
import type { CharmPayload } from '@/lib/charms/types'
import { createMemoryCharmRepository } from '../support/charmRepository'
import type { MemoryCharmRepository } from '../support/charmRepository'
import { storedCharm } from '../support/charms'
import { makeTableBundle, sk } from '../support/fixtures'
import {
  click,
  findButton,
  findByLabel,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'

vi.mock('@/lib/ocr/inspect', () => ({ inspectCharmImage: vi.fn() }))
vi.mock('@/lib/ocr/reader', () => ({ createCharmReader: vi.fn() }))

const inspectMock = vi.mocked(inspectCharmImage)
const createReaderMock = vi.mocked(createCharmReader)

const SLOW = 20000
const body = () => textOf(document.body)

const UNREAD_TEXT = '読み取れませんでした。画像を見て選んでください。'
const SLOT_ERROR = 'スロットを選んでください。無ければ「なし」を選んでください。'

/** 護石の登録の表（passing は table の P1 に合う） */
const passing: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}

/** 読み取り結果。ファイル名で引く。 */
const matching: CharmReadResult = {
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
  lines: [],
}
/** 画面設計の例: スキル2とスロット2が読めなかった */
const partial: CharmReadResult = {
  skills: [{ skillId: sk('a1'), level: 3 }, null],
  slots: [{ target: 'weapon', level: 2 }, null],
  lines: [],
}

const file = (name: string): File => new File(['x'], name, { type: 'image/png' })

describe('CharmsView の画像からの読み取り（016 T4）', { timeout: SLOW }, () => {
  let mounted: Mounted | null = null
  let results: Record<string, CharmReadResult>
  let terminate: ReturnType<typeof vi.fn>
  let revoked: string[]
  let urlCounter: number
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeAll(installDomPolyfills)

  beforeEach(() => {
    results = {}
    revoked = []
    urlCounter = 0
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
    createReaderMock.mockReset()
    createReaderMock.mockImplementation(
      async () =>
        ({
          read: async (image: Blob) => results[(image as File).name] ?? matching,
          terminate,
        }) as CharmReader,
    )
  })

  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  async function ready(repository?: MemoryCharmRepository): Promise<Mounted> {
    stubBackend({ bundle: makeTableBundle() })
    mounted = await mountReadyApp({ path: '/charms', charmRepository: repository })
    await vi.waitFor(() => expect(mounted!.charms.status).not.toBe('loading'))
    await flushPromises()
    return mounted
  }

  const zone = () => document.querySelector<HTMLElement>('[data-testid="ocr-drop-zone"]')!
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
  const progress = () => textOf(document.querySelector('output'))
  const radio = (value: number) =>
    document.querySelector<HTMLElement>(`[role="radio"][value="${value}"]`)!
  const skillInput = (row: number) =>
    document.getElementById(`charm-skill-${row}`) as HTMLInputElement
  const slotTrigger = (row: number) => document.getElementById(`charm-slot-${row}`)!
  const options = () => Array.from(document.querySelectorAll('[role="option"]'))
  const unreadMarks = () => (body().match(new RegExp(UNREAD_TEXT, 'g')) ?? []).length

  async function pick(...files: File[]): Promise<void> {
    Object.defineProperty(fileInput(), 'files', { value: files, configurable: true })
    fileInput().dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  function pasteEvent(files: File[]): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files } })
    return event
  }

  async function paste(...files: File[]): Promise<Event> {
    const event = pasteEvent(files)
    document.body.dispatchEvent(event)
    await flushPromises()
    return event
  }

  function dragEvent(type: string, files: File[]): Event {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } })
    return event
  }

  async function drop(target: Element, ...files: File[]): Promise<Event> {
    const event = dragEvent('drop', files)
    target.dispatchEvent(event)
    await flushPromises()
    return event
  }

  async function chooseOption(trigger: HTMLElement, label: string): Promise<void> {
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
    const option = options().find((o) => textOf(o) === label)
    if (option === undefined) throw new Error(`選択肢「${label}」がありません`)
    option.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options()).toHaveLength(0))
    await flushPromises()
  }

  const submit = () => click(findButton('登録'))

  describe('受け取り（AC-1）', () => {
    it('AC-1: 画面を開いただけでは reader を作らず（AC-9）、カードの固定の文言を出す', async () => {
      await ready()
      expect(createReaderMock).not.toHaveBeenCalled()
      expect(body()).toContain('画像から読み取る')
      expect(body()).toContain(
        'PC 版の護石の詳細画面のスクリーンショットを、ここへドラッグ＆ドロップするか、この画面で貼り付けてください。1回に 20 枚まで読み取れます。',
      )
      expect(body()).toContain('画像はこのブラウザの中だけで読み取り、送信も保存もしません。')
      expect(findButton('画像を選ぶ')).toBeDefined()
      expect(fileInput().accept).toBe('image/*')
      expect(fileInput().multiple).toBe(true)
      expect(fileInput().getAttribute('aria-label')).not.toBeNull()
      expect(body()).not.toContain('待ち列を空にする')
    })

    it('AC-1: ファイル選択（change）で渡すと読み取り、渡した順に待ち列へ並べる', async () => {
      results = { 'a.png': matching, 'b.png': partial }
      await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      expect(skillInput(1).value).toBe('攻撃')
      expect(slotTrigger(2).textContent).toContain('なし')
      expect(createReaderMock).toHaveBeenCalledTimes(1)
    })

    it('AC-1: クリップボードの画像（paste）を読み取り、既定の貼り付けを止める。文字だけなら何もしない', async () => {
      await ready()
      const text = await paste()
      expect(text.defaultPrevented).toBe(false)
      expect(inspectMock).not.toHaveBeenCalled()
      const event = await paste(file('image.png'))
      expect(event.defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 1 件'))
    })

    it('AC-1: 受け取りの枠への drop で読み取る。枠の外の drop は読み取らず、ブラウザの既定を止める', async () => {
      await ready()
      const outside = await drop(document.body, file('a.png'))
      expect(outside.defaultPrevented).toBe(true)
      expect(inspectMock).not.toHaveBeenCalled()
      const inside = await drop(zone(), file('a.png'))
      expect(inside.defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 1 件'))
    })

    it('AC-1: ドラッグ中は枠の色だけを変える', async () => {
      await ready()
      zone().dispatchEvent(dragEvent('dragover', []))
      await flushPromises()
      expect(zone().className).toContain('border-ring')
      expect(zone().className).toContain('bg-muted')
      await drop(zone())
      expect(zone().className).not.toContain('border-ring')
    })

    it('AC-1: ダイアログを開いているあいだの paste は受け付けない', async () => {
      await ready(createMemoryCharmRepository([storedCharm(1, passing)]))
      await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を削除'))
      const event = await paste(file('a.png'))
      expect(event.defaultPrevented).toBe(false)
      expect(inspectMock).not.toHaveBeenCalled()
    })

    it('AC-1: 準備中・読み取り中は進み具合を出し、「画像を選ぶ」を無効にして文言を変える', async () => {
      let release!: (reader: CharmReader) => void
      createReaderMock.mockImplementationOnce(
        () => new Promise<CharmReader>((resolve) => (release = resolve)),
      )
      await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(progress()).toBe('読み取りの準備をしています…'))
      const button = findButton('読み取り中…')
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(body()).toContain('読み取り中です。読み終えてから、続きの画像を渡してください。')
      let finish!: (result: CharmReadResult) => void
      let calls = 0
      release({
        read: () => {
          calls += 1
          return calls === 1 ? Promise.resolve(matching) : new Promise((r) => (finish = r))
        },
        terminate,
      } as unknown as CharmReader)
      await vi.waitFor(() => expect(progress()).toBe('画像を読み取っています（2 / 2 枚）…'))
      // 1件目を読み終えた時点で仮入力する（読み終わりを待たない）。読み取りが続いている旨を帯に足す
      expect(body()).toContain('残りの画像は読み取り中です。')
      // 読み取り中に渡した画像は受け付けない
      await pick(file('c.png'))
      expect(inspectMock).toHaveBeenCalledTimes(2)
      finish(matching)
      await vi.waitFor(() => expect(findButton('画像を選ぶ')).toBeDefined())
      expect(body()).not.toContain('残りの画像は読み取り中です。')
    })
  })

  describe('読み取らなかった画像（AC-2・AC-3）', () => {
    it('AC-3: 16:9 でない画像・画像として開けない画像の理由をファイルごとに出し、ほかは読む', async () => {
      await ready()
      await pick(file('tall.png'), file('bad.png'), file('ok.png'))
      await vi.waitFor(() => expect(body()).toContain('読み取らなかった画像があります（2 枚）'))
      expect(body()).toContain('tall.png: 16:9 の画像ではないため、読み取りませんでした。')
      expect(body()).toContain('bad.png: 画像として開けないため、読み取りませんでした。')
      expect(body()).toContain('この護石を含めて残り 1 件')
    })

    it('AC-3: 貼り付けた画像は「貼り付けた画像 <i>」と呼ぶ', async () => {
      await ready()
      await paste(file('image.png'), file('tall.png'))
      await vi.waitFor(() =>
        expect(body()).toContain(
          '貼り付けた画像 2: 16:9 の画像ではないため、読み取りませんでした。',
        ),
      )
    })

    it('AC-2: 20 枚を超えたら、先頭の 20 枚だけを読み取り、残りの枚数と理由を出す', async () => {
      await ready()
      await pick(...Array.from({ length: 22 }, (_, i) => file(`img-${i}.png`)))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 20 件'))
      expect(body()).toContain('読み取らなかった画像があります（2 枚）')
      expect(body()).toContain(
        '1回に読み取れるのは 20 枚までのため、21 枚目以降の 2 枚は読み取りませんでした。続きは、待ち列を終えてから渡してください。',
      )
    })

    it('AC-3: 帯は、待ち列を空にしたときに消える', async () => {
      await ready()
      await pick(file('tall.png'), file('a.png'))
      await vi.waitFor(() => expect(body()).toContain('読み取らなかった画像があります'))
      await click(findButton('待ち列を空にする'))
      expect(body()).not.toContain('読み取らなかった画像があります')
    })
  })

  describe('失敗（AC-8）', () => {
    it('AC-8: 準備に失敗したら失敗の帯を出し、手入力の登録は使える', async () => {
      createReaderMock.mockRejectedValueOnce(new Error('load'))
      await ready()
      await pick(file('a.png'))
      await vi.waitFor(() => expect(body()).toContain('画像を読み取れませんでした'))
      expect(body()).toContain(
        '読み取りに使うデータを読み込めませんでした。通信状況を確かめて、もう一度画像を渡してください。手入力での登録はそのまま使えます。',
      )
      expect(body()).not.toContain('この護石を含めて')
      expect(findButton('入力を空にする')).toBeDefined()
      expect(radio(8)).toBeDefined()
      // 次に画像を渡すと帯は消える
      await pick(file('a.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 1 件'))
      expect(body()).not.toContain('画像を読み取れませんでした')
    })

    it('AC-8: k 枚目の読み取りに失敗したら、読めた分を待ち列に残し、worker を終了する', async () => {
      let calls = 0
      createReaderMock.mockImplementationOnce(
        async () =>
          ({
            read: async () => {
              calls += 1
              if (calls === 2) throw new Error('boom')
              return matching
            },
            terminate,
          }) as unknown as CharmReader,
      )
      await ready()
      await pick(file('a.png'), file('b.png'), file('c.png'))
      await vi.waitFor(() => expect(body()).toContain('2 枚目の読み取りの途中で失敗したため'))
      expect(body()).toContain(
        '2 枚目の読み取りの途中で失敗したため、残りの画像は読み取っていません。読み取れた分は待ち列に入れました。残りの画像は、もう一度渡してください。手入力での登録はそのまま使えます。',
      )
      expect(body()).toContain('この護石を含めて残り 1 件')
      expect(terminate).toHaveBeenCalledTimes(1)
      expect(calls).toBe(2)
    })
  })

  describe('仮入力（AC-4・AC-5）', () => {
    it('AC-4: 先頭の1件を画面の表示順のまま入れ、レア度は未選択にし、残りの件数を示す', async () => {
      results = { 'a.png': partial, 'b.png': matching }
      await ready()
      await click(radio(7))
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(skillInput(1).value).toBe('攻撃'))
      expect(body()).toContain(
        '画像から読み取った内容を入れました（この護石を含めて残り 2 件）。切り抜きと見比べて直し、レア度を選んでから登録してください。',
      )
      for (const value of [5, 6, 7, 8]) {
        expect(radio(value).getAttribute('data-state')).toBe('unchecked')
      }
      expect(textOf(document.querySelector('[aria-label="スキル1のレベル"]'))).toBe('Lv3')
      expect(slotTrigger(1).textContent).toContain('武器用 Lv2')
      const preview = document.querySelector<HTMLImageElement>('img')!
      expect(preview.getAttribute('src')).toBe('blob:preview-1')
      expect(preview.alt).toBe('読み取った画像の、スキル欄とスロット欄の切り抜き')
      // 1件目を仮入力したら、フォーカスをレア度へ移す
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('radio'))
    })

    it('AC-5: 読めなかった行は空・未選択のまま、印を出し、説明に結ぶ。帯に行数を足す', async () => {
      results = { 'a.png': partial }
      await ready()
      await pick(file('a.png'))
      await vi.waitFor(() => expect(skillInput(1).value).toBe('攻撃'))
      expect(skillInput(2).value).toBe('')
      expect(skillInput(3).value).toBe('')
      expect(slotTrigger(2).textContent).toContain('未選択')
      expect(slotTrigger(3).textContent).toContain('なし')
      expect(unreadMarks()).toBe(2)
      expect(body()).toContain('読み取れなかった行が 2 行あります。')
      expect(skillInput(2).getAttribute('aria-describedby')).toContain('charm-skill-2-unread')
      expect(slotTrigger(2).getAttribute('aria-describedby')).toContain('charm-slot-2-unread')
      expect(document.getElementById('charm-skill-2-unread')?.textContent).toContain(UNREAD_TEXT)
      expect(document.getElementById('charm-skill-1-unread')).toBeNull()
      expect(document.getElementById('charm-slot-3-unread')).toBeNull()
    })

    it('AC-5: 読めなかったスロットは、「なし」と区別して選ばせる（送信すると文言のエラー）', async () => {
      results = { 'a.png': partial }
      const m = await ready()
      await pick(file('a.png'))
      await vi.waitFor(() => expect(skillInput(1).value).toBe('攻撃'))
      await click(radio(8))
      await submit()
      expect(body()).toContain(SLOT_ERROR)
      expect(m.charms.charms).toHaveLength(0)
      // 「なし」を選ぶと、印もエラーも消える
      await chooseOption(slotTrigger(2), 'なし')
      expect(body()).not.toContain(SLOT_ERROR)
      expect(unreadMarks()).toBe(1)
      expect(slotTrigger(2).textContent).toContain('なし')
    })

    it('AC-5: 読めなかったスキルの行で候補を選ぶと、印が消える', async () => {
      results = { 'a.png': partial }
      await ready()
      await pick(file('a.png'))
      await vi.waitFor(() => expect(skillInput(1).value).toBe('攻撃'))
      const input = skillInput(2)
      input.focus()
      input.value = 'ガード'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
      options()
        .find((o) => textOf(o).startsWith('ガード'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(skillInput(2).value).toBe('ガード'))
      expect(document.getElementById('charm-skill-2-unread')).toBeNull()
      expect(body()).toContain('読み取れなかった行が 1 行あります。')
    })
  })

  describe('登録と「飛ばす」（AC-6）', () => {
    it('AC-6: 登録に成功したら、その1件を除いて次の1件を仮入力し、レア度へフォーカスを移す', async () => {
      results = { 'a.png': matching, 'b.png': partial }
      const m = await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      await click(radio(8))
      await submit()
      await vi.waitFor(() => expect(m.charms.charms).toHaveLength(1))
      expect((m.repository as MemoryCharmRepository).snapshot()[0].payload).toEqual(passing)
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 1 件'))
      expect(progress()).toBe('次の護石を入れました。残り 1 件です。')
      expect(skillInput(1).value).toBe('攻撃')
      expect(unreadMarks()).toBe(2)
      expect(radio(8).getAttribute('data-state')).toBe('unchecked')
      await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('radio'))
      expect(revoked).toEqual(['blob:preview-1'])
    })

    it('AC-6: 検査で止まったとき・保存に失敗したときは、待ち列を進めない', async () => {
      const m = await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      // レア度が未選択
      await submit()
      expect(body()).toContain('この護石を含めて残り 2 件')
      expect(m.charms.charms).toHaveLength(0)
      // 保存の失敗
      vi.spyOn(m.charms, 'save').mockResolvedValue('failed')
      await click(radio(8))
      await submit()
      expect(body()).toContain('この護石を含めて残り 2 件')
      expect(revoked).toEqual([])
    })

    it('AC-6: 「飛ばす」は保存せずに次の1件へ進み、最後の1件を終えたら空の登録に戻して「画像を選ぶ」へ', async () => {
      results = { 'a.png': partial, 'b.png': matching }
      const m = await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      await click(findButton('飛ばす'))
      expect(m.charms.charms).toHaveLength(0)
      expect(body()).toContain('この護石を含めて残り 1 件')
      await click(radio(8))
      await click(findButton('飛ばす'))
      expect(progress()).toBe('読み取った護石をすべて終えました。')
      expect(body()).not.toContain('この護石を含めて')
      expect(skillInput(1).value).toBe('')
      expect(radio(8).getAttribute('data-state')).toBe('unchecked')
      expect(findButton('入力を空にする')).toBeDefined()
      expect(body()).not.toContain('飛ばす')
      expect(body()).not.toContain('待ち列を空にする')
      await vi.waitFor(() => expect(document.activeElement).toBe(findButton('画像を選ぶ')))
      expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
    })

    it('AC-6: 最後の1件を登録して終えたら、空の登録に戻す', async () => {
      const m = await ready()
      await pick(file('a.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 1 件'))
      await click(radio(8))
      await submit()
      await vi.waitFor(() => expect(m.charms.charms).toHaveLength(1))
      await vi.waitFor(() => expect(progress()).toBe('読み取った護石をすべて終えました。'))
      expect(skillInput(1).value).toBe('')
      expect(radio(8).getAttribute('data-state')).toBe('unchecked')
    })
  })

  describe('待ち列を空にする・編集のモード・破棄（AC-10）', () => {
    it('AC-10: 「待ち列を空にする」は確認なしで待ち列と画像を捨て、空の登録に戻して「画像を選ぶ」へ', async () => {
      await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      await click(findButton('待ち列を空にする'))
      expect(body()).not.toContain('この護石を含めて')
      expect(body()).not.toContain('待ち列を空にする')
      expect(skillInput(1).value).toBe('')
      expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
      await vi.waitFor(() => expect(document.activeElement).toBe(findButton('画像を選ぶ')))
    })

    it('編集のモードを優先して仮入力せず、編集を終えたら待ち列の先頭を仮入力し直す', async () => {
      results = { 'a.png': partial }
      await ready(createMemoryCharmRepository([storedCharm(1, passing)]))
      await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を編集'))
      await pick(file('a.png'))
      await vi.waitFor(() => expect(createReaderMock).toHaveBeenCalled())
      await flushPromises()
      expect(body()).toContain('護石を編集')
      expect(body()).not.toContain('この護石を含めて')
      expect(body()).not.toContain('飛ばす')
      expect(radio(8).getAttribute('data-state')).toBe('checked')
      expect(slotTrigger(1).textContent).toContain('武器用 Lv1')
      // 読み取りは受け付けられている
      expect(body()).toContain('待ち列を空にする')
      await click(findButton('キャンセル'))
      expect(body()).toContain('この護石を含めて残り 1 件')
      expect(skillInput(1).value).toBe('攻撃')
      expect(slotTrigger(2).textContent).toContain('未選択')
      expect(radio(8).getAttribute('data-state')).toBe('unchecked')
    })

    it('AC-10: 画面を離れたら、待ち列の画像と worker を破棄する', async () => {
      const m = await ready()
      await pick(file('a.png'), file('b.png'))
      await vi.waitFor(() => expect(body()).toContain('この護石を含めて残り 2 件'))
      m.wrapper.unmount()
      mounted = null
      expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2'])
      await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1))
    })
  })
})
