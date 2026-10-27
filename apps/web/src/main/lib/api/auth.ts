import { HttpError, http } from '@/lib/http'
import type { components } from '@/lib/api/schema'

export type CurrentUser = components['schemas']['CurrentUser']

/** `GET /api/auth/me` の結果。取得できないときも例外にしない。 */
export type CurrentUserResult =
  | { kind: 'authenticated'; displayName: string }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

/** 認証の API。ストアへ差し替えられる形にして、テストで偽物を渡す。 */
export interface AuthApi {
  fetchCurrentUser: () => Promise<CurrentUserResult>
  /** 204 と 401（既に切れている）を成功とし、それ以外は false。例外は投げない。 */
  logout: () => Promise<boolean>
}

function isDisplayName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export async function fetchCurrentUser(): Promise<CurrentUserResult> {
  try {
    const body = await http.get<Partial<CurrentUser> | null>('/api/auth/me')
    const displayName = body?.displayName
    return isDisplayName(displayName)
      ? { kind: 'authenticated', displayName }
      : { kind: 'unavailable' }
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return { kind: 'unauthenticated' }
    return { kind: 'unavailable' }
  }
}

export async function logout(): Promise<boolean> {
  try {
    await http.post<void>('/api/auth/logout')
    return true
  } catch (error) {
    return error instanceof HttpError && error.status === 401
  }
}

export const authApi: AuthApi = { fetchCurrentUser, logout }
