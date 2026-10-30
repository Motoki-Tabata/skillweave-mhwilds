import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BuildPayload } from '@/lib/api/builds'
import type { SharedBuild } from '@/lib/api/shares'
import { minimalPayload } from '../support/builds'
import { armorId, makeBuild, sk } from '../support/fixtures'
import type { FetchStubOptions } from '../support/fixtures'
import { createMemorySharesApi } from '../support/sharesApi'
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

const SHORT_ID = 'Ab3dE6gH9jK2'
const body = () => textOf(document.body)
const h1 = () => document.querySelector<HTMLElement>('h1')!
const h2 = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h2')).find((h) => textOf(h) === text)
const section = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h4'))
    .find((h) => textOf(h) === name)
    ?.closest('section') as HTMLElement
const info = (label: string): string => {
  const dt = Array.from(document.querySelectorAll('dt')).find((el) => textOf(el) === label)
  return textOf(dt?.nextElementSibling ?? null)
}

const solved = makeBuild()
const payload = (overrides: Partial<BuildPayload> = {}): BuildPayload =>
  minimalPayload({
    armor: { head: armorId('high', 'head'), chest: null, arms: null, waist: null, legs: null },
    decorations: solved.decorations,
    skills: solved.skills,
    freeSlots: solved.freeSlots,
    activeConditionIds: ['cd:weak_point'],
    ...overrides,
  })

function shared(overrides: Partial<SharedBuild> = {}): SharedBuild {
  return {
    name: '共有された名前',
    masterVersion: 'test-1',
    payload: payload(),
    schemaVersion: 1,
    createdAt: '2026-10-30T05:03:00Z',
    ...overrides,
  }
}

