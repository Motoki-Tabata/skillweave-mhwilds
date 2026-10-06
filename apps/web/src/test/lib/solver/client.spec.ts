import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SolverRequest, SolverResponse } from '@swv/solver'
import {
  HIGHS_INIT_FAILED_MESSAGE,
  LoadError,
  WORKER_STOPPED_MESSAGE,
  createSolverClient,
} from '@/lib/solver/client'
import type { SolveHandlers } from '@/lib/solver/client'
import { FakeWorker, makeBundle } from '../../support/fixtures'

// 受入基準 1・2・6・7（Worker との通信）
describe('createSolverClient', () => {
  const bundle = makeBundle()
  const request = { masterVersion: bundle.version } as SolverRequest
  const response: SolverResponse = { status: 'optimal', builds: [], elapsedMs: 1 }

  function handlers() {
    return {
      onProgress: vi.fn<SolveHandlers['onProgress']>(),
      onResult: vi.fn<SolveHandlers['onResult']>(),
      onError: vi.fn<SolveHandlers['onError']>(),
    }
  }

  function setup() {
    const client = createSolverClient(() => new FakeWorker())
    client.start()
    return { client, worker: FakeWorker.last }
  }

  beforeEach(() => FakeWorker.reset())

  describe('読み込み', () => {
    it('loadMaster を1回だけ送り、masterLoaded で解決する', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      expect(worker.messages('loadMaster')).toHaveLength(1)
      expect(worker.sent[0]).toEqual({ type: 'loadMaster', bundle })
    })

    it('検索を始めても loadMaster を送り直さない', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      client.solve(request, handlers())
      client.solve(request, handlers())
      expect(worker.messages('loadMaster')).toHaveLength(1)
      expect(worker.messages('solve')).toHaveLength(2)
    })

    it('initFailed は highs の LoadError で拒否する', async () => {
      FakeWorker.failInit = true
      const { client } = setup()
      const error = await client.load(bundle).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(LoadError)
      expect(error).toMatchObject({ kind: 'highs', message: HIGHS_INIT_FAILED_MESSAGE })
    })

    it('読み込み中に Worker が異常終了したら unknown の LoadError で拒否する', async () => {
      FakeWorker.autoReply = false
      const { client, worker } = setup()
      const pending = client.load(bundle)
      worker.crash()
      await expect(pending).rejects.toMatchObject({ kind: 'unknown' })
      expect(worker.terminated).toBe(true)
    })

    it('Worker を作る前の load は拒否する', async () => {
      const client = createSolverClient(() => new FakeWorker())
      await expect(client.load(bundle)).rejects.toMatchObject({ kind: 'unknown' })
    })

    it('start のやり直しで前の Worker を終了させる', () => {
      const { client, worker } = setup()
      client.start()
      expect(worker.terminated).toBe(true)
      expect(FakeWorker.instances).toHaveLength(2)
    })

    it('終了させた Worker の遅れて届いたメッセージは捨てる', async () => {
      FakeWorker.autoReply = false
      const { client, worker } = setup()
      client.start()
      const next = FakeWorker.last
      const pending = client.load(bundle)
      worker.emit({ type: 'masterLoaded', version: bundle.version })
      let settled = false
      void pending.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)
      next.emit({ type: 'masterLoaded', version: bundle.version })
      await pending
    })
  })

  describe('検索', () => {
    it('solve は requestId と要求を送る', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const id = client.solve(request, handlers())
      expect(worker.sent.at(-1)).toEqual({ type: 'solve', requestId: id, request })
    })

    it('進捗と結果を、現在の requestId のものだけ渡す', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      const id = client.solve(request, h)
      worker.emit({ type: 'progress', requestId: id, found: 3 })
      worker.emit({ type: 'result', requestId: id, response })
      expect(h.onProgress).toHaveBeenCalledWith(3)
      expect(h.onResult).toHaveBeenCalledWith(response)
    })

    it('requestId の違う進捗・結果・エラーは捨てる', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      client.solve(request, h)
      worker.emit({ type: 'progress', requestId: 'other', found: 9 })
      worker.emit({ type: 'result', requestId: 'other', response })
      worker.emit({ type: 'error', requestId: 'other', message: 'x' })
      expect(h.onProgress).not.toHaveBeenCalled()
      expect(h.onResult).not.toHaveBeenCalled()
      expect(h.onError).not.toHaveBeenCalled()
    })

    it('結果は1回だけ渡す（受け取った後の同じ requestId の応答は捨てる）', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      const id = client.solve(request, h)
      worker.emit({ type: 'result', requestId: id, response })
      worker.emit({ type: 'result', requestId: id, response })
      worker.emit({ type: 'progress', requestId: id, found: 1 })
      expect(h.onResult).toHaveBeenCalledTimes(1)
      expect(h.onProgress).not.toHaveBeenCalled()
    })

    it('ソルバーの error を原因の文言のまま渡す', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      const id = client.solve(request, h)
      worker.emit({ type: 'error', requestId: id, message: '不正な要求です' })
      expect(h.onError).toHaveBeenCalledWith('不正な要求です')
    })

    it('やり直すと、前の検索の進捗と結果は渡さない', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const first = handlers()
      const second = handlers()
      const firstId = client.solve(request, first)
      const secondId = client.solve(request, second)
      worker.emit({ type: 'progress', requestId: firstId, found: 5 })
      worker.emit({ type: 'result', requestId: firstId, response })
      worker.emit({ type: 'progress', requestId: secondId, found: 1 })
      expect(first.onProgress).not.toHaveBeenCalled()
      expect(first.onResult).not.toHaveBeenCalled()
      expect(second.onProgress).toHaveBeenCalledWith(1)
    })

    it('キャンセルは cancel を送り、以降の進捗と結果を渡さない', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      const id = client.solve(request, h)
      client.cancel()
      expect(worker.sent.at(-1)).toEqual({ type: 'cancel', requestId: id })
      worker.emit({ type: 'progress', requestId: id, found: 2 })
      worker.emit({ type: 'result', requestId: id, response })
      expect(h.onProgress).not.toHaveBeenCalled()
      expect(h.onResult).not.toHaveBeenCalled()
    })

    it('検索中でないときのキャンセルは何も送らない', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      client.cancel()
      expect(worker.messages('cancel')).toHaveLength(0)
    })
  })

  describe('異常終了と initFailed', () => {
    it('検索中の異常終了は「停止しました」の文言で onError を呼び、Worker を終了させる', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      client.solve(request, h)
      worker.crash()
      expect(h.onError).toHaveBeenCalledWith(WORKER_STOPPED_MESSAGE)
      expect(worker.terminated).toBe(true)
    })

    it('終了済みの Worker の error イベントは無視する', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      client.solve(request, h)
      worker.crash()
      worker.crash()
      expect(h.onError).toHaveBeenCalledTimes(1)
    })

    it('異常終了の後の次の検索は、Worker を作り直し、取得済みのマスターを渡し直す', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      client.solve(request, handlers())
      worker.crash()
      const h = handlers()
      const id = client.solve(request, h)
      const respawned = FakeWorker.last
      expect(respawned).not.toBe(worker)
      expect(respawned.sent.map((m) => m.type)).toEqual(['loadMaster', 'solve'])
      expect(respawned.sent[0]).toEqual({ type: 'loadMaster', bundle })
      respawned.emit({ type: 'result', requestId: id, response })
      expect(h.onResult).toHaveBeenCalledWith(response)
    })

    it('検索中の initFailed は HiGHS の文言で onError を呼ぶ', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      client.solve(request, h)
      worker.emit({ type: 'initFailed', message: 'wasm' })
      expect(h.onError).toHaveBeenCalledWith(HIGHS_INIT_FAILED_MESSAGE)
    })

    it('initFailed の後の検索は Worker に送らず、すぐ onError を呼ぶ', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      worker.emit({ type: 'initFailed', message: 'wasm' })
      const h = handlers()
      client.solve(request, h)
      expect(h.onError).toHaveBeenCalledWith(HIGHS_INIT_FAILED_MESSAGE)
      expect(worker.messages('solve')).toHaveLength(0)
    })

    it('dispose で Worker を終了させ、以降の応答を渡さない', async () => {
      const { client, worker } = setup()
      await client.load(bundle)
      const h = handlers()
      const id = client.solve(request, h)
      client.dispose()
      expect(worker.terminated).toBe(true)
      worker.emit({ type: 'result', requestId: id, response })
      expect(h.onResult).not.toHaveBeenCalled()
    })
  })
})
