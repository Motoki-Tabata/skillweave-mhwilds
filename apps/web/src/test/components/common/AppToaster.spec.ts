import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppToaster from '@/components/common/AppToaster.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useChunkLoadStore } from '@/stores/chunkLoad'
import { useToastStore } from '@/stores/toast'
import { installDomPolyfills } from '../../support/mount'

describe('AppToaster', () => {
  let wrapper: VueWrapper | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  function setup() {
    const pinia = createPinia()
    setActivePinia(pinia)
    wrapper = mount(AppToaster, { global: { plugins: [pinia] }, attachTo: document.body })
    return { toast: useToastStore(), update: useAppUpdateStore() }
  }

  const notice = () => document.body.querySelector('[data-slot="app-update"]')
  const buttons = () => Array.from(notice()?.querySelectorAll('button') ?? [])

  it('AC-8: 新しい版が無ければ通知を出さない', async () => {
    setup()
    await nextTick()
    expect(notice()).toBeNull()
  })

  it('AC-8: 新しい版があれば、見出し・本文・再読み込み・閉じるを出す', async () => {
    const { update } = setup()
    update.setWaiting()
    await nextTick()
    const el = notice()!
    expect(el.textContent).toContain('新しい版があります')
    expect(el.textContent).toContain(
      '再読み込みすると新しい版に切り替わります。保存していない入力は消えます。',
    )
    const [reloadButton, closeButton] = buttons()
    expect(reloadButton!.textContent?.trim()).toBe('再読み込み')
    expect(reloadButton!.getAttribute('data-variant')).toBe('outline')
    expect(closeButton!.getAttribute('aria-label')).toBe('通知を閉じる')
    expect(closeButton!.getAttribute('title')).toBe('通知を閉じる')
    expect(closeButton!.getAttribute('data-variant')).toBe('ghost')
  })

  it('AC-9: 再読み込みを押すと送信し、ボタンを無効にして「再読み込み中…」にする', async () => {
    const { update } = setup()
    const send = vi.fn()
    update.setReloadHandler(send)
    update.setWaiting()
    await nextTick()
    buttons()[0]!.click()
    await nextTick()
    expect(send).toHaveBeenCalledTimes(1)
    const button = buttons()[0]!
    expect(button.textContent?.trim()).toBe('再読み込み中…')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('AC-8: 閉じるを押すとこの画面からは消える', async () => {
    const { update } = setup()
    update.setWaiting()
    await nextTick()
    buttons()[1]!.click()
    await nextTick()
    expect(update.dismissed).toBe(true)
    await vi.waitFor(() => expect(notice()).toBeNull())
  })

  it('AC-8: トーストと出た順の1つの並びに積む（通知の前に出たトーストは上、後のトーストは下）', async () => {
    const { toast, update } = setup()
    toast.push('先のトースト')
    update.setWaiting()
    toast.push('後のトースト')
    await nextTick()
    const order = Array.from(document.body.querySelectorAll('ol > li')).map(
      (li) => li.textContent ?? '',
    )
    const first = order.findIndex((t) => t.includes('先のトースト'))
    const mid = order.findIndex((t) => t.includes('新しい版があります'))
    const last = order.findIndex((t) => t.includes('後のトースト'))
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(mid)
    expect(mid).toBeLessThan(last)
  })

  it('既存: トーストは従来どおり文言を出す', async () => {
    const { toast } = setup()
    toast.push('保存しました')
    await nextTick()
    expect(document.body.textContent).toContain('保存しました')
  })
})

// 039 not-found-route の AC-5〜AC-7・AC-9（N2 読み込み失敗の通知）
describe('AppToaster: 読み込み失敗の通知（N2）', () => {
  let wrapper: VueWrapper | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  function setup() {
    const pinia = createPinia()
    setActivePinia(pinia)
    wrapper = mount(AppToaster, { global: { plugins: [pinia] }, attachTo: document.body })
    return {
      toast: useToastStore(),
      update: useAppUpdateStore(),
      chunk: useChunkLoadStore(),
    }
  }

  const notice = () => document.body.querySelector('[data-slot="chunk-load"]')
  const buttons = () => Array.from(notice()?.querySelectorAll('button') ?? [])
  const order = () =>
    Array.from(document.body.querySelectorAll('ol > li')).map((li) => li.textContent ?? '')

  it('AC-5: 失敗が無ければ出さない', async () => {
    setup()
    await nextTick()
    expect(notice()).toBeNull()
  })

  it('AC-5: 見出し・本文・再読み込み・閉じるを出し、foreground で読み上げる', async () => {
    const { chunk } = setup()
    chunk.report('/charms')
    await nextTick()
    const el = notice()!
    expect(el.textContent).toContain('画面を読み込めませんでした')
    expect(el.textContent).toContain(
      '新しい版が公開された可能性があります。再読み込みすると、開こうとした画面を開きます。保存していない入力は消えます。',
    )
    await vi.waitFor(() =>
      expect(document.body.querySelector('[aria-live="assertive"]')?.textContent).toContain(
        '画面を読み込めませんでした',
      ),
    )
    const [reloadButton, closeButton] = buttons()
    expect(reloadButton!.textContent?.trim()).toBe('再読み込み')
    expect(reloadButton!.getAttribute('data-variant')).toBe('outline')
    expect(closeButton!.getAttribute('aria-label')).toBe('通知を閉じる')
    expect(closeButton!.getAttribute('title')).toBe('通知を閉じる')
  })

  it('AC-6: 再読み込みを押すと行き先へ遷移の関数を呼び、「再読み込み中…」で無効になる', async () => {
    const { chunk } = setup()
    const navigate = vi.fn()
    chunk.setNavigateHandler(navigate)
    chunk.report('/charms')
    await nextTick()
    buttons()[0]!.click()
    await nextTick()
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/charms')
    const button = buttons()[0]!
    expect(button.textContent?.trim()).toBe('再読み込み中…')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('AC-7: 閉じると消え、もう一度 report するとまた出る', async () => {
    const { chunk } = setup()
    chunk.report('/charms')
    await nextTick()
    buttons()[1]!.click()
    await nextTick()
    expect(chunk.visible).toBe(false)
    await vi.waitFor(() => expect(notice()).toBeNull())
    chunk.report('/weapons')
    await vi.waitFor(() => expect(notice()).not.toBeNull())
  })

  it('AC-9: 新しい版の通知と同時に出て、出た順に並ぶ', async () => {
    const { toast, update, chunk } = setup()
    toast.push('先のトースト')
    update.setWaiting()
    chunk.report('/charms')
    toast.push('後のトースト')
    await nextTick()
    const list = order()
    const at = (text: string) => list.findIndex((t) => t.includes(text))
    expect(at('先のトースト')).toBeGreaterThanOrEqual(0)
    expect(at('先のトースト')).toBeLessThan(at('新しい版があります'))
    expect(at('新しい版があります')).toBeLessThan(at('画面を読み込めませんでした'))
    expect(at('画面を読み込めませんでした')).toBeLessThan(at('後のトースト'))
  })

  it('AC-9: 読み込み失敗の通知が先に出ていたら、新しい版の通知より上に並ぶ', async () => {
    const { update, chunk } = setup()
    chunk.report('/charms')
    update.setWaiting()
    await nextTick()
    const list = order()
    expect(list.findIndex((t) => t.includes('画面を読み込めませんでした'))).toBeLessThan(
      list.findIndex((t) => t.includes('新しい版があります')),
    )
  })
})
