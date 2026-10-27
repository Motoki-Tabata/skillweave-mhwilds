import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthApi, CurrentUserResult } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

function setup(result: CurrentUserResult, logoutOk = true) {
  setActivePinia(createPinia())
  const api: AuthApi = {
    fetchCurrentUser: vi.fn(async () => result),
    logout: vi.fn(async () => logoutOk),
  }
  const auth = useAuthStore()
  auth.setApi(api)
  return { auth, api, toast: useToastStore() }
}

describe('auth ストア', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('[5] 取得前は判定中。ログイン中なら表示名を持つ', async () => {
    const { auth } = setup({ kind: 'authenticated', displayName: '狩人太郎' })
    expect(auth.status).toBe('checking')
    await auth.initialize()
    expect(auth.status).toBe('authenticated')
    expect(auth.displayName).toBe('狩人太郎')
  })

  it('[11] 取得は1回だけ', async () => {
    const { auth, api } = setup({ kind: 'unavailable' })
    await auth.initialize()
    await auth.initialize()
    expect(api.fetchCurrentUser).toHaveBeenCalledTimes(1)
    expect(auth.status).toBe('unavailable')
  })

  it('[6] ログアウト成功で未ログインに戻り、トーストを出す', async () => {
    const { auth, toast } = setup({ kind: 'authenticated', displayName: 'a' })
    await auth.initialize()
    expect(await auth.logout()).toBe(true)
    expect(auth.status).toBe('unauthenticated')
    expect(auth.displayName).toBe('')
    expect(auth.loggingOut).toBe(false)
    expect(toast.items.map((i) => i.message)).toEqual(['ログアウトしました'])
  })

  it('[6] ログアウト失敗はログイン中のまま、destructive のトースト', async () => {
    const { auth, toast } = setup({ kind: 'authenticated', displayName: 'a' }, false)
    await auth.initialize()
    expect(await auth.logout()).toBe(false)
    expect(auth.status).toBe('authenticated')
    expect(auth.loggingOut).toBe(false)
    expect(toast.items[0]?.tone).toBe('destructive')
    expect(toast.items[0]?.message).toContain('ログアウトできませんでした')
  })

  it('[6] ログアウト中の二重実行はしない', async () => {
    const { auth, api } = setup({ kind: 'authenticated', displayName: 'a' })
    await auth.initialize()
    const first = auth.logout()
    expect(await auth.logout()).toBe(false)
    await first
    expect(api.logout).toHaveBeenCalledTimes(1)
  })
})

// 010 AC-11（ログインの期限切れ）
describe('auth ストアの expire', () => {
  it('AC-11: ログイン中だけ未ログイン・表示名なしにして true を返し、2回目は false', async () => {
    const { auth, api } = setup({ kind: 'authenticated', displayName: '狩人太郎' })
    await auth.initialize()
    expect(auth.expire()).toBe(true)
    expect(auth.status).toBe('unauthenticated')
    expect(auth.displayName).toBe('')
    expect(auth.expire()).toBe(false)
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('AC-11: 未ログイン・取得できないときは何も変えず false', async () => {
    const { auth } = setup({ kind: 'unavailable' })
    await auth.initialize()
    expect(auth.expire()).toBe(false)
    expect(auth.status).toBe('unavailable')
  })
})
