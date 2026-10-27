import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  LOGIN_RETURN_KEY,
  restoreAfterLogin,
  safeReturnPath,
  saveLoginReturn,
  takeLoginReturn,
} from '@/lib/auth/loginReturn'
import { routes } from '@/router'
import type { AuthStatus } from '@/stores/auth'

const router = createRouter({ history: createMemoryHistory(), routes })

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// 受入基準 3（戻り先への復帰）
describe('戻り先の記録', () => {
  it('[3] 書いた値を読むと消える', () => {
    saveLoginReturn('/charms?x=1')
    expect(takeLoginReturn()).toBe('/charms?x=1')
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull()
    expect(takeLoginReturn()).toBeNull()
  })

  it('[3] sessionStorage が使えなくても例外を出さない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveLoginReturn('/charms')).not.toThrow()
    expect(takeLoginReturn()).toBeNull()
  })

  it.each([
    ['/charms', '/charms'],
    ['/weapons?a=1#h', '/weapons?a=1#h'],
    ['//evil.example', '/'],
    ['https://evil.example/', '/'],
    ['/\\evil', '/'],
    ['charms', '/'],
    ['/no-such-route', '/'],
  ])('[3] 戻り先 %s は %s', (raw, expected) => {
    expect(safeReturnPath(raw, router)).toBe(expected)
  })
})

describe('restoreAfterLogin', () => {
  async function run(status: AuthStatus, saved: string | null) {
    if (saved !== null) saveLoginReturn(saved)
    const r = createRouter({ history: createMemoryHistory(), routes })
    await r.push('/')
    const toast = { push: vi.fn() }
    await restoreAfterLogin(r, { initialize: async () => status }, toast)
    return { path: r.currentRoute.value.fullPath, toast }
  }

  it('[3] 記録あり・ログイン中は戻り先へ移り、成功のトースト', async () => {
    const { path, toast } = await run('authenticated', '/charms')
    expect(path).toBe('/charms')
    expect(toast.push).toHaveBeenCalledWith('Discord でログインしました')
  })

  it('[4] 記録あり・401 は戻り先へ移り、destructive の失敗トースト', async () => {
    const { path, toast } = await run('unauthenticated', '/weapons')
    expect(path).toBe('/weapons')
    expect(toast.push).toHaveBeenCalledWith(
      'Discord でログインできませんでした。もう一度「Discord でログイン」を押してください。',
      'destructive',
    )
  })

  it('[11] 記録あり・取得できないは戻り先へ移るがトーストは出さない', async () => {
    const { path, toast } = await run('unavailable', '/charms')
    expect(path).toBe('/charms')
    expect(toast.push).not.toHaveBeenCalled()
  })

  it('[3] 記録なしは移らず、トーストも出さない', async () => {
    const { path, toast } = await run('unauthenticated', null)
    expect(path).toBe('/')
    expect(toast.push).not.toHaveBeenCalled()
  })

  it('[3] 不正な記録は / に倒す', async () => {
    const { path } = await run('authenticated', '//evil.example')
    expect(path).toBe('/')
  })
})
