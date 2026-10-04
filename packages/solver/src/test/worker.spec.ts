import highsLoader, { type Highs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createWorkerHandler, type WorkerInbound, type WorkerOutbound } from '../main/worker'
import { armor, buildMaster, makeRequest, plainArmors, TEST_VERSION } from './support/builders'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const master = buildMaster({
  armors: plainArmors({ head: ['h1', 'h2', 'h3'].map((id) => armor(id, 'head')) }),
})
const loadMaster: WorkerInbound = { type: 'loadMaster', bundle: master }
const solveMessage = (requestId: string, maxResults = 30): WorkerInbound => ({
  type: 'solve',
  requestId,
  request: makeRequest(master, { maxResults }),
})

/** 偽の post と、求解の前に呼ばれる yieldControl（n 回目の呼び出しで動作を差し込める）を持つハンドラ */
function setup(target: Highs = highs) {
  const sent: WorkerOutbound[] = []
  const hooks: { onYield: (count: number) => void | Promise<void> } = { onYield: () => {} }
  let yields = 0
  const handler = createWorkerHandler({
    highs: target,
    post: (message) => sent.push(message),
    now: () => 0,
    yieldControl: async () => {
      yields++
      await hooks.onYield(yields)
    },
  })
  return { sent, hooks, handler }
}

const typesOf = (sent: WorkerOutbound[]) => sent.map((m) => `${m.type}`)
const requestIdOf = (m: WorkerOutbound) => ('requestId' in m ? m.requestId : undefined)

describe('[AC11] Worker のメッセージハンドラ', () => {
  it('loadMaster でマスターを保持し、読み込んだ版を返す', async () => {
    const { sent, handler } = setup()
    await handler(loadMaster)
    expect(sent).toEqual([{ type: 'masterLoaded', version: TEST_VERSION }])
  })

  it('solve は構成を1件見つけるごとに progress を送り、最後に result を送る', async () => {
    const { sent, handler } = setup()
    await handler(loadMaster)
    sent.length = 0
    await handler(solveMessage('r1'))
    expect(typesOf(sent)).toEqual(['progress', 'progress', 'progress', 'result'])
    expect(sent.slice(0, 3)).toEqual([
      { type: 'progress', requestId: 'r1', found: 1 },
      { type: 'progress', requestId: 'r1', found: 2 },
      { type: 'progress', requestId: 'r1', found: 3 },
    ])
    const last = sent.at(-1)
    expect(last).toMatchObject({ type: 'result', requestId: 'r1' })
    if (last?.type === 'result') {
      expect(last.response.status).toBe('feasible')
      expect(last.response.builds).toHaveLength(3)
    }
  })

  it('マスター未読込の solve は error を送る', async () => {
    const { sent, handler } = setup()
    await handler(solveMessage('r1'))
    expect(sent).toEqual([
      { type: 'error', requestId: 'r1', message: 'マスターが読み込まれていない' },
    ])
  })

  it('不正な要求には error を送り、result は送らない', async () => {
    const { sent, handler } = setup()
    await handler(loadMaster)
    sent.length = 0
    await handler(solveMessage('r1', 0))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'error', requestId: 'r1' })
    expect(JSON.stringify(sent[0])).toContain('maxResults')
  })

  it('不正な要求以外の例外は、内部エラーと分かる文言で error を送る', async () => {
    const broken = new Proxy(highs, {
      get(target, prop) {
        if (prop === 'withModel') {
          return () => {
            throw new Error('boom')
          }
        }
        const value: unknown = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const { sent, handler } = setup(broken)
    await handler(loadMaster)
    sent.length = 0
    await handler(solveMessage('r1'))
    expect(sent).toEqual([
      { type: 'error', requestId: 'r1', message: 'ソルバーの内部エラー: boom' },
    ])
  })

  it('エラーのあとも次の solve を処理できる', async () => {
    const { sent, handler } = setup()
    await handler(loadMaster)
    await handler(solveMessage('bad', 0))
    sent.length = 0
    await handler(solveMessage('ok', 1))
    expect(typesOf(sent)).toEqual(['progress', 'result'])
  })
})

describe('[AC12] cancel と実行中の別の solve', () => {
  it('実行中の要求の cancel で次の求解の合間に打ち切り、結果もエラーも送らない', async () => {
    const { sent, hooks, handler } = setup()
    await handler(loadMaster)
    sent.length = 0
    // 2 回目の求解の前（1 件見つけた後）に cancel が届く
    hooks.onYield = (count) => {
      if (count === 2) void handler({ type: 'cancel', requestId: 'r1' })
    }
    await handler(solveMessage('r1'))
    expect(sent).toEqual([{ type: 'progress', requestId: 'r1', found: 1 }])
  })

  it('別の requestId の cancel は実行中の要求に効かない', async () => {
    const { sent, hooks, handler } = setup()
    await handler(loadMaster)
    sent.length = 0
    hooks.onYield = (count) => {
      if (count === 2) void handler({ type: 'cancel', requestId: 'other' })
    }
    await handler(solveMessage('r1'))
    expect(sent.at(-1)).toMatchObject({ type: 'result', requestId: 'r1' })
  })

  it('実行が終わったあとの cancel は何も送らない', async () => {
    const { sent, handler } = setup()
    await handler(loadMaster)
    await handler(solveMessage('r1'))
    sent.length = 0
    await handler({ type: 'cancel', requestId: 'r1' })
    expect(sent).toEqual([])
  })

  it('実行中に別の solve を受けたら、前の要求を打ち切って新しい要求を始める', async () => {
    const { sent, hooks, handler } = setup()
    await handler(loadMaster)
    sent.length = 0
    let nested: Promise<void> | undefined
    hooks.onYield = (count) => {
      if (count === 2) nested = handler(solveMessage('r2', 1))
    }
    await handler(solveMessage('r1'))
    await nested
    expect(sent.filter((m) => requestIdOf(m) === 'r1')).toEqual([
      { type: 'progress', requestId: 'r1', found: 1 },
    ])
    expect(sent.filter((m) => m.type === 'result').map(requestIdOf)).toEqual(['r2'])
    expect(sent.filter((m) => m.type === 'error')).toEqual([])
  })

  it('打ち切ったあとも、新しい solve は最後まで処理できる', async () => {
    const { sent, hooks, handler } = setup()
    await handler(loadMaster)
    hooks.onYield = (count) => {
      if (count === 2) void handler({ type: 'cancel', requestId: 'r1' })
    }
    await handler(solveMessage('r1'))
    hooks.onYield = () => {}
    sent.length = 0
    await handler(solveMessage('r2'))
    expect(sent.at(-1)).toMatchObject({ type: 'result', requestId: 'r2' })
  })
})
