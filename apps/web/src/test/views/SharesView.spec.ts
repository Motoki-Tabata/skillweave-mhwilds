import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/stores/toast'
import { createMemorySharesApi, savedShare } from '../support/sharesApi'
import type { MemorySharesApi } from '../support/sharesApi'
import {
  click,
  fakeAuthApi,
  findButton,
  findByLabel,
  flushPromises,
  installDomPolyfills,
  loggedInAuth,
  mountApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'

const body = () => textOf(document.body)
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)
const h1 = () => document.querySelector<HTMLElement>('h1')!
const names = () => Array.from(document.querySelectorAll('[data-name-id]')).map((a) => textOf(a))

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

// 012 S6（共有した構成）AC-8・AC-9・AC-12
describe('SharesView（S6 共有した構成）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    Reflect.deleteProperty(navigator, 'clipboard')
    document.body.innerHTML = ''
    sessionStorage.clear()
  })

  async function open(
    options: { api?: MemorySharesApi; auth?: 'in' | 'out' | 'unavailable' } = {},
  ): Promise<Mounted & { api: MemorySharesApi }> {
    stubBackend()
    const api = options.api ?? createMemorySharesApi([savedShare(1), savedShare(2), savedShare(3)])
    const authApi =
      options.auth === 'out'
        ? fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) })
        : options.auth === 'unavailable'
          ? fakeAuthApi()
          : loggedInAuth()
    const m = await mountApp({ path: '/shares', authApi, sharesApi: api })
    mounted = m
    await vi.waitFor(() => expect(m.shares.status).not.toBe('loading'))
    await flushPromises()
    return { ...m, api }
  }

  it('AC-8: 自分の有効な共有を新しい順に並べ、見出しと説明を出す', async () => {
    await open()
    expect(textOf(h1())).toBe('共有した構成')
    expect(body()).toContain('保存した構成から共有した URL です。')
    expect(body()).toContain('共有した構成（3）')
    expect(document.querySelector('ul[aria-label="共有した構成（3 件）"]')).not.toBeNull()
    expect(names()).toEqual(['構成3', '構成2', '構成1'])
  })

  it('AC-8: 各行に名前（共有の閲覧へのリンク）・共有日時・URL の全文を出す', async () => {
    await open()
    const link = document.querySelector<HTMLAnchorElement>('[data-name-id]')!
    expect(link.getAttribute('href')).toBe('/s/Ab3dE6gH9j03')
    expect(body()).toMatch(/共有: \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/)
    expect(body()).toContain(`${location.origin}/s/Ab3dE6gH9j03`)
  })

  it('AC-8: 元の構成を削除した共有も、同じ形で一覧に出す', async () => {
    const api = createMemorySharesApi([savedShare(1, { name: '削除済みの元' })])
    api.setBuildExists(() => false)
    await open({ api })
    expect(names()).toEqual(['削除済みの元'])
  })

  it('AC-8: 「URL をコピー」でその行の URL を書き込み、トーストで知らせる', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const m = await open()
    await click(findByLabel('構成2 の URL をコピー'))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/s/Ab3dE6gH9j02`)
    expect(toasts(m)).toEqual(['URL をコピーしました。'])
  })

  it('AC-8: コピーに失敗したら、失敗のトーストを出してその行の URL を全選択する', async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })
    const m = await open()
    await click(findByLabel('構成2 の URL をコピー'))
    expect(toasts(m)).toEqual(['URL をコピーできませんでした。URL を選択してコピーしてください。'])
    expect(globalThis.getSelection()?.toString().trim()).toBe(`${location.origin}/s/Ab3dE6gH9j02`)
  })

  it('AC-9: 取り消しは確認を経て、行を消し、次の行の名前へフォーカスを移してトーストで知らせる', async () => {
    const m = await open()
    await click(findByLabel('構成2 の共有を取り消す'))
    const confirm = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(textOf(confirm)).toContain('共有を取り消しますか？')
    expect(textOf(confirm)).toContain(
      '「構成2」の共有を取り消します。取り消すと、この URL では構成を見られなくなります。元に戻せません。もう一度共有すると、別の URL になります。',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('キャンセル', confirm)))
    await click(findButton('共有を取り消す', confirm))
    await vi.waitFor(() => expect(names()).toEqual(['構成3', '構成1']))
    expect(m.api.snapshot().map((s) => s.name)).toEqual(['構成3', '構成1'])
    expect(toasts(m)).toEqual(['共有を取り消しました。'])
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector(`[data-name-id="${savedShare(1).id}"]`),
      ),
    )
  })

  it('AC-9: 最後の行を取り消したら前の行、どの行も無くなれば h1 へフォーカスを移す', async () => {
    await open({ api: createMemorySharesApi([savedShare(1), savedShare(2)]) })
    await click(findByLabel('構成1 の共有を取り消す'))
    await click(findButton('共有を取り消す', document.querySelector('[role="alertdialog"]')!))
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector(`[data-name-id="${savedShare(2).id}"]`),
      ),
    )
    await click(findByLabel('構成2 の共有を取り消す'))
    await click(findButton('共有を取り消す', document.querySelector('[role="alertdialog"]')!))
    await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
    expect(body()).toContain('共有した構成はありません。')
  })

  it('AC-9: 取り消しの応答を待つあいだ、その行の2つを無効にして「取り消し中…」にする', async () => {
    const m = await open()
    const release = m.api.hold('revoke')
    await click(findByLabel('構成2 の共有を取り消す'))
    await click(findButton('共有を取り消す', document.querySelector('[role="alertdialog"]')!))
    expect(findByLabel('構成2 の共有を取り消す')).toHaveProperty('disabled', true)
    expect(textOf(findByLabel('構成2 の共有を取り消す'))).toBe('取り消し中…')
    expect(findByLabel('構成2 の URL をコピー')).toHaveProperty('disabled', true)
    expect(findByLabel('構成3 の共有を取り消す')).toHaveProperty('disabled', false)
    release()
    await flushPromises()
  })

  it('AC-12: 取り消しの失敗はトーストで知らせ、一覧を変えず、取り消しのボタンへフォーカスを戻す', async () => {
    const m = await open()
    m.api.failWith('revoke', { kind: 'failed', cause: 'network' })
    await click(findByLabel('構成2 の共有を取り消す'))
    await click(findButton('共有を取り消す', document.querySelector('[role="alertdialog"]')!))
    await vi.waitFor(() => expect(toasts(m)).toHaveLength(1))
    expect(toasts(m)[0]).toContain('共有を取り消せませんでした。サーバーに接続できませんでした。')
    expect(names()).toEqual(['構成3', '構成2', '構成1'])
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(findByLabel('構成2 の共有を取り消す')),
    )
  })

  it('AC-12: 取り消しの 401 でログインが必要の表示に替え、期限切れを 1 回だけ知らせる', async () => {
    const m = await open()
    m.api.failWith('revoke', { kind: 'unauthorized' })
    await click(findByLabel('構成2 の共有を取り消す'))
    await click(findButton('共有を取り消す', document.querySelector('[role="alertdialog"]')!))
    await vi.waitFor(() => expect(body()).toContain('ログインが必要です'))
    expect(
      toasts(m).filter((message) => message.startsWith('ログインの有効期限が切れました')),
    ).toHaveLength(1)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('AC-8: 0件のときは空の表示と「保存した構成へ」のリンクを出す', async () => {
    await open({ api: createMemorySharesApi() })
    expect(body()).toContain(
      '共有した構成はありません。保存した構成の画面で「共有」を押すと、ここに表示します。',
    )
    const link = Array.from(document.querySelectorAll('a')).find(
      (a) => textOf(a) === '保存した構成へ',
    )!
    expect(link.getAttribute('href')).toBe('/builds')
  })

  it('AC-12: 未ログインでは共有用の本文でログインを促し、一覧を読まない', async () => {
    const m = await open({ auth: 'out' })
    expect(body()).toContain('ログインが必要です')
    expect(body()).toContain('共有した構成を見るには、Discord でログインしてください。')
    expect(m.api.calls.list).toBe(0)
  })

  it('AC-12: ログインの状態を取得できないときは、その旨を添えてログインを促す', async () => {
    await open({ auth: 'unavailable' })
    expect(body()).toContain(
      'ログインの状態を確認できませんでした。共有した構成を見るには、Discord でログインしてください。',
    )
  })

  it('AC-12: 戻り先は /shares にする', async () => {
    await open({ auth: 'out' })
    const link = Array.from(document.querySelectorAll('a')).find(
      (a) => textOf(a) === 'Discord でログイン' && !a.closest('header'),
    )!
    link.addEventListener('click', (event) => event.preventDefault())
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(sessionStorage.getItem('swv-login-return')).toBe('/shares')
  })

  it('AC-12: 一覧を取得できないときは読込失敗と再読み込みを出し、再読み込みで一覧に戻る', async () => {
    const api = createMemorySharesApi([savedShare(1)])
    api.failWith('list', { kind: 'failed', cause: 'server' })
    await open({ api })
    expect(body()).toContain('共有した構成を読み込めません')
    expect(body()).toContain('サーバーで処理できませんでした。')
    expect(body()).toContain('通信の状態を確かめて、「再読み込み」を押してください。')
    api.failWith('list', null)
    await click(findButton('再読み込み'))
    await vi.waitFor(() => expect(names()).toEqual(['構成1']))
  })

  it('AC-8: 読込が 300ms を超えたらスケルトンと読込中の文を出す', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      stubBackend()
      const api = createMemorySharesApi()
      const release = api.hold('list')
      mounted = await mountApp({ path: '/shares', authApi: loggedInAuth(), sharesApi: api })
      expect(body()).not.toContain('共有した構成を読み込んでいます…')
      await vi.advanceTimersByTimeAsync(301)
      expect(body()).toContain('共有した構成を読み込んでいます…')
      release()
      await vi.advanceTimersByTimeAsync(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
