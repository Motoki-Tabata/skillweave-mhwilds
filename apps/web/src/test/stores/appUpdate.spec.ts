import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useToastStore } from '@/stores/toast'

describe('stores/appUpdate', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('AC-8: 待っていないときは通知を出さない', () => {
    expect(useAppUpdateStore().visible).toBe(false)
  })

  it('AC-8: 待っていて閉じていなければ出し、閉じたら消す（メモリだけ）', () => {
    const store = useAppUpdateStore()
    store.setWaiting()
    expect(store.visible).toBe(true)
    store.dismiss()
    expect(store.visible).toBe(false)
    expect(store.waiting).toBe(true)
    // 次に開いたとき（新しい pinia）は、まだ待っていればまた出る
    setActivePinia(createPinia())
    const next = useAppUpdateStore()
    next.setWaiting()
    expect(next.visible).toBe(true)
  })

  it('AC-8: 出た時点の最後のトーストの id を覚える（トーストと出た順に並べるため）', () => {
    const toast = useToastStore()
    toast.push('a')
    toast.push('b')
    const store = useAppUpdateStore()
    store.setWaiting()
    expect(store.afterToastId).toBe(toast.items[1]!.id)
  })

  it('AC-9: 再読み込みは登録された送信を1回だけ呼び、再読み込み中にする', () => {
    const store = useAppUpdateStore()
    const send = vi.fn()
    store.setReloadHandler(send)
    store.reload()
    store.reload()
    expect(send).toHaveBeenCalledTimes(1)
    expect(store.reloading).toBe(true)
  })
})
