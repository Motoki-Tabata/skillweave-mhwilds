import { randomBytes } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { openCharms, registerCharm } from './support/charms'
import { loadMasterInfo } from './support/masterData'
import { searchButton, selectWeapon } from './support/search'

const master = loadMasterInfo()
const skill = master.kanjiArmorSkill()

const ME_URL = '**/api/auth/me'
const LOGOUT_URL = '**/api/auth/logout'
const CHARMS_URL = '**/api/charms'
const CHARM_URL = '**/api/charms/*'
const FIXED_TIME = '2026-01-01T00:00:00Z'

interface FakeCharm {
  id: string
  payload: {
    rarity: number
    skills: { skillId: string; level: number }[]
    slots: { target: 'weapon' | 'armor'; level: number }[]
  }
  schemaVersion: 1
  version: number
  createdAt: string
  updatedAt: string
}

/** クライアント採番の UUIDv7（時刻はテストごとに固定でなく現在時刻だが、値の一意性だけに使う）。 */
function uuidV7(): string {
  const bytes = randomBytes(16)
  const ms = BigInt(Date.now())
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

/** /api/auth/** と /api/charms/** を、テストの中のメモリ上の状態で差し替える。 */
async function mockApi(page: Page, initial: { loggedIn: boolean; charms?: FakeCharm[] }) {
  const state = {
    loggedIn: initial.loggedIn,
    charms: [...(initial.charms ?? [])],
    /** true のあいだ、PUT は 409 を返す */
    conflictOnPut: false,
    /** PUT が 409 を返すときに、サーバー側で行う変更 */
    onConflict: undefined as undefined | (() => void),
    listCalls: 0,
    posts: [] as { id: string }[],
  }
  await page.route(ME_URL, (route) =>
    state.loggedIn
      ? route.fulfill(json(200, { displayName: 'モンハン太郎' }))
      : route.fulfill({ status: 401 }),
  )
  await page.route(LOGOUT_URL, (route) => {
    state.loggedIn = false
    return route.fulfill({ status: 204 })
  })
  await page.route(CHARMS_URL, (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      state.listCalls++
      return route.fulfill(json(200, state.charms))
    }
    const body = request.postDataJSON() as Pick<FakeCharm, 'id' | 'payload' | 'schemaVersion'>
    const charm: FakeCharm = {
      ...body,
      version: 0,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    }
    state.posts.push({ id: body.id })
    state.charms.push(charm)
    return route.fulfill(json(201, charm))
  })
  await page.route(CHARM_URL, (route) => {
    if (route.request().method() === 'PUT' && state.conflictOnPut) {
      state.onConflict?.()
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 409 }),
      })
    }
    return route.fulfill({ status: 500 })
  })
  return state
}

function accountCharm(rarity: number): FakeCharm {
  return {
    id: uuidV7(),
    payload: {
      rarity,
      skills: [{ skillId: skill.id, level: 1 }],
      slots: [{ target: 'armor', level: 3 }],
    },
    schemaVersion: 1,
    version: 0,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  }
}

test.describe('010 charm-save', () => {
  test('受入基準 15（1, 2）: ログイン中に護石を登録すると、サーバーに送られて一覧に出て、検索の候補と構成カードに使われる', async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: true })
    await openCharms(page)
    await expect(page.getByText('保存先: アカウント', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()

    await registerCharm(page)

    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    const item = page.getByRole('listitem').filter({ hasText: 'レア8' }).first()
    await expect(item).toContainText(`${skill.name} Lv1`)
    expect(api.posts).toHaveLength(1)
    expect(api.posts[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    // ナビで検索画面へ行き、アカウントの護石が候補になる
    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '装備検索', exact: true })
      .click()
    await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/候補にする鑑定護石:\s*1\s*件/)).toBeVisible()

    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await page.getByRole('radio', { name: '空きスロットの最大化' }).click()
    await searchButton(page).click()

    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    const charm = card
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '護石' }) })
    await expect(charm.getByText('護石なし')).toHaveCount(0)
    await expect(charm).toContainText(`${skill.name} Lv1`)
  })

  test('受入基準 15（3, 4）: 端末に護石を残してログインすると帯が出て、ログアウトで URL が変わらずに端末の護石に切り替わる', async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: false, charms: [accountCharm(7)] })
    await openCharms(page)
    await expect(page.getByText('保存先: この端末', { exact: true })).toBeVisible()
    await registerCharm(page)
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    // 未ログインのあいだは、サーバーに送らない
    expect(api.posts).toHaveLength(0)

    // ログイン済みに替えて読み直す
    api.loggedIn = true
    await page.reload()
    await expect(page.getByText('保存先: アカウント', { exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByText(
        'この端末には、ログインしていないときに登録した護石が 1 件残っています。ログインしている間は表示せず、検索にも使いません。ログアウトすると、ふたたび表示します。',
      ),
    ).toBeVisible()
    // 一覧はアカウントの護石（レア7）だけで、端末内のレア8は出ない
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア7' }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' })).toHaveCount(0)

    const url = page.url()
    await page.getByRole('button', { name: 'ログアウト' }).click()

    await expect(page.getByText('保存先: この端末', { exact: true })).toBeVisible()
    await expect(page.getByText(/この端末には、ログインしていないときに/)).toHaveCount(0)
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア7' })).toHaveCount(0)
    expect(page.url()).toBe(url)
  })

  test('受入基準 15（8）: 更新が 409 のとき、トーストを出して一覧を読み直す', async ({ page }) => {
    const seeded = accountCharm(8)
    const api = await mockApi(page, { loggedIn: true, charms: [seeded] })
    await openCharms(page)
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' }).first()).toBeVisible()

    // 別の端末が先に変更した状態を、409 の応答と同時にサーバー側へ作る
    api.conflictOnPut = true
    api.onConflict = () => {
      api.charms = [{ ...seeded, payload: { ...seeded.payload, rarity: 6 }, version: 1 }]
    }
    const callsBefore = api.listCalls

    await page
      .getByRole('button', { name: /を編集$/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: '護石を編集' })).toBeVisible()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(
      page.getByText(
        'この護石は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。',
        { exact: true },
      ),
    ).toBeVisible()
    // 読み直した一覧（サーバー側で変わった内容）が出る
    await expect(page.getByRole('listitem').filter({ hasText: 'レア6' }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' })).toHaveCount(0)
    expect(api.listCalls).toBeGreaterThan(callsBefore)
    await expect(page.getByRole('heading', { name: '護石を登録' })).toBeVisible()
  })
})
