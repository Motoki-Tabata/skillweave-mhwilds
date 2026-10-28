import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/stores/toast'
import { createMemoryBuildsApi } from '../../support/buildsApi'
import type { MemoryBuildsApi } from '../../support/buildsApi'
import { FakeWorker, makeBuild, wp } from '../../support/fixtures'
import {
  blur,
  click,
  fakeAuthApi,
  findButton,
  flushPromises,
  installDomPolyfills,
  loggedInAuth,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
  typeInto,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'
import type { AuthApi } from '@/lib/api/auth'

const saveButton = (n = 1) =>
  document.querySelector<HTMLButtonElement>(`[data-save-index="${n - 1}"]`)!
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const input = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)

// 011 の S1（検索結果の構成のカードの「保存」・D5・D6）
describe('ResultsPanel の構成の保存', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function search(
    options: { auth?: AuthApi; api?: MemoryBuildsApi; builds?: number } = {},
  ): Promise<Mounted & { api: MemoryBuildsApi }> {
    stubBackend()
    const api = options.api ?? createMemoryBuildsApi()
    const m = await mountReadyApp({ authApi: options.auth ?? loggedInAuth(), buildsApi: api })
    mounted = m
    await vi.waitFor(() => expect(m.pinia.state.value.auth.status).not.toBe('checking'))
    m.conditions.selectWeapon(wp('great-sword:1'))
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    const worker = FakeWorker.last
    const builds = Array.from({ length: options.builds ?? 2 }, makeBuild)
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds, elapsedMs: 1 },
    })
    await flushPromises()
    return { ...m, api }
  }

  describe('「保存」のボタン', () => {
    it('検索が終わった後のカードに、「構成 N を保存」の名前のボタンを出す', async () => {
      await search()
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 を保存')
      expect(saveButton(1).getAttribute('title')).toBe('構成 1 を保存')
      expect(saveButton(2).getAttribute('aria-label')).toBe('構成 2 を保存')
    })

    it('検索中に見つけた順に出すカードには出さない', async () => {
      stubBackend()
      mounted = await mountReadyApp({ authApi: loggedInAuth() })
      mounted.conditions.selectWeapon(wp('great-sword:1'))
      await flushPromises()
      await click(document.querySelector('button[type="submit"]')!)
      const worker = FakeWorker.last
      worker.emit({ type: 'progress', requestId: worker.lastSolveId, found: 1, build: makeBuild() })
      await flushPromises()
      expect(document.querySelectorAll('h3')).toHaveLength(1)
      expect(document.querySelector('[data-save-index]')).toBeNull()
    })

    it('認証状態の判定中は押せない', async () => {
      const m = await search()
      m.pinia.state.value.auth.status = 'checking'
      await flushPromises()
      expect(saveButton().disabled).toBe(true)
    })
  })

  describe('ログイン中', () => {
    it('AC-1: 押すと「構成を保存」を開き、初期値「<武器名> 構成<N>」を全選択して入力欄にフォーカスする', async () => {
      await search()
      await click(saveButton(2))
      expect(textOf(dialog()!.querySelector('h2'))).toBe('構成を保存')
      expect(textOf(dialog())).toContain(
        '構成 2 に名前を付けて保存します。保存した構成は、同じアカウントでログインしたほかの端末でも開けます。',
      )
      expect(input().value).toBe('鉄の大剣 構成2')
      await vi.waitFor(() => expect(document.activeElement).toBe(input()))
      expect(input().selectionStart).toBe(0)
      expect(input().selectionEnd).toBe(input().value.length)
      expect(textOf(dialog())).toContain('50文字まで。同じ名前の構成も保存できます。')
    })

    it('AC-1: 保存すると、クライアント採番の UUIDv7 の ID・検索したときのマスターの版・内容をサーバーに送る', async () => {
      const m = await search()
      await click(saveButton(1))
      await typeInto(input(), '  私の構成  ')
      await click(findButton('保存', dialog()!))
      expect(m.api.created).toHaveLength(1)
      const request = m.api.created[0] as {
        id: string
        name: string
        masterVersion: string
        schemaVersion: number
        payload: Record<string, unknown>
      }
      expect(request.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      expect(request.name).toBe('私の構成')
      expect(request.masterVersion).toBe('test-1')
      expect(request.schemaVersion).toBe(1)
      expect(request.payload).toMatchObject({
        weapon: { kind: 'master', weaponId: wp('great-sword:1') },
        skills: makeBuild().skills,
        freeSlots: makeBuild().freeSlots,
        decorations: makeBuild().decorations,
      })
      expect(m.api.snapshot()).toHaveLength(1)
    })

    it('AC-1: 成功すると閉じ、トーストを出し、そのカードを「保存済み」にしてフォーカスを移す。ほかのカードは変えない', async () => {
      const m = await search()
      await click(saveButton(1))
      await click(findButton('保存', dialog()!))
      expect(dialog()).toBeNull()
      expect(toasts(m)).toContain(
        '「鉄の大剣 構成1」を保存しました。「保存した構成」から開けます。',
      )
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 は保存済み')
      expect(saveButton(1).getAttribute('aria-disabled')).toBe('true')
      expect(textOf(saveButton(1))).toBe('保存済み')
      expect(saveButton(2).getAttribute('aria-label')).toBe('構成 2 を保存')
      await vi.waitFor(() => expect(document.activeElement).toBe(saveButton(1)))
    })

    it('AC-1: 保存済みのカードを押しても、もう一度は保存しない', async () => {
      const m = await search()
      await click(saveButton(1))
      await click(findButton('保存', dialog()!))
      await click(saveButton(1))
      expect(dialog()).toBeNull()
      expect(m.api.calls.create).toBe(1)
    })

    it('AC-1: 検索し直すと「保存済み」の印を消す', async () => {
      await search()
      await click(saveButton(1))
      await click(findButton('保存', dialog()!))
      await click(document.querySelector('button[type="submit"]')!)
      const worker = FakeWorker.last
      worker.emit({
        type: 'result',
        requestId: worker.lastSolveId,
        response: { status: 'optimal', builds: [makeBuild()], elapsedMs: 1 },
      })
      await flushPromises()
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 を保存')
    })

    it('AC-6: 空の名前・51 文字の名前は送らずにエラーを出す', async () => {
      const m = await search()
      await click(saveButton(1))
      await typeInto(input(), '  ')
      await blur(input())
      expect(textOf(dialog())).toContain('名前を入力してください。')
      await click(findButton('保存', dialog()!))
      await typeInto(input(), 'あ'.repeat(51))
      await click(findButton('保存', dialog()!))
      expect(textOf(dialog())).toContain('名前は50文字以内で入力してください。')
      expect(m.api.calls.create).toBe(0)
      expect(input().getAttribute('aria-invalid')).toBe('true')
    })

    it('AC-6: 送信中は「保存中…」にして、キャンセルを無効にし、Escape でも閉じない', async () => {
      const api = createMemoryBuildsApi()
      await search({ api })
      const release = api.hold('create')
      await click(saveButton(1))
      await click(findButton('保存', dialog()!))
      expect(findButton('保存中…', dialog()!).disabled).toBe(true)
      expect(findButton('キャンセル', dialog()!).disabled).toBe(true)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()
      expect(dialog()).not.toBeNull()
      release()
      await flushPromises()
      expect(dialog()).toBeNull()
    })

    it('キャンセルすると保存せずに閉じ、押した「保存」へフォーカスを戻す', async () => {
      const m = await search()
      await click(saveButton(2))
      await click(findButton('キャンセル', dialog()!))
      expect(dialog()).toBeNull()
      expect(m.api.calls.create).toBe(0)
      await vi.waitFor(() => expect(document.activeElement).toBe(saveButton(2)))
    })

    it('AC-12: 通信の失敗は開いたまま入力を残し、トーストで知らせ、押し直すと新しい ID で送る', async () => {
      const api = createMemoryBuildsApi()
      const m = await search({ api })
      const create = vi.spyOn(api, 'create')
      await click(saveButton(1))
      await typeInto(input(), '名前')
      api.failWith('create', { kind: 'failed', cause: 'network' })
      await click(findButton('保存', dialog()!))
      expect(dialog()).not.toBeNull()
      expect(input().value).toBe('名前')
      expect(toasts(m)).toContain(
        '構成を保存できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      )
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 を保存')
      await flushPromises()
      expect(create).toHaveBeenCalledTimes(1)
      api.failWith('create', null)
      await click(findButton('保存', dialog()!))
      expect(create).toHaveBeenCalledTimes(2)
      expect(create.mock.calls[0]![0].id).not.toBe(create.mock.calls[1]![0].id)
      expect(dialog()).toBeNull()
    })

    it('AC-12: 401 では閉じ、保存しなかったことと期限切れを知らせ、ヘッダーを未ログインに戻す。カードは元のまま', async () => {
      const api = createMemoryBuildsApi()
      const m = await search({ api })
      await click(saveButton(1))
      api.failWith('create', { kind: 'unauthorized' })
      await click(findButton('保存', dialog()!))
      expect(dialog()).toBeNull()
      expect(toasts(m)).toEqual([
        'ログインの有効期限が切れたため、保存しませんでした。もう一度「Discord でログイン」を押してください。ログインするとこのページを離れるため、いまの検索結果は消えます。',
      ])
      expect(m.pinia.state.value.auth.status).toBe('unauthenticated')
      expect(document.querySelector('[data-slot="auth-login"]')).not.toBeNull()
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 を保存')
    })

    it('AC-12: 送信中にログアウトしたら、応答を画面に反映せず、トーストも出さない', async () => {
      const api = createMemoryBuildsApi()
      const m = await search({ api })
      const release = api.hold('create')
      await click(saveButton(1))
      await click(findButton('保存', dialog()!))
      m.pinia.state.value.auth.status = 'unauthenticated'
      await flushPromises()
      expect(dialog()).toBeNull()
      release()
      await flushPromises()
      expect(toasts(m)).toEqual([])
      expect(saveButton(1).getAttribute('aria-label')).toBe('構成 1 を保存')
    })
  })

  // AC-2
  describe('未ログイン・取得できない', () => {
    it('AC-2: 未ログインでは保存せず、ログインが必要のダイアログを出し、「閉じる」にフォーカスする', async () => {
      const auth = fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) })
      const m = await search({ auth })
      await click(saveButton(1))
      expect(textOf(dialog()!.querySelector('h2'))).toBe('構成の保存にはログインが必要です')
      expect(textOf(dialog())).toContain(
        '構成を保存するには、Discord でログインしてください。ログインするとこのページを離れるため、いまの検索結果は消えます。ログインした後に、もう一度検索してから保存してください。',
      )
      expect(m.api.calls.create).toBe(0)
      await vi.waitFor(() => expect(textOf(document.activeElement)).toBe('閉じる'))
    })

    it('AC-2: 取得できないときは、状態を確認できなかった旨の本文を出す', async () => {
      await search({ auth: fakeAuthApi() })
      await click(saveButton(1))
      expect(textOf(dialog())).toContain(
        'ログインの状態を確認できなかったため、構成を保存できません。Discord でログインしてください。ログインするとこのページを離れるため、いまの検索結果は消えます。',
      )
    })

    it('AC-2: 「Discord でログイン」は戻り先を今の画面（/）にしてログインへ向かう', async () => {
      await search({ auth: fakeAuthApi() })
      await click(saveButton(1))
      const link = Array.from(dialog()!.querySelectorAll('a')).find(
        (a) => textOf(a) === 'Discord でログイン',
      )!
      expect(link.getAttribute('href')).toBe('/api/oauth2/authorization/discord')
      link.addEventListener('click', (event) => event.preventDefault())
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(sessionStorage.getItem('swv-login-return')).toBe('/')
      sessionStorage.clear()
    })

    it('AC-2: 「閉じる」で閉じると、押した「保存」へフォーカスを戻し、カードは元のまま', async () => {
      await search({ auth: fakeAuthApi() })
      await click(saveButton(2))
      await click(findButton('閉じる', dialog()!))
      expect(dialog()).toBeNull()
      await vi.waitFor(() => expect(document.activeElement).toBe(saveButton(2)))
      expect(saveButton(2).getAttribute('aria-label')).toBe('構成 2 を保存')
    })
  })
})
