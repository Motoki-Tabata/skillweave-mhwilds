import type { Router } from 'vue-router'
import type { AuthStatus } from '@/stores/auth'

const LOGIN_DONE = 'Discord でログインしました'
const LOGIN_FAILED =
  'Discord でログインできませんでした。もう一度「Discord でログイン」を押してください。'

interface AuthLike {
  initialize: () => Promise<AuthStatus>
}
interface ToastLike {
  push: (message: string, tone?: 'default' | 'destructive') => void
}

/** ログインを押した画面の `fullPath` を覚える sessionStorage のキー。 */
export const LOGIN_RETURN_KEY = 'swv-login-return'

/** 今の画面を覚える。sessionStorage が使えなければ黙って何もしない。 */
export function saveLoginReturn(fullPath: string): void {
  try {
    sessionStorage.setItem(LOGIN_RETURN_KEY, fullPath)
  } catch {
    // 使えないときは覚えずに移る（エラーは出さない）
  }
}

/** 覚えた画面を読んで消す。無い・読めないときは null。 */
export function takeLoginReturn(): string | null {
  try {
    const value = sessionStorage.getItem(LOGIN_RETURN_KEY)
    sessionStorage.removeItem(LOGIN_RETURN_KEY)
    return value
  } catch {
    return null
  }
}

/** 端末の値を信じず、アプリ内でルートに一致するパスだけを通す。それ以外は `/`。 */
export function safeReturnPath(raw: string, router: Router): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  return router.resolve(raw).matched.length > 0 ? raw : '/'
}

/**
 * 起動のときの処理。戻り先の記録を先に読んで消し、認証状態を1回取得する。
 * 記録があれば戻り先へ `replace` し、成功・失敗（401）をトーストで知らせる。
 * 取得できないときはトーストを出さない。記録が無ければ戻り先の処理をしない。
 */
export async function restoreAfterLogin(
  router: Router,
  auth: AuthLike,
  toast: ToastLike,
): Promise<void> {
  const saved = takeLoginReturn()
  const status = await auth.initialize()
  if (saved === null) return
  await router.replace(safeReturnPath(saved, router))
  if (status === 'authenticated') toast.push(LOGIN_DONE)
  else if (status === 'unauthenticated') toast.push(LOGIN_FAILED, 'destructive')
}
