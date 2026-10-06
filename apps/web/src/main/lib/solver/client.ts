import type { MasterBundle } from '@swv/data'
import type { SolverRequest, SolverResponse, WorkerInbound, WorkerOutbound } from '@swv/solver'

/** Worker が HiGHS の初期化に失敗したときに送る（`packages/solver` の WorkerOutbound に足した web の型）。 */
export type SolverWorkerOutbound = WorkerOutbound | { type: 'initFailed'; message: string }

/** 読み込みの失敗の原因。 */
export type LoadFailureKind = 'master' | 'dictionary' | 'highs' | 'unknown'

export class LoadError extends Error {
  constructor(
    public readonly kind: LoadFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'LoadError'
  }
}

export const HIGHS_INIT_FAILED_MESSAGE = 'ソルバー（HiGHS）を初期化できませんでした。'
export const WORKER_STOPPED_MESSAGE = '検索を実行するプログラムが停止しました。'

/** クライアントが Worker に求める最小のインターフェース（単体テストでは偽物を渡す）。 */
export interface WorkerLike {
  postMessage(message: WorkerInbound): void
  terminate(): void
  onmessage: ((event: { data: SolverWorkerOutbound }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface SolveHandlers {
  onProgress: (found: number) => void
  onResult: (response: SolverResponse) => void
  onError: (message: string) => void
}

export interface SolverClient {
  /** Worker を作る（HiGHS の初期化が始まる）。前の Worker があれば終了させる。 */
  start(): void
  /** マスターを Worker に1回だけ渡し、受け取りの完了を待つ。 */
  load(bundle: MasterBundle): Promise<void>
  /** 検索を始める。現在の検索があれば捨てる。返すのは `requestId`。 */
  solve(request: SolverRequest, handlers: SolveHandlers): string
  /** 現在の検索を取り消す（以降の応答は捨てる）。 */
  cancel(): void
  dispose(): void
}

interface ActiveSolve {
  requestId: string
  handlers: SolveHandlers
}

interface PendingLoad {
  resolve: () => void
  reject: (error: LoadError) => void
}

export function createDefaultWorker(): WorkerLike {
  return new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

export function createSolverClient(
  createWorker: () => WorkerLike = createDefaultWorker,
): SolverClient {
  let worker: WorkerLike | null = null
  let bundle: MasterBundle | null = null
  let initFailure: LoadError | null = null
  let pendingLoad: PendingLoad | null = null
  let active: ActiveSolve | null = null

  function takeActive(requestId: string): ActiveSolve | null {
    if (active?.requestId !== requestId) return null
    const current = active
    active = null
    return current
  }

  function handleInitFailed(): void {
    initFailure = new LoadError('highs', HIGHS_INIT_FAILED_MESSAGE)
    if (pendingLoad !== null) {
      const load = pendingLoad
      pendingLoad = null
      load.reject(initFailure)
    }
    if (active !== null) {
      const current = active
      active = null
      current.handlers.onError(HIGHS_INIT_FAILED_MESSAGE)
    }
  }

  function handleMessage(message: SolverWorkerOutbound): void {
    switch (message.type) {
      case 'initFailed':
        handleInitFailed()
        return
      case 'masterLoaded': {
        const load = pendingLoad
        pendingLoad = null
        load?.resolve()
        return
      }
      case 'progress':
        // 現在の検索と requestId が違う応答は捨てる
        if (active?.requestId === message.requestId) active.handlers.onProgress(message.found)
        return
      case 'result':
        takeActive(message.requestId)?.handlers.onResult(message.response)
        return
      case 'error':
        takeActive(message.requestId)?.handlers.onError(message.message)
        return
    }
  }

  function handleCrash(crashed: WorkerLike): void {
    if (worker !== crashed) return
    crashed.terminate()
    worker = null
    if (pendingLoad !== null) {
      const load = pendingLoad
      pendingLoad = null
      load.reject(new LoadError('unknown', 'Worker が停止しました。'))
    }
    if (active !== null) {
      const current = active
      active = null
      current.handlers.onError(WORKER_STOPPED_MESSAGE)
    }
  }

  function spawn(): WorkerLike {
    const created = createWorker()
    created.onmessage = (event) => {
      // 終了させた Worker の遅れて届いたメッセージは捨てる
      if (worker === created) handleMessage(event.data)
    }
    created.onerror = () => handleCrash(created)
    worker = created
    initFailure = null
    return created
  }

  function start(): void {
    worker?.terminate()
    pendingLoad = null
    active = null
    bundle = null
    spawn()
  }

  function load(next: MasterBundle): Promise<void> {
    if (worker === null) return Promise.reject(new LoadError('unknown', 'Worker がありません。'))
    if (initFailure !== null) return Promise.reject(initFailure)
    bundle = next
    return new Promise<void>((resolve, reject) => {
      pendingLoad = { resolve, reject }
      worker?.postMessage({ type: 'loadMaster', bundle: next })
    })
  }

  function solve(request: SolverRequest, handlers: SolveHandlers): string {
    const requestId = crypto.randomUUID()
    active = { requestId, handlers }
    if (worker === null) {
      // 異常終了の後の最初の検索。取得済みのマスターを渡し直す（取り直さない）
      const respawned = spawn()
      if (bundle !== null) respawned.postMessage({ type: 'loadMaster', bundle })
    }
    if (initFailure !== null) {
      active = null
      handlers.onError(HIGHS_INIT_FAILED_MESSAGE)
      return requestId
    }
    worker?.postMessage({ type: 'solve', requestId, request })
    return requestId
  }

  function cancel(): void {
    if (active === null) return
    const { requestId } = active
    active = null
    worker?.postMessage({ type: 'cancel', requestId })
  }

  function dispose(): void {
    worker?.terminate()
    worker = null
    pendingLoad = null
    active = null
  }

  return { start, load, solve, cancel, dispose }
}
