import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BuildPayload } from '@/lib/api/builds'
import { useToastStore } from '@/stores/toast'
import { buildId, minimalPayload, savedBuild } from '../support/builds'
import { createMemoryBuildsApi } from '../support/buildsApi'
import type { MemoryBuildsApi } from '../support/buildsApi'
import { armorId, makeBuild, makeBundle, makeDictionary, sk } from '../support/fixtures'
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
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)
const h1 = () => document.querySelector<HTMLElement>('h1')!
const renameButton = () => document.querySelector<HTMLButtonElement>('[data-rename-id]')!
const deleteButton = () => document.querySelector<HTMLButtonElement>('[data-delete-id]')!
const confirmButton = () =>
  findButton('削除', document.querySelector<HTMLElement>('[role="alertdialog"]')!)
const dialogInput = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!
const card = () => h2('構成の内容')?.closest('div.flex')?.parentElement as HTMLElement
function h2(text: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('h2')).find((h) => textOf(h) === text)
}
const section = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h4'))
    .find((h) => textOf(h) === name)
    ?.closest('section') as HTMLElement

/** 構成の情報（dl）の項目名から値を引く。 */
const info = (label: string): string => {
  const dt = Array.from(document.querySelectorAll('dt')).find((el) => textOf(el) === label)
  return textOf(dt?.nextElementSibling ?? null)
}

const solved = makeBuild()
const fullPayload = (overrides: Partial<BuildPayload> = {}): BuildPayload =>
  minimalPayload({
    armor: { head: armorId('high', 'head'), chest: null, arms: null, waist: null, legs: null },
    decorations: solved.decorations,
    skills: solved.skills,
    freeSlots: solved.freeSlots,
    activeConditionIds: ['cd:weak_point'],
    ...overrides,
  })

