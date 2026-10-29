import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SolverResponse } from '@swv/solver'
import { FakeWorker, VERSION, makeBuild, wp } from '../support/fixtures'
import { flushPromises, loadStores, restoreStubs, stubBackend } from '../support/mount'
import { createMemoryBuildsApi } from '../support/buildsApi'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import {
  ARTIA_GREAT_SWORD,
  GROUP_BONUS,
  SERIES_BONUS,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'

const response: SolverResponse = {
  status: 'optimal',
  builds: [{ ...makeBuild(), score: 42, freeSlotLevels: { armor: 1, weapon: 2 } }],
  elapsedMs: 5,
}

// 検索の結果から構成の保存の内容を作る（送信した時点の写し）
describe('search ストアの構成の保存の材料', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup() {
    const stores = await loadStores(undefined, createMemoryWeaponRepository([storedWeapon(1)]))
    await stores.charms.ensureLoaded()
    await stores.weapons.ensureLoaded()
    return { ...stores, worker: FakeWorker.last }
  }

  function finish(worker: FakeWorker): void {
    worker.emit({ type: 'result', requestId: worker.lastSolveId, response })
  }

  it('AC-1: マスターの武器の参照・マスターの版・発動スキル・空きスロット・オンだった発動条件を payload にする', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    search.submit()
    finish(worker)
    const payload = search.buildPayload(response.builds[0])
    expect(search.submittedSaveSource?.masterVersion).toBe(VERSION)
    expect(payload).toMatchObject({
      weapon: { kind: 'master', weaponId: wp('great-sword:1') },
      charm: null,
      skills: makeBuild().skills,
      freeSlots: makeBuild().freeSlots,
      decorations: makeBuild().decorations,
      activeConditionIds: [...conditions.activeConditionIds],
    })
    // 契約に無い項目は送らない
    expect(payload).not.toHaveProperty('score')
    expect(payload).not.toHaveProperty('freeSlotLevels')
  })

  it('AC-1: リアクティブな結果から作った payload は structuredClone できる', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    search.submit()
    finish(worker)
    const build = search.response?.builds[0]
    expect(build).toBeDefined()
    const payload = search.buildPayload(build!)
    expect(() => structuredClone(payload)).not.toThrow()
  })

  it('AC-1: 護石を使う構成は、送信した時点の護石の ID と内容を写す', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    search.submit()
    finish(worker)
    const charm = {
      id: '01900000-0000-7000-8000-0000000000c1',
      rarity: 8,
      skills: [],
      slots: [{ target: 'weapon' as const, level: 2 as const }],
    }
    search.submittedCharms = new Map([[charm.id, charm as never]])
    const payload = search.buildPayload({ ...response.builds[0], charmId: charm.id as never })
    expect(payload?.charm).toEqual({
      id: charm.id,
      payload: { rarity: 8, skills: [], slots: [{ target: 'weapon', level: 2 }] },
    })
  })

  it('027 AC-6: 生産護石を使う構成は、生産護石の形で ID の参照だけを送り、写しを送らない', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    search.submit()
    finish(worker)
    const charm = {
      id: 'ch:-1:2',
      rarity: 7,
      skills: [],
      slots: [{ target: 'weapon' as const, level: 1 as const }],
    }
    search.submittedCharms = new Map([[charm.id, charm as never]])
    const payload = search.buildPayload({ ...response.builds[0], charmId: charm.id as never })
    expect(payload?.charm).toStrictEqual({ kind: 'crafted', charmId: 'ch:-1:2' })
  })

  it('AC-1: 個体差のある武器は、検索の後に編集・削除しても送信した時点の写しのまま', async () => {
    const { search, conditions, weapons, worker } = await setup()
    conditions.selectCustomWeapon(weaponId(1))
    search.submit()
    finish(worker)
    const before = search.buildPayload(response.builds[0])
    const stored = weapons.weapons[0]
    await weapons.save({ ...stored.payload, name: '別名', attack: 999 }, stored)
    await weapons.remove(weaponId(1))
    const after = search.buildPayload(response.builds[0])
    expect(after).toEqual(before)
    expect(after?.weapon).toMatchObject({
      kind: 'custom',
      id: weaponId(1),
      payload: {
        baseWeaponId: ARTIA_GREAT_SWORD,
        attack: 200,
        affinity: 15,
        element: { type: 'fire', value: 30 },
        seriesBonusId: SERIES_BONUS,
        groupBonusId: GROUP_BONUS,
      },
    })
  })

  it('AC-1: 検索の結果が無いときの payload は null', async () => {
    const { search } = await setup()
    expect(search.buildPayload(makeBuild())).toBeNull()
  })

  it('AC-1: 作った payload を偽の BuildsApi に渡して保存できる', async () => {
    const buildsApi = createMemoryBuildsApi()
    const stores = await loadStores(undefined, undefined, {
      buildsApi,
      authApi: {
        fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'a' }),
        logout: async () => true,
      },
    })
    stores.conditions.selectWeapon(wp('great-sword:1'))
    stores.search.submit()
    await flushPromises()
    finish(FakeWorker.last)
    const build = stores.search.response?.builds[0]
    const payload = stores.search.buildPayload(build!)
    const result = await stores.builds.save('名前', VERSION, payload!)
    expect(result).toBe('saved')
    expect(buildsApi.snapshot()).toHaveLength(1)
  })

  it('AC-1: 「保存済み」の印は結果ごとに持ち、検索し直すと消える', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    search.submit()
    finish(worker)
    expect(search.isSaved(0)).toBe(false)
    search.markSaved(0)
    search.markSaved(0)
    expect(search.isSaved(0)).toBe(true)
    expect(search.savedIndexes).toEqual([0])
    search.submit()
    expect(search.isSaved(0)).toBe(false)
  })
})
