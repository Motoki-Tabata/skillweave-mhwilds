import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { useToastStore } from '@/stores/toast'
import { buildId, savedBuild } from '../support/builds'
import { createMemoryBuildsApi } from '../support/buildsApi'
import type { MemoryBuildsApi } from '../support/buildsApi'
import {
  click,
  fakeAuthApi,
  findButton,
  flushPromises,
  installDomPolyfills,
  loggedInAuth,
  mountApp,
  restoreStubs,
  stubBackend,
  textOf,
  typeInto,
} from '../support/mount'
import type { Mounted } from '../support/mount'

const body = () => textOf(document.body)
const items = () => Array.from(document.querySelectorAll<HTMLElement>('ul[aria-label] > li'))
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)
const nameLink = (n: number) =>
  document.querySelector<HTMLElement>(`[data-name-id="${buildId(n)}"]`)!
const renameButton = (n: number) =>
  document.querySelector<HTMLButtonElement>(`[data-rename-id="${buildId(n)}"]`)!
const deleteButton = (n: number) =>
  document.querySelector<HTMLButtonElement>(`[data-delete-id="${buildId(n)}"]`)!
const dialogInput = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!
const confirmButton = () =>
  findButton('削除', document.querySelector<HTMLElement>('[role="alertdialog"]')!)
const h1 = () => document.querySelector<HTMLElement>('h1')!

