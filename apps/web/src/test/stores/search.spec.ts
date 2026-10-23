import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SolverResponse } from '@swv/solver'
import type { CharmPayload } from '@/lib/charms/types'
import { CANCELLED_TOAST_MESSAGE } from '@/stores/search'
import { useToastStore } from '@/stores/toast'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'
import { FakeWorker, armorId, makeBuild, sk, wp } from '../support/fixtures'
import { flushPromises, loadStores, restoreStubs, stubBackend } from '../support/mount'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'

// 受入基準 8（検索の状態 Q0〜Q7）
describe('search ストア', () => {
  const response: SolverResponse = { status: 'optimal', builds: [makeBuild()], elapsedMs: 5 }

  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  async function setup() {
    const stores = await loadStores()
    await stores.charms.ensureLoaded()
    stores.conditions.selectWeapon(wp('great-sword:1'))
    return { ...stores, worker: FakeWorker.last }
  }

  it('武器が未選択なら検索せず false を返し、武器欄のエラーを出す', async () => {
    const { search, conditions, worker } = await loadStores().then((s) => ({
      ...s,
      worker: FakeWorker.last,
    }))
    expect(search.submit()).toBe(false)
    expect(conditions.weaponErrorShown).toBe(true)
    expect(worker.messages('solve')).toHaveLength(0)
    expect(search.status).toBe('idle')
  })

  // 受入基準 8（送信した時点の候補を渡し、要約に件数を持つ）
  describe('護石の候補', () => {
    const good: CharmPayload = {
      rarity: 8,
      skills: [{ skillId: sk('a1'), level: 2 }],
      slots: [{ target: 'weapon', level: 1 }],
    }
    const overLevel = { ...good, skills: [{ skillId: sk('a1'), level: 9 }] }

    async function withCharms() {
      const repository = createMemoryCharmRepository([
        storedCharm(1, good),
        storedCharm(2, overLevel),
      ])
      const stores = await loadStores(repository)
      await stores.charms.ensureLoaded()
      stores.conditions.selectWeapon(wp('great-sword:1'))
      return { ...stores, worker: FakeWorker.last }
    }

    it('構造上の制約を満たす護石を SolverRequest.charms に渡し、要約に件数を持つ', async () => {
      const { search, worker } = await withCharms()
      search.submit()
      const sent = worker.messages('solve')[0]
      expect(sent).toMatchObject({
        request: {
          charms: [{ id: charmId(1), rarity: 8, skills: good.skills, slots: good.slots }],
        },
      })
      expect(search.summary?.charmCount).toBe(1)
    })

    it('護石が1つも無ければ charms は空で、件数は 0', async () => {
      const { search, worker } = await setup()
      search.submit()
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    // 受入基準 8（読込の完了を待ってから送る）
    it('護石の読込の前に検索しても、読込の完了を待ち、読み込んだ護石を渡して件数を一致させる', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      expect(charms.status).toBe('loading')
      expect(search.submit()).toBe(true)
      expect(search.status).toBe('searching')
      expect(worker.messages('solve')).toHaveLength(0)
      await charms.ensureLoaded()
      await flushPromises()
      expect(worker.messages('solve')).toHaveLength(1)
      expect(worker.messages('solve')[0]).toMatchObject({
        request: { charms: [{ id: charmId(1), rarity: 8 }] },
      })
      expect(search.summary?.charmCount).toBe(1)
    })

    it('読込を待っている間にキャンセルすると、読込の後も送らず Q0 に戻る', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      search.submit()
      search.cancel()
      await charms.ensureLoaded()
      await flushPromises()
      expect(worker.messages('solve')).toHaveLength(0)
      expect(search.status).toBe('idle')
    })

    // 受入基準 11（護石なしの検索は引き続き使える）
    it('護石を端末に保存できない（unavailable）ときも、charms 空で検索を送り、件数は 0', async () => {
      const { search, charms, conditions, worker } = await loadStores().then((s) => ({
        ...s,
        worker: FakeWorker.last,
      }))
      charms.setRepositoryOpener(async () => {
        throw Object.assign(new Error('x'), { name: 'SecurityError' })
      })
      await charms.ensureLoaded()
      expect(charms.status).toBe('unavailable')
      conditions.selectWeapon(wp('great-sword:1'))
      expect(search.submit()).toBe(true)
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    it('護石の一覧を読めない（failed）ときも、charms 空で検索を送り、件数は 0', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      repository.failWith('list', 'unknown')
      await charms.ensureLoaded()
      expect(charms.status).toBe('failed')
      conditions.selectWeapon(wp('great-sword:1'))
      expect(search.submit()).toBe(true)
      expect(FakeWorker.last.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    it('検索の後に護石を削除しても、送信した時点の候補を ID で引ける', async () => {
      const { search, charms } = await withCharms()
      search.submit()
      await charms.remove(charmId(1))
      expect(charms.candidateCount).toBe(0)
      expect(search.submittedCharms.get(charmId(1))?.rarity).toBe(8)
      expect(search.summary?.charmCount).toBe(1)
    })
  })

  it('ランクが0個なら検索しない', async () => {
    const { search, conditions, worker } = await setup()
    conditions.setRank('high', false)
    expect(search.submit()).toBe(false)
    expect(worker.messages('solve')).toHaveLength(0)
  })

  it('検索は Worker に SolverRequest を送り、検索中（Q1）になる。進捗は 0 件から', async () => {
    const { search, conditions, worker } = await setup()
    conditions.toggleSkill(sk('a1'))
    conditions.setSkillLevel(sk('a1'), 2)
    conditions.setObjective('defense')
    conditions.setMaxResults(5)
    expect(search.submit()).toBe(true)
    expect(search.status).toBe('searching')
    expect(search.found).toBe(0)
    const sent = worker.messages('solve')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'solve',
      request: {
        weapon: { kind: 'master', weaponId: wp('great-sword:1') },
        charms: [],
        required: [{ skillId: sk('a1'), level: 2 }],
        objective: { kind: 'maximize', metric: 'defense' },
        maxResults: 5,
        timeoutMs: SOLVE_TIMEOUT_MS,
      },
    })
    // 既定のランクは上位だけなので、下位の防具が除外される
    const excluded = (sent[0] as { request: { excludedArmorIds: string[] } }).request
      .excludedArmorIds
    expect(excluded).toContain(armorId('low', 'head'))
    expect(excluded).not.toContain(armorId('high', 'head'))
    expect(search.runCount).toBe(1)
  })

  it('検索条件の要約は検索したときの値で、後から条件を変えても変わらない', async () => {
    const { search, conditions } = await setup()
    conditions.toggleSkill(sk('a1'))
    conditions.setMaxResults(4)
    search.submit()
    conditions.selectWeapon(wp('bow:1'))
    conditions.toggleSkill(sk('a2'))
    conditions.setMaxResults(9)
    expect(search.summary).toMatchObject({
      weaponId: wp('great-sword:1'),
      weaponName: '鉄の大剣',
      requiredCount: 1,
      objectiveLabel: '条件を満たす構成',
      maxResults: 4,
      allRanksSelected: false,
    })
  })

  it('進捗で件数を更新し、結果で完了（Q2〜Q5）にする', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.emit({ type: 'progress', requestId: worker.lastSolveId, found: 2 })
    expect(search.found).toBe(2)
    worker.emit({ type: 'result', requestId: worker.lastSolveId, response })
    expect(search.status).toBe('done')
    expect(search.response).toEqual(response)
    expect(search.found).toBe(1)
  })

  it('ソルバーの error は原因を保持して Q6 にする', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.emit({ type: 'error', requestId: worker.lastSolveId, message: '原因です' })
    expect(search.status).toBe('error')
    expect(search.errorMessage).toBe('原因です')
  })

  it('Worker が異常終了したら Q6（停止しました）', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.crash()
    expect(search.status).toBe('error')
    expect(search.errorMessage).toBe('検索を実行するプログラムが停止しました。')
  })

  it('やり直すと前の結果と進捗をすぐ消し、前の検索の応答は反映しない', async () => {
    const { search, worker } = await setup()
    search.submit()
    const firstId = worker.lastSolveId
    worker.emit({ type: 'progress', requestId: firstId, found: 4 })
    worker.emit({ type: 'result', requestId: firstId, response })
    expect(search.response).not.toBeNull()
    search.submit()
    expect(search.status).toBe('searching')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(search.runCount).toBe(2)
    // 前の検索の遅れた応答
    worker.emit({ type: 'progress', requestId: firstId, found: 7 })
    worker.emit({ type: 'result', requestId: firstId, response })
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(search.status).toBe('searching')
  })

  it('検索中にやり直したとき、前の検索の進捗は反映しない', async () => {
    const { search, worker } = await setup()
    search.submit()
    const firstId = worker.lastSolveId
    search.submit()
    worker.emit({ type: 'progress', requestId: firstId, found: 8 })
    expect(search.found).toBe(0)
    worker.emit({ type: 'progress', requestId: worker.lastSolveId, found: 1 })
    expect(search.found).toBe(1)
  })

  it('キャンセルは Q0 に戻し、トーストを出し、以降の結果と進捗を反映しない', async () => {
    const { search, worker, pinia } = await setup()
    search.submit()
    const id = worker.lastSolveId
    worker.emit({ type: 'progress', requestId: id, found: 3 })
    search.cancel()
    expect(search.status).toBe('idle')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(worker.sent.at(-1)).toEqual({ type: 'cancel', requestId: id })
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual([CANCELLED_TOAST_MESSAGE])
    worker.emit({ type: 'progress', requestId: id, found: 5 })
    worker.emit({ type: 'result', requestId: id, response })
    expect(search.status).toBe('idle')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
  })

  it('検索中でないときのキャンセルは何もしない', async () => {
    const { search, worker, pinia } = await setup()
    search.cancel()
    expect(worker.messages('cancel')).toHaveLength(0)
    expect(useToastStore(pinia).items).toEqual([])
  })

  it('全ランクを選んだことを要約に持つ', async () => {
    const { search, conditions } = await setup()
    conditions.setRank('low', true)
    search.submit()
    expect(search.summary?.allRanksSelected).toBe(true)
  })
})
