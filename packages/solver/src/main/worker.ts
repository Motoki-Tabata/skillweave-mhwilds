import type { Highs } from 'highs'
import type { MasterBundle, MasterVersion } from '@swv/data'
import { InvalidRequestError, SolveCancelledError } from './errors'
import type { SolverRequest, SolverResponse } from './request'
import { solveBuilds } from './solveBuilds'

// Worker とのメッセージ（マスターは最初に 1 回だけ送る）
export type WorkerInbound =
  | { type: 'loadMaster'; bundle: MasterBundle }
  | { type: 'solve'; requestId: string; request: SolverRequest }
  | { type: 'cancel'; requestId: string }

export type WorkerOutbound =
  | { type: 'masterLoaded'; version: MasterVersion }
  | { type: 'progress'; requestId: string; found: number }
  | { type: 'result'; requestId: string; response: SolverResponse }
  | { type: 'error'; requestId: string; message: string }

export interface WorkerDeps {
  highs: Highs
  post: (message: WorkerOutbound) => void
  now: () => number
  yieldControl: () => Promise<void>
}

interface RunningRequest {
  requestId: string
  cancelled: boolean
}

/** 不正な要求はその message、それ以外は内部エラーと分かる文言にする */
function errorMessage(e: unknown): string {
  if (e instanceof InvalidRequestError) return e.message
  const detail = e instanceof Error ? e.message : '不明な例外'
  return `ソルバーの内部エラー: ${detail}`
}

/**
 * Worker のメッセージハンドラ。self に触れず、送信は deps.post で行う。
 * 読み込んだマスターと実行中の要求（同時に 1 件）はこの関数の閉包に持つ。
 */
export function createWorkerHandler(deps: WorkerDeps): (message: WorkerInbound) => Promise<void> {
  const { highs, post, now, yieldControl } = deps
  let master: MasterBundle | null = null
  let running: RunningRequest | null = null

  async function solve(
    bundle: MasterBundle,
    requestId: string,
    request: SolverRequest,
  ): Promise<void> {
    // 実行中の要求は、次の求解の合間で打ち切る
    if (running !== null) running.cancelled = true
    const me: RunningRequest = { requestId, cancelled: false }
    running = me
    try {
      const response = await solveBuilds(highs, bundle, request, {
        now,
        yieldControl,
        isCancelled: () => me.cancelled,
        onProgress: (found) => {
          if (!me.cancelled) post({ type: 'progress', requestId, found })
        },
      })
      if (!me.cancelled) post({ type: 'result', requestId, response })
    } catch (e) {
      if (e instanceof SolveCancelledError || me.cancelled) return
      post({ type: 'error', requestId, message: errorMessage(e) })
    } finally {
      if (running === me) running = null
    }
  }

  return async (message) => {
    switch (message.type) {
      case 'loadMaster':
        master = message.bundle
        post({ type: 'masterLoaded', version: message.bundle.version })
        return
      case 'solve':
        if (master === null) {
          post({
            type: 'error',
            requestId: message.requestId,
            message: 'マスターが読み込まれていない',
          })
          return
        }
        await solve(master, message.requestId, message.request)
        return
      case 'cancel':
        if (running?.requestId === message.requestId) running.cancelled = true
        return
    }
  }
}
