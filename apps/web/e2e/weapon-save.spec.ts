import { expect, type Page, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'

const master = loadMasterInfo()
const artiaName = master.artiaWeaponName()

const ME_URL = '**/api/auth/me'
const LOGOUT_URL = '**/api/auth/logout'
const CHARMS_URL = '**/api/charms'
const WEAPONS_URL = '**/api/weapons'
const WEAPON_URL = '**/api/weapons/*'
const FIXED_TIME = '2026-01-01T00:00:00Z'

interface FakeWeapon {
  id: string
  payload: { attack: number } & Record<string, unknown>
  schemaVersion: 1
  version: number
  createdAt: string
  updatedAt: string
}

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

/** /api/auth/**・/api/weapons/** をテストの中のメモリ上の状態で差し替える。護石は空の一覧を返す。 */
async function mockApi(page: Page) {
  const state = {
    loggedIn: true,
    weapons: [] as FakeWeapon[],
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
  await page.route(CHARMS_URL, (route) => route.fulfill(json(200, [])))
  await page.route(WEAPONS_URL, (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      state.listCalls++
      return route.fulfill(json(200, state.weapons))
    }
    const body = request.postDataJSON() as Pick<FakeWeapon, 'id' | 'payload' | 'schemaVersion'>
    const weapon: FakeWeapon = {
      ...body,
      version: 0,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    }
    state.posts.push({ id: body.id })
    state.weapons.push(weapon)
    return route.fulfill(json(201, weapon))
  })
  await page.route(WEAPON_URL, (route) => {
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

async function openWeapons(page: Page): Promise<void> {
  await page.goto('/weapons')
  await expect(page.getByRole('heading', { level: 1, name: '個体差のある武器' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: '武器を登録' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^登録済みの武器（\d+）$/ })).toBeVisible()
}

/** 基の武器・攻撃力・会心率を入れて登録する。 */
async function registerWeapon(page: Page, attack: number): Promise<void> {
  await page.getByRole('combobox', { name: /^基の武器/ }).click()
  await page.getByRole('option', { name: artiaName, exact: true }).click()
  await page.getByRole('textbox', { name: /^攻撃力/ }).fill(String(attack))
  await page.getByRole('textbox', { name: /^会心率/ }).fill('15')
  await page.getByRole('button', { name: '登録', exact: true }).click()
  await expect(page.getByText('個体差のある武器を登録しました。', { exact: true })).toBeVisible()
}

test.describe('013 weapon-save', () => {
  test('受入基準 15（1, 2, 3, 5）: ログイン中に武器を登録すると一覧と検索の選択肢に出て、選んだままログアウトすると選択が外れて端末内の武器に切り替わる', async ({
    page,
  }) => {
    const api = await mockApi(page)
    await openWeapons(page)
    await expect(page.getByText('保存先: アカウント', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの武器（0）' })).toBeVisible()

    await registerWeapon(page, 200)

    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible()
    const item = page.getByRole('listitem').filter({ hasText: '攻撃力 200' }).first()
    await expect(item).toContainText(artiaName)
    expect(api.posts).toHaveLength(1)
    expect(api.posts[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    // 検索画面の武器を選ぶダイアログに、アカウントの武器が出て選べる
    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '装備検索', exact: true })
      .click()
    await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '武器を選択' }).click()
    const dialog = page.getByRole('dialog', { name: '武器を選択' })
    await expect(dialog.getByRole('heading', { name: '個体差のある武器（1）' })).toBeVisible()
    await dialog.getByRole('button', { name: /個体差/ }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('個体差', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '武器を選択' })).toHaveCount(0)

    // 選んだままログアウトすると、URL が変わらずに選択が外れる
    const url = page.url()
    await page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(page.getByRole('link', { name: 'Discord でログイン' })).toBeVisible()
    await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible()
    expect(page.url()).toBe(url)

    // 武器の画面は端末内の武器（空）に切り替わる
    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '個体差のある武器', exact: true })
      .click()
    await expect(page.getByText('保存先: この端末', { exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('heading', { name: '登録済みの武器（0）' })).toBeVisible()
  })

  test('受入基準 15（8）: 更新が 409 のとき、トーストを出して一覧を読み直す', async ({ page }) => {
    const api = await mockApi(page)
    await openWeapons(page)
    await registerWeapon(page, 200)
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible()

    // 別の端末が先に変更した状態を、409 の応答と同時にサーバー側へ作る
    api.conflictOnPut = true
    api.onConflict = () => {
      api.weapons = api.weapons.map((w) => ({
        ...w,
        payload: { ...w.payload, attack: 300 },
        version: 1,
      }))
    }
    const callsBefore = api.listCalls

    await page
      .getByRole('button', { name: /を編集$/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: '武器を編集' })).toBeVisible()
    await page.getByRole('button', { name: '保存', exact: true }).click()

    await expect(
      page.getByText(
        'この個体差のある武器は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。',
        { exact: true },
      ),
    ).toBeVisible()
    // 読み直した一覧（サーバー側で変わった内容）が出る
    await expect(page.getByRole('listitem').filter({ hasText: '攻撃力 300' }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: '攻撃力 200' })).toHaveCount(0)
    expect(api.listCalls).toBeGreaterThan(callsBefore)
    await expect(page.getByRole('heading', { name: '武器を登録' })).toBeVisible()
  })
})