describe('BuildView（S5 保存した構成）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function open(
    options: { api?: MemoryBuildsApi; id?: string; loggedIn?: boolean; crafted?: boolean } = {},
  ): Promise<Mounted & { api: MemoryBuildsApi }> {
    if (options.crafted === true) {
      stubBackend({
        bundle: makeBundle({ craftedCharms: true }),
        dictionary: makeDictionary({ craftedCharms: true }),
      })
    } else {
      stubBackend()
    }
    const api = options.api ?? createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
    const authApi =
      options.loggedIn === false
        ? fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) })
        : loggedInAuth()
    const m = await mountApp({
      path: `/builds/${options.id ?? buildId(1)}`,
      authApi,
      buildsApi: api,
    })
    mounted = m
    await vi.waitFor(() => expect(m.builds.status).not.toBe('loading'))
    await vi.waitFor(() => expect(m.master.status).toBe('ready'))
    await flushPromises()
    return { ...m, api }
  }

  // AC-4
  describe('表示', () => {
    it('AC-4: h1 に名前を出し、構成の情報（武器・発動条件・保存・マスターの版）を出す', async () => {
      await open()
      expect(textOf(h1())).toBe('構成1')
      expect(info('武器')).toBe('鉄の大剣')
      expect(info('発動条件')).toBe('有効部位への攻撃')
      expect(info('保存')).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
      expect(info('マスターの版')).toBe('test-1')
    })

    it('AC-4: 検索結果のカードと同じ内容（火力・防具・装飾品・発動スキル・空きスロット）を「構成の内容」の見出しで出す', async () => {
      await open()
      expect(h2('構成の内容')).toBeDefined()
      expect(textOf(section('火力'))).toContain('期待値')
      expect(textOf(section('防具'))).toContain('防御力の合計')
      expect(textOf(section('装飾品'))).toContain('攻撃珠【２】')
      expect(textOf(section('発動スキル'))).toContain('攻撃 Lv1')
      expect(textOf(section('発動スキル'))).toContain('剛刃 Lv2')
      expect(textOf(section('空きスロット'))).toContain('武器')
      // 護石を使わない構成は節を出して「護石なし」
      expect(textOf(section('護石'))).toContain('護石なし')
    })

    it('AC-4: 「保存」のボタンは出さない', async () => {
      await open()
      expect(document.querySelector('[data-save-index]')).toBeNull()
    })

    it('AC-4: 護石は保存した写しを使う（護石の端末内の保存に無くても表示する）', async () => {
      const charmId = '01900000-0000-7000-8000-0000000000aa'
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({
            charm: {
              id: charmId,
              payload: {
                rarity: 7,
                skills: [{ skillId: sk('a1'), level: 2 }],
                slots: [{ target: 'weapon', level: 1 }],
              },
            },
          }),
        }),
      ])
      const m = await open({ api })
      expect(m.charms.charms).toHaveLength(0)
      const text = textOf(section('護石'))
      expect(text).toContain('7')
      expect(text).toContain('攻撃 Lv2')
      expect(text).toContain('Lv1')
    })

    it('027 AC-7: 生産護石の形は、開いたときのマスターから名前・レア度・スキル・スロットを引く', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({ charm: { kind: 'crafted', charmId: 'ch:-1:2' } }),
        }),
      ])
      await open({ api, crafted: true })
      const text = textOf(section('護石'))
      expect(text).toContain('名前攻撃の護石Ⅱ')
      expect(text).toContain('レア度7')
      expect(text).toContain('攻撃 Lv2')
      expect(text).toContain('武器用 Lv1')
    })

    it('027 AC-8: マスターに無い生産護石は「不明な護石（<ID>）」と「−」を出し、ほかの内容は出す', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({ charm: { kind: 'crafted', charmId: 'ch:-9:3' } }),
        }),
      ])
      await open({ api, crafted: true })
      const text = textOf(section('護石'))
      expect(text).toContain('名前不明な護石（ch:-9:3）')
      expect(text).toContain('レア度−')
      expect(text).toContain('スキル−')
      expect(text).toContain('スロット−')
      expect(text).not.toContain('スキルなし')
      expect(text).not.toContain('スロットなし')
      expect(textOf(section('火力'))).toContain('期待値')
      expect(textOf(section('防具'))).toContain('防御力の合計')
      expect(textOf(section('装飾品'))).toContain('攻撃珠【２】')
      expect(textOf(section('発動スキル'))).toContain('攻撃 Lv1')
      expect(textOf(section('空きスロット'))).toContain('武器')
    })

    it('027 AC-4: 護石なしと鑑定護石の表示は変わらない（「名前」の行を出さない）', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({
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
      ])
      await open({ api, crafted: true })
      const text = textOf(section('護石'))
      expect(text).toContain('攻撃 Lv2')
      expect(text).not.toContain('名前')
    })

    it('AC-4: 個体差のある武器は写しの名前に「（個体差）」を付け、写しのスロットと攻撃力で火力を出す', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({
            weapon: {
              kind: 'custom',
              id: '01900000-0000-7000-8000-0000000000bb',
              payload: {
                baseWeaponId: 'wp:great-sword:1',
                name: '自作の大剣',
                attack: 300,
                affinity: 10,
                slots: [{ target: 'weapon', level: 2 }],
                seriesBonusId: null,
                groupBonusId: null,
              },
            },
          }),
        }),
      ])
      await open({ api })
      expect(info('武器')).toBe('自作の大剣（個体差）')
      expect(textOf(section('火力'))).toContain('攻撃力303.0')
      expect(textOf(section('空きスロット'))).toContain('Lv2')
    })

    it('AC-4: 保存した発動スキル・空きスロットをそのまま使う（再計算しない）', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({
            skills: [{ skillId: sk('a2'), level: 3, rawLevel: 3 }],
            freeSlots: [{ owner: 'head', index: 0 }],
          }),
        }),
      ])
      await open({ api })
      expect(textOf(section('発動スキル'))).toContain('ガード Lv3')
      expect(textOf(section('空きスロット'))).toContain('頭')
    })
  })

  // AC-5
  describe('マスターの版・無い ID', () => {
    it('AC-5: 版が同じなら警告を出さない', async () => {
      await open()
      expect(body()).not.toContain('保存したときと異なる場合があります')
    })

    it('AC-5: 版が違うとき、保存した版と現在の版を示して異なる場合があることを知らせる', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, { masterVersion: 'old-0', payload: fullPayload() }),
      ])
      await open({ api })
      expect(body()).toContain(
        'この構成は、マスターデータの版 old-0 で保存しました。いまの版は test-1 です。名前・防御力・火力などの表示が、保存したときと異なる場合があります。',
      )
      // 移行・再計算はしない: 保存した値のまま表示する
      expect(info('マスターの版')).toBe('old-0')
    })

    it('AC-5: 現在のマスターに無い ID があっても画面を表示し、「不明な…」で出す', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          masterVersion: 'old-0',
          payload: fullPayload({
            weapon: { kind: 'master', weaponId: 'wp:gone' },
            armor: { head: 'ar:gone', chest: null, arms: null, waist: null, legs: null },
            decorations: [{ slot: { owner: 'head', index: 0 }, decorationId: 'dc:gone' }],
            skills: [
              { skillId: 'sk:gone', level: 2, rawLevel: 2 },
              { skillId: sk('a1'), level: 1, rawLevel: 1 },
            ],
            freeSlots: [{ owner: 'weapon', index: 0 }],
            activeConditionIds: ['cd:gone'],
          }),
        }),
      ])
      await open({ api })
      expect(info('武器')).toBe('不明な武器（wp:gone）')
      expect(info('発動条件')).toBe('不明な発動条件（cd:gone）')
      expect(textOf(section('防具'))).toContain('不明な防具（ar:gone）')
      expect(textOf(section('防具'))).toContain('防御力の合計0')
      const armorRow = section('防具').querySelector('tbody tr')!
      expect(textOf(armorRow.querySelectorAll('td')[2])).toBe('−')
      expect(textOf(section('装飾品'))).toContain('不明な装飾品（dc:gone）')
      expect(textOf(section('装飾品'))).toContain('−')
      expect(textOf(section('発動スキル'))).toContain('不明')
      expect(textOf(section('発動スキル'))).toContain('不明なスキル（sk:gone） Lv2')
      expect(textOf(section('火力'))).toBe(
        '火力武器が現在のマスターに無いため、火力を計算できません。',
      )
      // 見出しの行の期待値は出さない
      expect(textOf(card())).not.toContain('期待値')
    })

    it('AC-5: スキルの効果の一覧には、現在のマスターに無いスキルを出さない', async () => {
      const api = createMemoryBuildsApi([
        savedBuild(1, {
          payload: fullPayload({
            skills: [
              { skillId: 'sk:gone', level: 2, rawLevel: 2 },
              { skillId: sk('a1'), level: 1, rawLevel: 1 },
            ],
          }),
        }),
      ])
      await open({ api })
      await click(findButton('スキルの効果を表示（1）'))
      const effects = document.querySelector('dl[id]')!
      expect(textOf(effects)).toContain('攻撃')
      expect(textOf(effects)).not.toContain('sk:gone')
    })
  })

  // 見つからない・ログインが必要
  describe('状態', () => {
    it('一覧に無い ID は「構成が見つかりません」と本文を出し、一覧へのリンクを残す', async () => {
      await open({ id: buildId(99) })
      expect(textOf(h1())).toBe('構成が見つかりません')
      expect(body()).toContain('この構成は、削除されたか、別のアカウントで保存されたものです。')
      const back = Array.from(document.querySelectorAll('a')).find(
        (a) => textOf(a) === '保存した構成の一覧へ',
      )
      expect(back?.getAttribute('href')).toBe('/builds')
    })

    it('AC-2: 未ログインではログインが必要の表示を出し、戻り先は今の構成の URL にする', async () => {
      await open({ loggedIn: false })
      expect(body()).toContain('ログインが必要です')
      const link = Array.from(document.querySelectorAll('a')).find(
        (a) => textOf(a) === 'Discord でログイン' && !a.closest('header'),
      )!
      link.addEventListener('click', (event) => event.preventDefault())
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(sessionStorage.getItem('swv-login-return')).toBe(`/builds/${buildId(1)}`)
      sessionStorage.clear()
    })

    it('AC-12: 一覧を取得できないときは読込失敗と再読み込みを出す', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      api.failWith('list', { kind: 'failed', cause: 'server' })
      await open({ api })
      expect(body()).toContain('保存した構成を読み込めません')
      api.failWith('list', null)
      await click(findButton('再読み込み'))
      expect(textOf(h1())).toBe('構成1')
    })
  })

  // AC-6 / AC-9 / AC-12
  describe('名前の変更と削除', () => {
    it('AC-6: 名前を変更すると h1 が保存後の名前になり、「名前を変更」へフォーカスが戻る', async () => {
      const m = await open()
      await click(renameButton())
      await typeInto(dialogInput(), '新しい名前')
      await click(findButton('保存'))
      expect(textOf(h1())).toBe('新しい名前')
      expect(toasts(m)).toContain('名前を変更しました。')
      await vi.waitFor(() => expect(document.activeElement).toBe(renameButton()))
    })

    it('AC-9: 409 では別の端末で変更されたと知らせ、読み直して h1 へフォーカスを移す', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      const m = await open({ api })
      await click(renameButton())
      api.seed(savedBuild(1, { name: '他端末', version: 4, payload: fullPayload() }))
      await typeInto(dialogInput(), '自分')
      await click(findButton('保存'))
      expect(toasts(m).some((t) => t.includes('別の端末で変更されていたため'))).toBe(true)
      expect(textOf(h1())).toBe('他端末')
      await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
    })

    it('AC-9: 404 では別の端末で削除されたと知らせ、「見つかりません」になる', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      const m = await open({ api })
      await click(renameButton())
      api.drop(buildId(1))
      await typeInto(dialogInput(), '自分')
      await click(findButton('保存'))
      expect(toasts(m).some((t) => t.includes('別の端末で削除されていたため'))).toBe(true)
      expect(textOf(h1())).toBe('構成が見つかりません')
      await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
    })

    it('AC-6: 削除すると一覧へ移り、一覧の h1 にフォーカスを置く', async () => {
      const m = await open()
      await click(deleteButton())
      await click(confirmButton())
      await vi.waitFor(() => expect(m.wrapper.vm.$route.path).toBe('/builds'))
      await vi.waitFor(() => expect(document.activeElement).toBe(h1()))
      expect(textOf(h1())).toBe('保存した構成')
      expect(toasts(m)).toContain('構成を削除しました。')
    })

    it('AC-6: 削除の応答を待つあいだ、操作の行の 2 つを無効にして「削除中…」にする', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      await open({ api })
      const release = api.hold('remove')
      await click(deleteButton())
      await click(confirmButton())
      expect(deleteButton().textContent?.trim()).toBe('削除中…')
      expect(deleteButton().disabled).toBe(true)
      expect(renameButton().disabled).toBe(true)
      release()
      await flushPromises()
    })

    it('AC-12: 削除の失敗はトーストで知らせ、操作の行を元に戻して画面に残る', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      const m = await open({ api })
      api.failWith('remove', { kind: 'failed', cause: 'network' })
      await click(deleteButton())
      await click(confirmButton())
      expect(toasts(m)).toContain(
        '構成を削除できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      )
      expect(textOf(h1())).toBe('構成1')
      expect(deleteButton().disabled).toBe(false)
      expect(deleteButton().textContent?.trim()).toBe('削除')
    })

    it('AC-12: 401 ではダイアログを閉じ、ログインが必要の表示に替えて期限切れを 1 回だけ知らせる', async () => {
      const api = createMemoryBuildsApi([savedBuild(1, { payload: fullPayload() })])
      const m = await open({ api })
      await click(renameButton())
      api.failWith('rename', { kind: 'unauthorized' })
      await typeInto(dialogInput(), '名前')
      await click(findButton('保存'))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(body()).toContain('ログインが必要です')
      expect(toasts(m).filter((t) => t.startsWith('ログインの有効期限'))).toHaveLength(1)
    })
  })
})
