import highsLoader from 'highs'
import highsWasmUrl from 'highs/runtime?url'
import { createWorkerHandler } from '@swv/solver'
import type { WorkerInbound } from '@swv/solver'
import type { SolverWorkerOutbound } from '@/lib/solver/client'

/** `tsconfig.app.json` は DOM の型なので、Worker のグローバルは使う最小の形だけ型を付ける。 */
interface WorkerScope {
  postMessage: (message: SolverWorkerOutbound) => void
  onmessage: ((event: { data: WorkerInbound }) => void) | null
}

const scope = self as unknown as WorkerScope

function post(message: SolverWorkerOutbound): void {
  scope.postMessage(message)
}

type Handler = (message: WorkerInbound) => Promise<void>

// HiGHS の WASM の URL は明示する（`new URL('highs.wasm', import.meta.url)` は事前バンドルで変わりうる）
async function createHandler(): Promise<Handler | null> {
  try {
    const highs = await highsLoader({ locateFile: () => highsWasmUrl })
    return createWorkerHandler({
      highs,
      post,
      now: () => performance.now(),
      yieldControl: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    })
  } catch (e) {
    post({ type: 'initFailed', message: e instanceof Error ? e.message : '不明な例外' })
    return null
  }
}

const ready = createHandler()

scope.onmessage = (event) => {
  const message = event.data
  void ready
    .then((handler) => handler?.(message))
    .catch((e: unknown) => {
      if (message.type !== 'solve') return
      const detail = e instanceof Error ? e.message : '不明な例外'
      post({
        type: 'error',
        requestId: message.requestId,
        message: `ソルバーの内部エラー: ${detail}`,
      })
    })
}
