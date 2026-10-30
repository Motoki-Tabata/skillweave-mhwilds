import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/stores/toast'
import { buildId, savedBuild } from '../support/builds'
import { createMemoryBuildsApi } from '../support/buildsApi'
import { createMemorySharesApi, savedShare } from '../support/sharesApi'
import type { MemorySharesApi } from '../support/sharesApi'
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
} from '../support/mount'
import type { Mounted } from '../support/mount'

const body = () => textOf(document.body)
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)
const shareButton = () => document.querySelector<HTMLButtonElement>('[data-share-id]')!
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const urlBox = () => document.querySelector<HTMLElement>('[data-share-url]')

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

// 012 D9: 保存した構成の画面から共有を作る
describe('BuildView の共有（S5・D9）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    Reflect.deleteProperty(navigator, 'clipboard')
    document.body.innerHTML = ''
  })

  async function open(
    options: { api?: MemorySharesApi; loggedIn?: boolean } = {},
  ): Promise<Mounted & { api: MemorySharesApi }> {
    stubBackend()
    const api = options.api ?? createMemorySharesApi()
    const m = await mountApp({
      path: `/builds/${buildId(1)}`,
      authApi:
        options.loggedIn === false
          ? fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) })
          : loggedInAuth(),
      buildsApi: createMemoryBuildsApi([savedBuild(1)]),
      sharesApi: api,
    })
    mounted = m
    await vi.waitFor(() => expect(m.builds.status).toBe('ready'))
    await vi.waitFor(() => expect(m.master.status).toBe('ready'))
    await flushPromises()
    return { ...m, api }
  }

  async function openDialog(): Promise<void> {
    await click(shareButton())
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
  }

  it('AC-1: 操作の行の先頭に「共有」を出し、aria-label は「<名前> を共有」', async () => {
    await open()
    const buttons = Array.from(document.querySelectorAll('[data-share-id]'))
    expect(buttons).toHaveLength(1)
    expect(shareButton().getAttribute('aria-label')).toBe('構成1 を共有')
    expect(textOf(shareButton())).toBe('共有')
    const row = shareButton().parentElement!
    expect(row.firstElementChild).toBe(shareButton())
  })

  it('AC-1: 押すと確認の段を開き、本文に名前を出して、フォーカスを「URL を作成」に置く', async () => {
    await open()
    await openDialog()
    expect(textOf(dialog())).toContain('構成を共有')
    expect(textOf(dialog())).toContain(
      '「構成1」の共有の URL を作ります。URL を知っている人は、ログインしなくてもこの構成を見られます。',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('URL を作成', dialog()!)))
  })

  it('AC-1: 「URL を作成」で構成の ID と共有の ID だけを送り、201 の文と共有の URL を出す', async () => {
    const { api } = await open()
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    expect(api.created).toHaveLength(1)
    expect(Object.keys(api.created[0] as object).sort()).toEqual(['buildId', 'id'])
    expect((api.created[0] as { buildId: string }).buildId).toBe(buildId(1))
    expect(textOf(dialog())).toContain('共有の URL を作りました。')
    expect(textOf(urlBox())).toBe(`${location.origin}/s/Fake00000001`)
    expect(textOf(dialog())).toContain('共有をやめるときは、「共有した構成」で取り消してください。')
    expect(toasts(mounted!)).toEqual([])
  })

  it('AC-1: URL の表示の段では、フォーカスを「URL をコピー」に置き、閉じると「共有」へ戻す', async () => {
    await open()
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('URL をコピー')))
    await click(findButton('閉じる', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(shareButton()))
  })

  it('AC-1: 作成の応答を待つあいだは「作成中…」にして、閉じる操作とキャンセルを止める', async () => {
    const { api } = await open()
    const release = api.hold('create')
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    expect(findButton('作成中…').disabled).toBe(true)
    expect(findButton('キャンセル').disabled).toBe(true)
    release()
    await flushPromises()
    expect(textOf(dialog())).toContain('共有の URL を作りました。')
  })

  it('AC-3: 有効な共有が既にあるときは、既存の URL と「すでに共有しています」の文を出す', async () => {
    const existing = savedShare(1, { buildId: buildId(1), shortId: 'Ab3dE6gH9jK2' })
    await open({ api: createMemorySharesApi([existing]) })
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    expect(textOf(dialog())).toContain(
      'この構成はすでに共有しています。前に作った URL を表示しています。',
    )
    expect(textOf(dialog())).toContain('取り消してから、もう一度共有してください。')
    expect(textOf(urlBox())).toBe(`${location.origin}/s/Ab3dE6gH9jK2`)
  })

  it('AC-1: 開き直すと確認の段から始まる', async () => {
    await open()
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await click(findButton('閉じる', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    await openDialog()
    expect(urlBox()).toBeNull()
    expect(findButton('URL を作成')).toBeDefined()
  })

  it('AC-1: 「URL をコピー」で URL を書き込み、トーストで知らせる', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    await open()
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await click(findButton('URL をコピー'))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/s/Fake00000001`)
    expect(toasts(mounted!)).toEqual(['URL をコピーしました。'])
  })

  it('AC-1: コピーに失敗したら、失敗のトーストを出して URL の文字を全選択する', async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })
    await open()
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await click(findButton('URL をコピー'))
    expect(toasts(mounted!)).toEqual([
      'URL をコピーできませんでした。URL を選択してコピーしてください。',
    ])
    expect(globalThis.getSelection()?.toString().trim()).toBe(`${location.origin}/s/Fake00000001`)
  })

  it('AC-4: 元の構成が無い（404）ときは、ダイアログを閉じてトーストで知らせ、h1 へフォーカスを移す', async () => {
    const api = createMemorySharesApi()
    api.setBuildExists(() => false)
    const m = await open({ api })
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(toasts(m)).toEqual([
      'この構成は別の端末で削除されていたため、共有しませんでした。一覧を読み直しました。',
    ])
    await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('h1')))
  })

  it('AC-4: ID の衝突（409）などの失敗は、確認の段のまま開いておき、押し直すと新しい ID で送る', async () => {
    const { api } = await open()
    api.failWith('create', { kind: 'conflict' })
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    expect(dialog()).not.toBeNull()
    expect(urlBox()).toBeNull()
    expect(toasts(mounted!)[0]).toContain('構成を共有できませんでした。')
    expect(toasts(mounted!)[0]).toContain('もう一度お試しください。')
    api.failWith('create', null)
    await click(findButton('URL を作成', dialog()!))
    expect(textOf(dialog())).toContain('共有の URL を作りました。')
    const [first, second] = api.created as { id: string }[]
    expect(first!.id).not.toBe(second!.id)
  })

  it('AC-12: 通信の失敗は原因を添えて知らせ、確認の段のまま開いておく', async () => {
    const { api } = await open()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    expect(toasts(mounted!)[0]).toContain('サーバーに接続できませんでした。')
    expect(body()).toContain('URL を作成')
  })

  it('AC-12: 401 ではダイアログを閉じ、期限切れを 1 回だけ知らせる', async () => {
    const { api } = await open()
    api.failWith('create', { kind: 'unauthorized' })
    await openDialog()
    await click(findButton('URL を作成', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(
      toasts(mounted!).filter((message) => message.startsWith('ログインの有効期限が切れました')),
    ).toHaveLength(1)
  })
})
