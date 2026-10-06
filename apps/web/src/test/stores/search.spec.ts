import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SolverResponse } from '@swv/solver'
import { CANCELLED_TOAST_MESSAGE } from '@/stores/search'
import { useToastStore } from '@/stores/toast'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'
import { FakeWorker, armorId, makeBuild, sk, wp } from '../support/fixtures'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'

// 受入基準 6・7・8（検索の状態 Q0〜Q7）
describe('search ストア', () => {
  const response: SolverResponse = { status: 'optimal', builds: [makeBuild()], elapsedMs: 5 }

  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  async function setup() {
    const stores = await loadStores()
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