// 012 S7（共有された構成）AC-5・AC-6・AC-10
describe('SharedBuildView（S7 共有された構成）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  async function open(
    options: {
      api?: MemorySharesApi
      loggedIn?: boolean
      backend?: FetchStubOptions
      wait?: boolean
    } = {},
  ): Promise<Mounted & { api: MemorySharesApi }> {
    stubBackend(options.backend)
    const api = options.api ?? createMemorySharesApi()
    if (options.api === undefined) api.seedShared(SHORT_ID, shared())
    const m = await mountApp({
      path: `/s/${SHORT_ID}`,
      authApi:
        options.loggedIn === true
          ? loggedInAuth()
          : fakeAuthApi({
              fetchCurrentUser: async () => ({ kind: 'unauthenticated' }),
            }),
      sharesApi: api,
    })
    mounted = m
    if (options.wait !== false) {
      await vi.waitFor(() => expect(api.calls.view).toBeGreaterThan(0))
      await vi.waitFor(() => expect(m.master.status).not.toBe('loading'))
      await flushPromises()
    }
    return { ...m, api }
  }

  it('AC-5: 未ログインで、共有の名前を h1 に出し、構成の情報を出す', async () => {
    await open()
    expect(textOf(h1())).toBe('共有された名前')
    expect(body()).toContain('共有された構成です。共有したときの内容を表示しています。')
    expect(info('武器')).toBe('鉄の大剣')
    expect(info('発動条件')).toBe('有効部位への攻撃')
    expect(info('共有')).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
    expect(info('マスターの版')).toBe('test-1')
  })

  it('AC-5: 保存した構成の画面と同じ内容（火力・防具・装飾品・発動スキル・空きスロット・護石）を「構成の内容」で出す', async () => {
    await open()
    expect(h2('構成の内容')).toBeDefined()
    expect(textOf(section('火力'))).toContain('期待値')
    expect(textOf(section('防具'))).toContain('防御力の合計')
    expect(textOf(section('装飾品'))).toContain('攻撃珠【２】')
    expect(textOf(section('発動スキル'))).toContain('剛刃 Lv2')
    expect(textOf(section('空きスロット'))).toContain('武器')
    expect(textOf(section('護石'))).toContain('護石なし')
  })

  it('AC-5: 作成者の情報と操作（保存・共有・名前変更・削除）を出さない', async () => {
    await open()
    expect(document.querySelector('[data-save-index]')).toBeNull()
    for (const label of ['共有', '名前を変更', '削除', '保存']) {
      expect(
        Array.from(document.querySelectorAll('main button, main a')).some(
          (el) => textOf(el) === label,
        ),
      ).toBe(false)
    }
    expect(body()).not.toContain('保存した構成の一覧へ')
  })

  it('AC-5: 共有の護石の写しを使う（端末の護石の保存に無くても表示する）', async () => {
    const api = createMemorySharesApi()
    api.seedShared(
      SHORT_ID,
      shared({
        payload: payload({
          charm: {
            id: '01900000-0000-7000-8000-0000000000aa',
            payload: {
              rarity: 7,
              skills: [{ skillId: sk('a1'), level: 2 }],
              slots: [{ target: 'weapon', level: 1 }],
            },
          },
        }),
      }),
    )
    await open({ api })
    expect(textOf(section('護石'))).not.toContain('護石なし')
  })

  it('AC-5: ログイン中でも同じ表示にし、認証の判定を待たずに共有を読む', async () => {
    await open()
    const anonymous = textOf(document.querySelector('main') ?? document.body)
    mounted?.wrapper.unmount()
    mounted = null
    document.body.innerHTML = ''
    await open({ loggedIn: true })
    expect(textOf(document.querySelector('main') ?? document.body)).toBe(anonymous)
  })

  it('AC-5: 認証の判定が終わらなくても共有を読んで表示する', async () => {
    stubBackend()
    const api = createMemorySharesApi()
    api.seedShared(SHORT_ID, shared())
    const pending = fakeAuthApi({ fetchCurrentUser: () => new Promise(() => {}) })
    mounted = await mountApp({ path: `/s/${SHORT_ID}`, authApi: pending, sharesApi: api })
    await vi.waitFor(() => expect(textOf(h1())).toBe('共有された名前'))
  })

  it('AC-6: 版が同じなら警告を出さない', async () => {
    await open()
    expect(body()).not.toContain('作られたときと異なる場合があります')
  })

  it('AC-6: 版が違うとき、両方の版を示して異なる場合があることを知らせる', async () => {
    const api = createMemorySharesApi()
    api.seedShared(SHORT_ID, shared({ masterVersion: 'old-0' }))
    await open({ api })
    expect(body()).toContain(
      'この構成は、マスターデータの版 old-0 で作られています。いまの版は test-1 です。名前・防御力・火力などの表示が、作られたときと異なる場合があります。',
    )
    expect(info('マスターの版')).toBe('old-0')
  })

  it('AC-6: 現在のマスターに無い ID があっても画面を表示し、「不明な…」で出す', async () => {
    const api = createMemorySharesApi()
    api.seedShared(
      SHORT_ID,
      shared({
        masterVersion: 'old-0',
        payload: payload({
          weapon: { kind: 'master', weaponId: 'wp:gone' },
          armor: { head: 'ar:gone', chest: null, arms: null, waist: null, legs: null },
          activeConditionIds: ['cd:gone'],
        }),
      }),
    )
    await open({ api })
    expect(info('武器')).toBe('不明な武器（wp:gone）')
    expect(info('発動条件')).toBe('不明な発動条件（cd:gone）')
    expect(textOf(section('防具'))).toContain('不明な防具（ar:gone）')
  })

  it('AC-10: 取り消し済み・存在しない（404）ときは、見つからない旨と「装備検索へ」を出す', async () => {
    await open({ api: createMemorySharesApi() })
    expect(textOf(h1())).toBe('共有された構成が見つかりません')
    expect(body()).toContain(
      'この共有は、取り消されたか、URL が間違っています。共有した人に URL を確かめてください。',
    )
    const link = Array.from(document.querySelectorAll('a')).find((a) => textOf(a) === '装備検索へ')!
    expect(link.getAttribute('href')).toBe('/')
    expect(document.activeElement).toBe(document.body)
  })

  it('AC-10: 取得に失敗したときは読み込めなかった旨と原因・再読み込みを出し、再読み込みで表示に戻る', async () => {
    const api = createMemorySharesApi()
    api.seedShared(SHORT_ID, shared())
    api.failWith('view', { kind: 'failed', cause: 'network' })
    await open({ api })
    expect(textOf(h1())).toBe('共有された構成')
    expect(body()).toContain('共有された構成を読み込めません')
    expect(body()).toContain('サーバーに接続できませんでした。')
    expect(body()).toContain('通信の状態を確かめて、「再読み込み」を押してください。')
    api.failWith('view', null)
    await click(findButton('再読み込み'))
    await vi.waitFor(() => expect(textOf(h1())).toBe('共有された名前'))
    expect(api.calls.view).toBe(2)
  })

  it('AC-10: マスターを読めないときは、マスターの読込失敗の表示を出す', async () => {
    await open({ backend: { failMaster: true } })
    await vi.waitFor(() => expect(body()).toContain('データを読み込めませんでした'))
    expect(textOf(h1())).toBe('共有された構成')
  })

  it('AC-5: 読込が 300ms を超えたらスケルトンと読込中の文を出し、h1 は「共有された構成」にする', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const api = createMemorySharesApi()
    api.seedShared(SHORT_ID, shared())
    const release = api.hold('view')
    await open({ api, wait: false })
    expect(body()).not.toContain('共有された構成を読み込んでいます…')
    await vi.advanceTimersByTimeAsync(301)
    expect(body()).toContain('共有された構成を読み込んでいます…')
    expect(textOf(h1())).toBe('共有された構成')
    release()
    await vi.advanceTimersByTimeAsync(0)
  })

  it('AC-5: 別の短縮 ID へ移ると、その共有を読み直して表示する', async () => {
    const api = createMemorySharesApi()
    api.seedShared(SHORT_ID, shared())
    api.seedShared('Zz0000000000', shared({ name: '別の共有' }))
    const m = await open({ api })
    await m.wrapper.vm.$router.push('/s/Zz0000000000')
    await vi.waitFor(() => expect(textOf(h1())).toBe('別の共有'))
  })
})
