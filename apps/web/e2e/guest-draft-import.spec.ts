import { expect, type Page, type Route, test } from '@playwright/test'
import { openCharms, registerCharm } from './support/charms'
import { openWeapons, registerWeapon } from './support/weapons'

const ME_URL = '**/api/auth/me'
const LOGOUT_URL = '**/api/auth/logout'
const CHARMS_URL = '**/api/charms'
const WEAPONS_URL = '**/api/weapons'
const FIXED_TIME = '2026-01-01T00:00:00Z'

interface FakeItem {
  id: string
  payload: unknown
  schemaVersion: number
  version: number
  createdAt: string
  updatedAt: string
}

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

/** /api/auth/** と /api/charms・/api/weapons を、テストの中のメモリ上の一覧で差し替える。 */
async function mockApi(page: Page) {
  const state = {
    loggedIn: false,
    charms: [] as FakeItem[],
    weapons: [] as FakeItem[],
    charmPosts: [] as string[],
    weaponPosts: [] as string[],
    /** true のあいだ、次の護石の POST を 400 にする（1回だけ） */
    rejectNextCharmPost: false,
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
  const handle =
    (list: FakeItem[], posts: string[], rejectOnce?: () => boolean) => (route: Route) => {
      const request = route.request()
      if (request.method() === 'GET') return route.fulfill(json(200, list))
      const body = request.postDataJSON() as Pick<FakeItem, 'id' | 'payload' | 'schemaVersion'>
      posts.push(body.id)
      if (rejectOnce?.()) {
        return route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 400 }),
        })
      }
      const item: FakeItem = { ...body, version: 0, createdAt: FIXED_TIME, updatedAt: FIXED_TIME }
      list.push(item)
      return route.fulfill(json(201, item))
    }
  await page.route(
    CHARMS_URL,
    handle(state.charms, state.charmPosts, () => {
      const reject = state.rejectNextCharmPost
      state.rejectNextCharmPost = false
      return reject
    }),
  )
  await page.route(WEAPONS_URL, handle(state.weapons, state.weaponPosts))
  return state
}

/** ログインしていない状態で端末に護石を登録し、ログイン済みに替えて読み直す。 */
async function seedCharmsThenLogin(
  page: Page,
  api: Awaited<ReturnType<typeof mockApi>>,
  rarities: number[],
): Promise<void> {
  await openCharms(page)
  for (const [index, rarity] of rarities.entries()) {
    await registerCharm(page, rarity)
    await expect(
      page.getByRole('heading', { name: `登録済みの護石（${index + 1}）` }),
    ).toBeVisible()
  }
  api.loggedIn = true
  await page.reload()
  await expect(page.getByText('保存先: アカウント', { exact: true })).toBeVisible({
    timeout: 60_000,
  })
}

function deviceBand(page: Page, noun: string, count: number) {
  return page.getByText(
    `この端末には、ログインしていないときに登録した${noun}が ${count} 件残っています。ログインしている間は表示せず、検索にも使いません。ログアウトすると、ふたたび表示します。`,
  )
}

async function confirmImport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'アカウントに取り込む', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取り込む', exact: true }).click()
}

test.describe('014 guest-draft-import', () => {
  test('AC-1, AC-3, AC-4, AC-9, AC-11, AC-13: 端末内の護石2件を取り込むと、アカウントの一覧に出て端末から消え、帯が消える', async ({
    page,
  }) => {
    const api = await mockApi(page)
    await seedCharmsThenLogin(page, api, [8, 7])
    await expect(deviceBand(page, '護石', 2)).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()

    await page.getByRole('button', { name: 'アカウントに取り込む', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(
      'この端末の護石 2 件を、ログイン中のアカウントに取り込みます。',
    )
    await dialog.getByRole('button', { name: '取り込む', exact: true }).click()

    await expect(
      page.getByText('護石を 2 件アカウントに取り込みました。', { exact: true }),
    ).toBeVisible()
    expect(api.charmPosts).toHaveLength(2)
    await expect(page.getByRole('heading', { name: '登録済みの護石（2）' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' }).first()).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'レア7' }).first()).toBeVisible()
    await expect(page.getByText(/この端末には、ログインしていないときに/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'アカウントに取り込む' })).toHaveCount(0)

    // 端末からは消えている（ログアウトすると端末の一覧が空）
    await page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(page.getByText('保存先: この端末', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()
  })

  test('AC-1, AC-3, AC-4, AC-9, AC-13: 端末内の武器1件を取り込むと、アカウントの一覧に出て帯が消える', async ({
    page,
  }) => {
    const api = await mockApi(page)
    await openWeapons(page)
    await registerWeapon(page, 200)
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible()
    api.loggedIn = true
    await page.reload()
    await expect(page.getByText('保存先: アカウント', { exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(deviceBand(page, '個体差のある武器', 1)).toBeVisible()

    await confirmImport(page)

    await expect(
      page.getByText('個体差のある武器を 1 件アカウントに取り込みました。', { exact: true }),
    ).toBeVisible()
    expect(api.weaponPosts).toHaveLength(1)
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: '攻撃力 200' }).first()).toBeVisible()
    await expect(page.getByText(/この端末には、ログインしていないときに/)).toHaveCount(0)
  })

  test('AC-2, AC-13: 確認を取り消すと、何も送らず、帯の件数も変わらない', async ({ page }) => {
    const api = await mockApi(page)
    await seedCharmsThenLogin(page, api, [8, 7])

    await page.getByRole('button', { name: 'アカウントに取り込む', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(deviceBand(page, '護石', 2)).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()
    expect(api.charmPosts).toHaveLength(0)
  })

  test('AC-6, AC-9, AC-13: 1件が 400 で拒否されると、その1件が端末に残り、取り込み直せる', async ({
    page,
  }) => {
    const api = await mockApi(page)
    await seedCharmsThenLogin(page, api, [8, 7])
    api.rejectNextCharmPost = true

    await confirmImport(page)

    await expect(
      page.getByText(
        '護石の取り込みが終わりました。取り込んだのは 1 件で、1 件はアカウントに保存できなかったため、この端末に残しています。',
        { exact: true },
      ),
    ).toBeVisible()
    expect(api.charmPosts).toHaveLength(2)
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    await expect(deviceBand(page, '護石', 1)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'アカウントに取り込む', exact: true }),
    ).toBeEnabled()
  })
})
