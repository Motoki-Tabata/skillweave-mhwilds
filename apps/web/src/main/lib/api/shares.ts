import { http } from '@/lib/http'
import { isBuildPayload, BUILD_SCHEMA_VERSION } from '@/lib/api/builds'
import { isRecord, run } from '@/lib/api/result'
import type { ApiResult } from '@/lib/api/result'
import type { components } from '@/lib/api/schema'

export type Share = components['schemas']['Share']
export type CreateShareRequest = components['schemas']['CreateShareRequest']
export type SharedBuild = components['schemas']['SharedBuild']

/** 共有の作成の結果。`created` は要求の ID で行を作ったとき true、既存の有効な共有を返したとき false。 */
export interface CreatedShare {
  share: Share
  created: boolean
}

/** 共有の API。ストアへ差し替えられる形にして、テストで偽物を渡す。例外は投げない。 */
export interface SharesApi {
  list: () => Promise<ApiResult<Share[]>>
  create: (request: CreateShareRequest) => Promise<ApiResult<CreatedShare>>
  revoke: (id: string) => Promise<ApiResult<true>>
  view: (shortId: string) => Promise<ApiResult<SharedBuild>>
}

const SHORT_ID_PATTERN = /^[0-9A-Za-z]{12}$/

/** 応答の形（5項目の型・短縮 ID の形）を検査する。合わなければ null。 */
export function toShare(value: unknown): Share | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.shortId !== 'string' ||
    !SHORT_ID_PATTERN.test(value.shortId) ||
    typeof value.buildId !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null
  }
  return value as unknown as Share
}

function toShareList(body: unknown): Share[] | null {
  if (!Array.isArray(body)) return null
  const shares: Share[] = []
  for (const item of body as unknown[]) {
    const share = toShare(item)
    if (share === null) return null
    shares.push(share)
  }
  return shares
}

/** 応答の形（上位の項目・schemaVersion が 1・payload の各項目の有無と型）を検査する。合わなければ null。 */
export function toSharedBuild(value: unknown): SharedBuild | null {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.masterVersion !== 'string' ||
    value.schemaVersion !== BUILD_SCHEMA_VERSION ||
    typeof value.createdAt !== 'string' ||
    !isBuildPayload(value.payload)
  ) {
    return null
  }
  return value as unknown as SharedBuild
}

export const sharesApi: SharesApi = {
  list: () => run(() => http.get<unknown>('/api/shares'), toShareList),
  create: (request) =>
    run(
      () => http.post<unknown>('/api/shares', request),
      (body) => {
        const share = toShare(body)
        return share === null ? null : { share, created: share.id === request.id }
      },
    ),
  revoke: (id) =>
    run(
      () => http.delete<unknown>(`/api/shares/${encodeURIComponent(id)}`),
      () => true as const,
    ),
  view: (shortId) =>
    run(
      () => http.get<unknown>(`/api/shared-builds/${encodeURIComponent(shortId)}`),
      toSharedBuild,
    ),
}
