import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useChunkLoadStore } from '@/stores/chunkLoad'
import { useToastStore } from '@/stores/toast'

describe('stores/chunkLoad', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('AC-5: 失敗を報告すると通知が出て、行き先を覚える', () => {
    const store = useChunkLoadStore()
    expect(store.visible).toBe(false)
    store.report('/charms')
    expect(store.visible).toBe(true)
    expect(store.targetHref).toBe('/charms')
  })

  it('AC-5: 出た時点の最後のトーストの id と、新しい版の通知の有無を覚える', () => {
    const toast = useToastStore()
    toast.push('a')
    useAppUpdateStore().setWaiting()
    const store = useChunkLoadStore()
    store.report('/charms')
    expect(store.afterToastId).toBe(toast.items[0]!.id)
    expect(store.afterUpdate).toBe(true)
  })

  it('AC-5: 出ている間に再び失敗したら、通知は1つのまま行き先だけ替える', () => {
    const toast = useToastStore()
    const store = useChunkLoadStore()
    store.report('/charms')
    toast.push('後から出たトースト')
    store.report('/weapons')
    expect(store.visible).toBe(true)
    expect(store.targetHref).toBe('/weapons')
    expect(store.afterToastId).toBe(0)
  })

  it('AC-7: 閉じると消え、その後に再び失敗したらまた出る', () => {
    const store = useChunkLoadStore()
    store.report('/charms')
    store.dismiss()
    expect(store.visible).toBe(false)
    store.report('/weapons')
    expect(store.visible).toBe(true)
    expect(store.targetHref).toBe('/weapons')
    expect(store.reloading).toBe(false)
  })

  it('AC-6: 再読み込みは行き先を渡して遷移の関数を1回だけ呼び、再読み込み中にする', () => {
    const store = useChunkLoadStore()
    const navigate = vi.fn()
    store.setNavigateHandler(navigate)
    store.report('/charms')
    store.reload()
    store.reload()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/charms')
    expect(store.reloading).toBe(true)
  })
})
