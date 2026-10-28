import { HttpError } from '@/lib/http'

/** 失敗の原因。`network` は fetch が届かない、`server` はそれ以外（status・応答の形の不正）。 */
export type ApiFailureCause = 'network' | 'server'

/** 画面に出す原因の文言（護石と構成で同じ）。 */
export const API_FAILURE_MESSAGES: Record<ApiFailureCause, string> = {
  network: 'サーバーに接続できませんでした。',
  server: 'サーバーで処理できませんでした。',
}

export type ApiFailure =
  | { kind: 'unauthorized' }
  | { kind: 'conflict' }
  | { kind: 'notFound' }
  | { kind: 'failed'; cause: ApiFailureCause }

/** API の結果。例外にせず、成功と失敗の種類で返す。 */
export type ApiResult<T> = { kind: 'ok'; value: T } | ApiFailure

export const SERVER_FAILURE: ApiFailure = { kind: 'failed', cause: 'server' }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function failureOf(error: unknown): ApiFailure {
  if (error instanceof HttpError) {
    if (error.status === 401) return { kind: 'unauthorized' }
    if (error.status === 409) return { kind: 'conflict' }
    if (error.status === 404) return { kind: 'notFound' }
    return SERVER_FAILURE
  }
  // fetch が届かないとき TypeError になる。応答の本文が JSON でないときは SyntaxError
  return error instanceof TypeError ? { kind: 'failed', cause: 'network' } : SERVER_FAILURE
}

/** 呼び出しを実行し、応答の形を検査して結果にする。形が合わなければ `failed`（`server`）。 */
export async function run<T>(
  call: () => Promise<unknown>,
  convert: (body: unknown) => T | null,
): Promise<ApiResult<T>> {
  try {
    const converted = convert(await call())
    return converted === null ? SERVER_FAILURE : { kind: 'ok', value: converted }
  } catch (error) {
    return failureOf(error)
  }
}

/** 原因の文言。`failed` 以外（想定外）は `server` と同じにする。 */
export function failureCauseText(failure: ApiFailure): string {
  return API_FAILURE_MESSAGES[failure.kind === 'failed' ? failure.cause : 'server']
}
