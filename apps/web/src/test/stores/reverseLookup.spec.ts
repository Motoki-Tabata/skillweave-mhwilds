import { afterEach, describe, expect, it } from 'vitest'
import type { ReverseLookupResponse } from '@swv/solver'
import { REVERSE_LOOKUP_MAX_RESULTS } from '@/constants/search'
import {
  REVERSE_CANCELLED_TOAST_MESSAGE,
  REVERSE_UNAVAILABLE_NO_TABLE,
  useReverseLookupStore,
} from '@/stores/reverseLookup'
import { useToastStore } from '@/stores/toast'
import { FakeWorker, makeBuild, makeCandidate, makeTableBundle, sk, wp } from '../support/fixtures'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'

const response: ReverseLookupResponse = {
  status: 'feasible',
  candidates: [makeCandidate()],
  elapsedMs: 3,
}

// 受入基準 AC-1・AC-7・AC-8・AC-9・AC-12（逆引きの状態）
describe('reverseLookup ストア', () => {
  afterEach(restoreStubs)

  async function setup(options: { table?: boolean; weapon?: boolean } = {}) {
    stubBackend(options.table === false ? {} : { bundle: makeTableBundle() })
    const stores = await loadStores()
    await stores.charms.ensureLoaded()
    if (options.weapon !== false) stores.conditions.selectWeapon(wp('great-sword:1'))
    const reverse = useReverseLookupStore(stores.pinia)
    return { ...stores, reverse, worker: FakeWorker.last, toast: useToastStore(stores.pinia) }
  }

  describe('逆引きできない理由', () => {
    it('AC-8: 武器が未選択なら「武器を選ぶと逆引きできます。」', async () => {
      const { reverse } = await setup({ weapon: false })
      expect(reverse.unavailableReason).toBe('武器を選ぶと逆引きできます。')
    })

    it('AC-8: ランクが0個なら「候補にするランクを選ぶと逆引きできます。」', async () => {
      const { reverse, conditions } = await setup()
      conditions.setRank('low', false)
      conditions.setRank('high', false)
      expect(reverse.unavailableReason).toBe('候補にするランクを選ぶと逆引きできます。')
    })

    it('AC-8: 抽選テーブルがどのレア度にも無いマスターは未整備の文言', async () => {
      const { reverse } = await setup({ table: false })
      expect(reverse.unavailableReason).toBe(REVERSE_UNAVAILABLE_NO_TABLE)
      expect(reverse.unavailableReason).toBe('抽選テーブルが未整備のため、逆引きできません。')
    })

    it('AC-8: 理由があるときは submit しても始めない', async () => {
      const { reverse, worker } = await setup({ table: false })
      expect(reverse.submit()).toBe(false)
      expect(reverse.status).toBe('idle')
      expect(worker.messages('reverseLookup')).toHaveLength(0)
    })

    it('AC-1: 理由が無ければ null（必須スキルが0件でも逆引きできる）', async () => {
      const { reverse } = await setup()
      expect(reverse.unavailableReason).toBeNull()
    })
  })

  describe('submit', () => {
    it('AC-1: 検索の条件を写し、目的・護石を含まない要求を Worker に送って searching にする', async () => {
      const { reverse, conditions, worker } = await setup()
      conditions.toggleSkill(sk('a1'))
      expect(reverse.submit()).toBe(true)
      expect(reverse.status).toBe('searching')
      expect(reverse.runCount).toBe(1)
      const sent = worker.messages('reverseLookup')
      expect(sent).toHaveLength(1)
      const request = (sent[0] as unknown as { request: Record<string, unknown> }).request
      expect(request.required).toEqual([{ skillId: sk('a1'), level: 3 }])
      expect(request.maxResults).toBe(REVERSE_LOOKUP_MAX_RESULTS)
      expect(request).not.toHaveProperty('charms')
      expect(request).not.toHaveProperty('objective')
      expect(reverse.summary?.rarities).toEqual([8])
      expect(reverse.summary?.requiredCount).toBe(1)
    })

    it('AC-1: 護石の読込を待たずに送る', async () => {
      stubBackend({ bundle: makeTableBundle() })
      const stores = await loadStores()
      stores.conditions.selectWeapon(wp('great-sword:1'))
      const reverse = useReverseLookupStore(stores.pinia)
      reverse.submit()
      expect(FakeWorker.last.messages('reverseLookup')).toHaveLength(1)
    })

    it('AC-9: 進捗を見つけた順に持ち、結果で並びと件数を置き換えて done にする', async () => {
      const { reverse, worker } = await setup()
      reverse.submit()
      const id = worker.lastReverseId
      const a = makeCandidate(7)
      const b = makeCandidate(8)
      worker.emit({ type: 'reverseProgress', requestId: id, found: 1, candidate: a })
      worker.emit({ type: 'reverseProgress', requestId: id, found: 2, candidate: b })
      expect(reverse.found).toBe(2)
      expect(reverse.candidates.map((c) => c.charm.rarity)).toEqual([7, 8])
      // 結果は並びも件数も進捗と異なる（B のみ・並び替え）
      const finalResponse: ReverseLookupResponse = {
        status: 'feasible',
        candidates: [b, a, makeCandidate(6)],
        elapsedMs: 3,
      }
      worker.emit({ type: 'reverseResult', requestId: id, response: finalResponse })
      expect(reverse.status).toBe('done')
      expect(reverse.response).toEqual(finalResponse)
      expect(reverse.candidates.map((c) => c.charm.rarity)).toEqual([8, 7, 6])
      expect(reverse.found).toBe(3)
    })

    it('AC-9: エラーは文言を持ち error にする', async () => {
      const { reverse, worker } = await setup()
      reverse.submit()
      worker.emit({ type: 'error', requestId: worker.lastReverseId, message: '原因' })
      expect(reverse.status).toBe('error')
      expect(reverse.errorMessage).toBe('原因')
    })

    it('AC-9: 実行し直すと前の結果を消し、runCount を増やす', async () => {
      const { reverse, worker } = await setup()
      reverse.submit()
      worker.emit({ type: 'reverseResult', requestId: worker.lastReverseId, response })
      reverse.submit()
      expect(reverse.status).toBe('searching')
      expect(reverse.response).toBeNull()
      expect(reverse.candidates).toHaveLength(0)
      expect(reverse.runCount).toBe(2)
    })
  })

  describe('cancel・discard', () => {
    it('AC-9: cancel は Worker に取り消しを送り、idle に戻してトーストを出し、遅れた応答を捨てる', async () => {
      const { reverse, worker, toast } = await setup()
      reverse.submit()
      const id = worker.lastReverseId
      reverse.cancel()
      expect(reverse.status).toBe('idle')
      expect(worker.messages('cancel')).toHaveLength(1)
      expect(toast.items.map((item) => item.message)).toEqual([REVERSE_CANCELLED_TOAST_MESSAGE])
      expect(REVERSE_CANCELLED_TOAST_MESSAGE).toBe('逆引きをキャンセルしました。')
      worker.emit({ type: 'reverseResult', requestId: id, response })
      expect(reverse.status).toBe('idle')
    })

    it('AC-9: 実行中でなければ cancel は何もしない', async () => {
      const { reverse, toast } = await setup()
      reverse.cancel()
      expect(toast.items).toHaveLength(0)
    })

    it('AC-12: discard は通知を出さずに結果を消して idle に戻す', async () => {
      const { reverse, worker, toast } = await setup()
      reverse.submit()
      worker.emit({ type: 'reverseResult', requestId: worker.lastReverseId, response })
      reverse.discard()
      expect(reverse.status).toBe('idle')
      expect(reverse.response).toBeNull()
      expect(reverse.summary).toBeNull()
      expect(toast.items).toHaveLength(0)
    })
  })

  describe('通常の検索との相互の打ち切り', () => {
    it('AC-12: 検索を始めると逆引きの結果を消し、遅れて届く逆引きの応答を捨てる', async () => {
      const { reverse, search, worker } = await setup()
      reverse.submit()
      const reverseId = worker.lastReverseId
      search.submit()
      expect(reverse.status).toBe('idle')
      worker.emit({ type: 'reverseResult', requestId: reverseId, response })
      expect(reverse.status).toBe('idle')
      expect(search.status).toBe('searching')
    })

    it('AC-12: 逆引きを始めると検索の結果を消し、トーストは出さない', async () => {
      const { reverse, search, worker, toast } = await setup()
      search.submit()
      worker.emit({
        type: 'result',
        requestId: worker.lastSolveId,
        response: { status: 'optimal', builds: [makeBuild()], elapsedMs: 1 },
      })
      expect(search.status).toBe('done')
      reverse.submit()
      expect(search.status).toBe('idle')
      expect(search.response).toBeNull()
      expect(toast.items).toHaveLength(0)
    })

    it('AC-12: 護石の読込待ちの検索も、逆引きを始めると無効になる', async () => {
      stubBackend({ bundle: makeTableBundle() })
      const stores = await loadStores()
      stores.conditions.selectWeapon(wp('great-sword:1'))
      const reverse = useReverseLookupStore(stores.pinia)
      stores.search.submit()
      reverse.submit()
      await stores.charms.ensureLoaded()
      await Promise.resolve()
      expect(stores.search.status).toBe('idle')
      expect(FakeWorker.last.messages('solve')).toHaveLength(0)
    })
  })
})
