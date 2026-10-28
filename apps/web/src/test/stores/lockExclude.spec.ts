import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useToastStore } from '@/stores/toast'
import { armorId, dc } from '../support/fixtures'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'

describe('lockExclude ストア', () => {
  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  async function setup() {
    const { pinia } = await loadStores()
    return { store: useLockExcludeStore(pinia), toast: useToastStore(pinia) }
  }

  it('既定は固定なし・除外なし', async () => {
    const { store } = await setup()
    expect(store.fixed).toEqual({})
    expect(store.excludedArmorIds).toEqual([])
    expect(store.excludedDecorationIds).toEqual([])
    expect(store.fixedPartCount).toBe(0)
  })

  it('固定は防具・null（何も付けない）・undefined（固定しない）で変わり、件数は null も数える', async () => {
    const { store } = await setup()
    store.setFixed('head', armorId('high', 'head'))
    store.setFixed('legs', null)
    expect(store.fixed).toEqual({ head: armorId('high', 'head'), legs: null })
    expect(store.fixedPartCount).toBe(2)
    store.setFixed('head', undefined)
    expect(store.fixed).toEqual({ legs: null })
  })

  it('除外は足した順に並び、1件ずつ外せる', async () => {
    const { store } = await setup()
    store.addExcludedArmor(armorId('low', 'head'))
    store.addExcludedArmor(armorId('high', 'chest'))
    store.addExcludedArmor(armorId('low', 'head'))
    expect(store.excludedArmorIds).toEqual([armorId('low', 'head'), armorId('high', 'chest')])
    store.removeExcludedArmor(armorId('low', 'head'))
    expect(store.excludedArmorIds).toEqual([armorId('high', 'chest')])
    store.addExcludedDecoration(dc('1'))
    expect(store.excludedDecorationIds).toEqual([dc('1')])
    store.removeExcludedDecoration(dc('1'))
    expect(store.excludedDecorationIds).toEqual([])
  })

  // AC-7
  it('AC-7: 除外中の防具を固定すると、除外の一覧から外してトーストを出す', async () => {
    const { store, toast } = await setup()
    const id = armorId('high', 'head')
    store.addExcludedArmor(id)
    store.setFixed('head', id)
    expect(store.excludedArmorIds).toEqual([])
    expect(store.fixed).toEqual({ head: id })
    expect(toast.items.map((i) => i.message)).toEqual(['上位の頭を除外の一覧から外しました。'])
  })

  it('AC-7: 固定中の防具を除外に足すと、その部位を固定しないに戻してトーストを出す', async () => {
    const { store, toast } = await setup()
    const id = armorId('high', 'head')
    store.setFixed('head', id)
    store.addExcludedArmor(id)
    expect(store.fixed).toEqual({})
    expect(store.excludedArmorIds).toEqual([id])
    expect(toast.items.map((i) => i.message)).toEqual(['頭の固定を解除しました。'])
  })

  it('AC-7: 衝突しない操作ではトーストを出さない', async () => {
    const { store, toast } = await setup()
    store.addExcludedArmor(armorId('low', 'head'))
    store.setFixed('head', armorId('high', 'head'))
    expect(toast.items).toEqual([])
  })

  // AC-10
  it('AC-10: 端末に保存せず、新しい Pinia では既定に戻る', async () => {
    const first = await setup()
    first.store.setFixed('head', null)
    first.store.addExcludedDecoration(dc('1'))
    const second = await setup()
    expect(second.store.fixed).toEqual({})
    expect(second.store.excludedDecorationIds).toEqual([])
    expect(localStorage).toHaveLength(0)
  })
})