describe('BuildsView（S4 保存した構成の一覧）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    vi.useRealTimers()
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function open(
    options: { api?: MemoryBuildsApi; loggedIn?: boolean; unavailable?: boolean } = {},
  ): Promise<Mounted & { api: MemoryBuildsApi }> {
    stubBackend()
    const api = options.api ?? createMemoryBuildsApi()
    const authApi =
      options.loggedIn === false
        ? fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) })
        : options.unavailable
          ? fakeAuthApi()
          : loggedInAuth()
    const m = await mountApp({ path: '/builds', authApi, buildsApi: api })
    mounted = m
    await vi.waitFor(() => expect(m.builds.status).not.toBe('loading'))
    await vi.waitFor(() => expect(m.master.status).toBe('ready'))
    await flushPromises()
    return { ...m, api }
  }

  // AC-3
  describe('一覧', () => {
    it('AC-3: 自分の構成を新しい順に表示し、名前・武器・保存日時を出す', async () => {
      await open({
        api: createMemoryBuildsApi([
          savedBuild(1, { name: '古い構成' }),
          savedBuild(3, { name: '新しい構成' }),
          savedBuild(2, { name: '真ん中' }),
        ]),
      })
      expect(items().map((li) => textOf(li.querySelector('a')))).toEqual([
        '新しい構成',
        '真ん中',
        '古い構成',
      ])
      expect(document.querySelector('ul[aria-label="保存した構成（3 件）"]')).not.toBeNull()
      expect(textOf(items()[0] ?? null)).toContain('武器: 鉄の大剣')
      expect(textOf(items()[0] ?? null)).toMatch(/保存: \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/)
      expect(nameLink(3).getAttribute('href')).toBe(`/builds/${buildId(3)}`)
      expect(body()).toContain('保存した構成（3）')
    })

    it('AC-3: 画面を開くたびにサーバーから一覧を読む', async () => {
      const { api } = await open({ api: createMemoryBuildsApi([savedBuild(1)]) })
      expect(api.calls.list).toBe(1)
    })

    it('AC-3: 0 件のときは空の表示と「装備検索へ」を出す', async () => {
      await open()
      expect(body()).toContain(
        '保存した構成はありません。装備検索の結果で「保存」を押すと、ここに表示します。',
      )
      const toSearch = Array.from(document.querySelectorAll('a')).find(
        (a) => textOf(a) === '装備検索へ',
      )
      expect(toSearch?.getAttribute('href')).toBe('/')
      expect(body()).toContain('装備検索へ')
    })

    it('AC-5: 保存したときの版が現在の版と違う行だけに「マスターの版が違う」を出す', async () => {
      await open({
        api: createMemoryBuildsApi([
          savedBuild(1, { masterVersion: 'old-0' }),
          savedBuild(2, { masterVersion: 'test-1' }),
        ]),
      })
      expect(textOf(items()[1] ?? null)).toContain('マスターの版が違う')
      expect(textOf(items()[0] ?? null)).not.toContain('マスターの版が違う')
    })

    it('AC-5: 現在のマスターに無い武器の構成も一覧に出る', async () => {
      await open({
        api: createMemoryBuildsApi([
          savedBuild(1, {
            payload: {
              ...savedBuild(1).payload,
              weapon: { kind: 'master', weaponId: 'wp:gone' },
            },
          }),
        ]),
      })
      expect(body()).toContain('武器: 不明な武器（wp:gone）')
    })
  })

  describe('読込中・失敗', () => {
    it('AC-12: 読込中は 300ms 未満は何も出さず、超えたらスケルトンと文言を出す', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      stubBackend()
      const api = createMemoryBuildsApi()
      const release = api.hold('list')
      mounted = await mountApp({ path: '/builds', authApi: loggedInAuth(), buildsApi: api })
      expect(body()).not.toContain('保存した構成を読み込んでいます…')
      vi.advanceTimersByTime(LOADING_SKELETON_DELAY_MS + 1)
      await flushPromises()
      expect(body()).toContain('保存した構成を読み込んでいます…')
      release()
      await flushPromises()
    })

    it('AC-12: 一覧を取得できないときは読み込めなかったことと原因・再読み込みを出し、押すと読み直す', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      api.failWith('list', { kind: 'failed', cause: 'network' })
      const m = await open({ api })
      expect(m.builds.status).toBe('failed')
      expect(body()).toContain('保存した構成を読み込めません')
      expect(body()).toContain('サーバーに接続できませんでした。')
      api.failWith('list', null)
      await click(findButton('再読み込み'))
      expect(items()).toHaveLength(1)
      expect(api.calls.list).toBe(2)
    })
  })

  // AC-2 / AC-12
  describe('ログインが必要', () => {
    it('AC-2: 未ログインでは一覧を読まず、ログインが必要の表示とログインのリンクを出す', async () => {
      const m = await open({ loggedIn: false })
      expect(m.api.calls.list).toBe(0)
      expect(body()).toContain('ログインが必要です')
      expect(body()).toContain('保存した構成を見るには、Discord でログインしてください。')
      const link = Array.from(document.querySelectorAll('main a, a')).find(
        (a) => textOf(a) === 'Discord でログイン' && !a.closest('header'),
      )
      expect(link?.getAttribute('href')).toBe('/api/oauth2/authorization/discord')
    })

    it('AC-2: 認証状態を取得できないときも同じ表示で、取得できない旨の本文を出す', async () => {
      await open({ unavailable: true })
      expect(body()).toContain(
        'ログインの状態を確認できませんでした。保存した構成を見るには、Discord でログインしてください。',
      )
    })

    it('AC-2: ログインを押すと今の画面を戻り先に覚える', async () => {
      await open({ loggedIn: false })
      const link = Array.from(document.querySelectorAll('a')).find(
        (a) => textOf(a) === 'Discord でログイン' && !a.closest('header'),
      )!
      link.addEventListener('click', (event) => event.preventDefault())
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(sessionStorage.getItem('swv-login-return')).toBe('/builds')
      sessionStorage.clear()
    })

    it('AC-12: 判定中は一覧もログインを促す表示も出さない', async () => {
      stubBackend()
      let resolve: (value: { kind: 'unauthenticated' }) => void = () => {}
      const authApi = fakeAuthApi({
        fetchCurrentUser: () => new Promise((r) => (resolve = r)),
      })
      mounted = await mountApp({ path: '/builds', authApi })
      expect(body()).not.toContain('ログインが必要です')
      resolve({ kind: 'unauthenticated' })
      await flushPromises()
      expect(body()).toContain('ログインが必要です')
    })

    it('AC-12: 一覧の取得が 401 のとき、期限切れのトーストを出してログインが必要の表示に替える', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      api.failWith('list', { kind: 'unauthorized' })
      const m = await open({ api })
      expect(body()).toContain('ログインが必要です')
      expect(toasts(m)).toEqual([
        'ログインの有効期限が切れました。もう一度「Discord でログイン」を押すと、保存した構成を使えます。',
      ])
      expect(m.pinia.state.value.auth.status).toBe('unauthenticated')
    })

    it('AC-12: ログアウトすると、その場でログインが必要の表示に替わり、開いているダイアログが閉じる', async () => {
      const m = await open({ api: createMemoryBuildsApi([savedBuild(1)]) })
      await click(renameButton(1))
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      m.pinia.state.value.auth.status = 'unauthenticated'
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(body()).toContain('ログインが必要です')
    })
  })

  // AC-6 / AC-9
  describe('名前の変更', () => {
    it('AC-6: 名前を変更すると、その行の名前を替え、並びは変えず、トーストを出して「名前を変更」へフォーカスを戻す', async () => {
      const m = await open({
        api: createMemoryBuildsApi([
          savedBuild(1, { name: '古い' }),
          savedBuild(2, { name: '新しい' }),
        ]),
      })
      await click(renameButton(1))
      expect(dialogInput().value).toBe('古い')
      await typeInto(dialogInput(), '  変えた名前  ')
      await click(findButton('保存'))
      expect(items().map((li) => textOf(li.querySelector('a')))).toEqual(['新しい', '変えた名前'])
      expect(toasts(m)).toContain('名前を変更しました。')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await vi.waitFor(() => expect(document.activeElement).toBe(renameButton(1)))
    })

    it('AC-6: 空の名前・51 文字の名前は送らずに入力欄の下にエラーを出す。50 文字は送る', async () => {
      const { api } = await open({ api: createMemoryBuildsApi([savedBuild(1)]) })
      await click(renameButton(1))
      await typeInto(dialogInput(), '   ')
      await click(findButton('保存'))
      expect(body()).toContain('名前を入力してください。')
      await typeInto(dialogInput(), 'あ'.repeat(51))
      await click(findButton('保存'))
      expect(body()).toContain('名前は50文字以内で入力してください。')
      expect(api.calls.rename).toBe(0)
      await typeInto(dialogInput(), 'あ'.repeat(50))
      await click(findButton('保存'))
      expect(api.calls.rename).toBe(1)
    })

    it('AC-6: 送信中は「保存中…」にして、キャンセルを無効にする', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      await open({ api })
      await click(renameButton(1))
      const release = api.hold('rename')
      await typeInto(dialogInput(), '別名')
      await click(findButton('保存'))
      expect(findButton('保存中…').disabled).toBe(true)
      expect(findButton('キャンセル').disabled).toBe(true)
      release()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    })

    it('AC-9: 行バージョンの不一致（409）は、別の端末で変更されたと知らせて一覧を読み直し、その構成の名前のリンクへフォーカスを移す', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { name: '元の名前' })])
      const m = await open({ api })
      await click(renameButton(1))
      api.seed(savedBuild(1, { name: '別の端末の名前', version: 5 }))
      await typeInto(dialogInput(), '自分の名前')
      await click(findButton('保存'))
      expect(toasts(m)).toContain(
        'この構成は別の端末で変更されていたため、名前を変更しませんでした。一覧を読み直しました。内容を確かめて、もう一度お試しください。',
      )
      expect(api.calls.list).toBe(2)
      expect(textOf(items()[0]?.querySelector('a') ?? null)).toBe('別の端末の名前')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await vi.waitFor(() => expect(document.activeElement).toBe(nameLink(1)))
    })

    it('AC-9: 別の端末で削除されていた（404）ときは知らせて読み直し、構成が無ければ h1 へフォーカスを移す', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      const m = await open({ api })
      await click(renameButton(1))
      api.drop(buildId(1))
      await typeInto(dialogInput(), '名前')
      await click(findButton('保存'))
      expect(toasts(m)).toContain(
        'この構成は別の端末で削除されていたため、名前を変更しませんでした。一覧を読み直しました。',
      )
      expect(items()).toHaveLength(0)
      await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
    })

    it('AC-9: 読み直しが失敗したら一覧の読込失敗にする', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      const m = await open({ api })
      await click(renameButton(1))
      api.seed(savedBuild(1, { version: 3 }))
      api.failWith('list', { kind: 'failed', cause: 'server' })
      await typeInto(dialogInput(), '名前')
      await click(findButton('保存'))
      expect(m.builds.status).toBe('failed')
      expect(body()).toContain('保存した構成を読み込めません')
    })

    it('AC-12: 通信の失敗は開いたまま入力を残し、トーストで知らせ、一覧を変えず、送り直さない', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { name: '元' })])
      const m = await open({ api })
      await click(renameButton(1))
      api.failWith('rename', { kind: 'failed', cause: 'network' })
      await typeInto(dialogInput(), '変更')
      await click(findButton('保存'))
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(dialogInput().value).toBe('変更')
      expect(toasts(m)).toContain(
        '名前を変更できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      )
      expect(textOf(items()[0]?.querySelector('a') ?? null)).toBe('元')
      await flushPromises()
      expect(api.calls.rename).toBe(1)
    })

    it('AC-12: 名前の変更が 401 のとき、ダイアログを閉じて期限切れを知らせ、ログインが必要の表示に替える', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      const m = await open({ api })
      await click(renameButton(1))
      api.failWith('rename', { kind: 'unauthorized' })
      await typeInto(dialogInput(), '変更')
      await click(findButton('保存'))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(body()).toContain('ログインが必要です')
      expect(toasts(m).filter((t) => t.startsWith('ログインの有効期限'))).toHaveLength(1)
    })
  })

  // AC-6 / AC-12
  describe('削除', () => {
    it('AC-6: 確認は「キャンセル」にフォーカスし、削除すると行が消え、次の行の名前のリンクへフォーカスを移す', async () => {
      const m = await open({
        api: createMemoryBuildsApi([savedBuild(1), savedBuild(2), savedBuild(3)]),
      })
      await click(deleteButton(2))
      const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
      expect(textOf(dialog)).toContain('構成を削除しますか？')
      expect(textOf(dialog)).toContain(
        '「構成2」を削除します。削除すると元に戻せません。同じアカウントのほかの端末からも消えます。',
      )
      await vi.waitFor(() => expect(textOf(document.activeElement)).toBe('キャンセル'))
      await click(confirmButton())
      expect(items()).toHaveLength(2)
      expect(toasts(m)).toContain('構成を削除しました。')
      await vi.waitFor(() => expect(document.activeElement).toBe(nameLink(1)))
    })

    it('AC-6: 最後の行を消したときは前の行、どちらも無ければ h1 へフォーカスを移す', async () => {
      await open({ api: createMemoryBuildsApi([savedBuild(1)]) })
      await click(deleteButton(1))
      await click(confirmButton())
      expect(items()).toHaveLength(0)
      await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
    })

    it('AC-6: キャンセルでは削除せず、「削除」へフォーカスを戻す', async () => {
      const { api } = await open({ api: createMemoryBuildsApi([savedBuild(1)]) })
      await click(deleteButton(1))
      await click(findButton('キャンセル'))
      expect(api.calls.remove).toBe(0)
      await vi.waitFor(() => expect(document.activeElement).toBe(deleteButton(1)))
    })

    it('AC-6: 応答を待つあいだ、その行の「名前を変更」「削除」を無効にして「削除中…」にする', async () => {
      const api = createMemoryBuildsApi([savedBuild(1), savedBuild(2)])
      await open({ api })
      const release = api.hold('remove')
      await click(deleteButton(1))
      await click(confirmButton())
      expect(deleteButton(1).textContent?.trim()).toBe('削除中…')
      expect(deleteButton(1).disabled).toBe(true)
      expect(renameButton(1).disabled).toBe(true)
      expect(deleteButton(2).disabled).toBe(false)
      release()
      await flushPromises()
      expect(items()).toHaveLength(1)
    })

    it('AC-12: 削除の失敗はトーストで知らせ、行を元に戻して一覧を変えず、送り直さない', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      const m = await open({ api })
      api.failWith('remove', { kind: 'failed', cause: 'server' })
      await click(deleteButton(1))
      await click(confirmButton())
      expect(toasts(m)).toContain(
        '構成を削除できませんでした。サーバーで処理できませんでした。 もう一度お試しください。',
      )
      expect(items()).toHaveLength(1)
      expect(deleteButton(1).textContent?.trim()).toBe('削除')
      expect(deleteButton(1).disabled).toBe(false)
      await flushPromises()
      expect(api.calls.remove).toBe(1)
      await vi.waitFor(() => expect(document.activeElement).toBe(deleteButton(1)))
    })

    it('AC-12: 削除が 401 のとき、期限切れを知らせてログインが必要の表示に替える', async () => {
      const api = createMemoryBuildsApi([savedBuild(1)])
      const m = await open({ api })
      api.failWith('remove', { kind: 'unauthorized' })
      await click(deleteButton(1))
      await click(confirmButton())
      expect(body()).toContain('ログインが必要です')
      expect(toasts(m).filter((t) => t.startsWith('ログインの有効期限'))).toHaveLength(1)
    })
  })
})
