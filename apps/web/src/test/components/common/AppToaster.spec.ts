import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppToaster from '@/components/common/AppToaster.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
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
