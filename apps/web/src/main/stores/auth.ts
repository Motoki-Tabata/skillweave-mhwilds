import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/lib/api/auth'
import type { AuthApi } from '@/lib/api/auth'
import { useToastStore } from '@/stores/toast'

/** 判定中・未ログイン・ログイン中・取得できない。 */
export type AuthStatus = 'checking' | 'unauthenticated' | 'authenticated' | 'unavailable'

const LOGOUT_DONE = 'ログアウトしました'
const LOGOUT_FAILED =
  'ログアウトできませんでした。通信の状態を確かめて、もう一度「ログアウト」を押してください。'

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('checking')
  const displayName = ref('')
  const loggingOut = ref(false)
  let api: AuthApi = authApi
  let initializing: Promise<AuthStatus> | null = null

  /** 認証 API を差し替える（テスト用）。状態は判定中に戻す。 */
  function setApi(next: AuthApi): void {
    api = next
    initializing = null
    status.value = 'checking'
    displayName.value = ''
    loggingOut.value = false
  }

  /** 認証状態を1回だけ取得する。2回目以降は同じ結果を返す。 */
  function initialize(): Promise<AuthStatus> {
    initializing ??= api.fetchCurrentUser().then((result) => {
      if (result.kind === 'authenticated') displayName.value = result.displayName
      status.value = result.kind === 'authenticated' ? 'authenticated' : result.kind
      return status.value
    })
    return initializing
  }

  /** ログアウトする。成功すれば true。結果はトーストで知らせる。 */
  async function logout(): Promise<boolean> {
    if (loggingOut.value) return false
    loggingOut.value = true
    const toast = useToastStore()
    try {
      const ok = await api.logout()
      if (ok) {
        status.value = 'unauthenticated'
        displayName.value = ''
        toast.push(LOGOUT_DONE)
      } else {
        toast.push(LOGOUT_FAILED, 'destructive')
      }
      return ok
    } finally {
      loggingOut.value = false
    }
  }

  /**
   * ログインの期限切れ（護石の API の 401）を反映する。ログアウトの API は呼ばない。
   * ログイン中のときだけ未ログインにして true を返す（同時の 401 で最初の1回だけ true）。
   */
  function expire(): boolean {
    if (status.value !== 'authenticated') return false
    status.value = 'unauthenticated'
    displayName.value = ''
    return true
  }

  return { status, displayName, loggingOut, setApi, initialize, logout, expire }
})
