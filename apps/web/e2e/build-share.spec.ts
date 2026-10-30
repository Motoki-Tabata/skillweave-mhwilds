import { randomBytes } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { FIXED_TIME, type FakeBuild, json, mockApi } from './support/buildsApi'
import { loadMasterInfo } from './support/masterData'

const master = loadMasterInfo()

/** クライアント採番の UUIDv7（値の一意性だけに使う）。 */
function uuidV7(): string {
  const bytes = randomBytes(16)
  const ms = BigInt(Date.now())
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const PAYLOAD: FakeBuild['payload'] = {
  weapon: { kind: 'master', weaponId: master.plainWeaponId },
  armor: { head: null, chest: null, arms: null, waist: null, legs: null },
  charm: null,
  decorations: [],
  skills: [],
  freeSlots: [],
  activeConditionIds: [],
}

function seededBuild(name: string): FakeBuild {
  return {
    id: uuidV7(),
    name,
    masterVersion: master.version,
    payload: PAYLOAD,
    schemaVersion: 1,
    version: 0,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  }
}

interface FakeShare {
  id: string
  shortId: string
  buildId: string
  name: string
  createdAt: string
}

/** 共有の API を、テストの中のメモリ上の状態で差し替える。 */
async function mockSharesApi(
  page: Page,
  options: { builds?: FakeBuild[]; viewable?: Record<string, FakeBuild> } = {},
) {
  const builds = options.builds ?? []
  const state = {
    shares: [] as FakeShare[],
    posts: [] as unknown[],
  }
  await page.route('**/api/shares', (route) => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill(json(200, state.shares))
    const body = request.postDataJSON() as { id: string; buildId: string }
    state.posts.push(body)
    const source = builds.find((build) => build.id === body.buildId)
    if (source === undefined) return route.fulfill({ status: 404 })
    const share: FakeShare = {
      id: body.id,
      shortId: randomBytes(9).toString('base64url').slice(0, 12).replace(/[-_]/g, 'x'),
      buildId: source.id,
      name: source.name,
      createdAt: FIXED_TIME,
    }
    state.shares = [share, ...state.shares]
    return route.fulfill(json(201, share))
  })
  await page.route('**/api/shared-builds/*', (route) => {
    const shortId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    const build = options.viewable?.[shortId]
    if (build === undefined) {
      return route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 404 }),
      })
    }
    return route.fulfill(
      json(200, {
        name: build.name,
        masterVersion: build.masterVersion,
        payload: build.payload,
        schemaVersion: build.schemaVersion,
        createdAt: FIXED_TIME,
      }),
    )
  })
  return state
}

test.describe('012 build-share', () => {
  test('受入基準 1・8・15（1）: ログイン中に保存した構成から共有を作ると URL が出て、「共有した構成」の一覧に出る', async ({
    page,
  }) => {
    const build = seededBuild('e2e 共有する構成')
    await mockApi(page, { loggedIn: true, builds: [build] })
    const api = await mockSharesApi(page, { builds: [build] })

    await page.goto(`/builds/${build.id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: build.name, exact: true }),
    ).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: `${build.name} を共有`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '構成を共有' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'URL を作成', exact: true }).click()

    await expect(dialog.getByText('共有の URL', { exact: true })).toBeVisible()
    expect(api.posts).toHaveLength(1)
    const posted = api.posts[0] as Record<string, unknown>
    expect(posted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    // 構成の内容は要求に含めない
    expect(Object.keys(posted).sort()).toEqual(['buildId', 'id'])
    expect(posted.buildId).toBe(build.id)

    const created = api.shares[0]!
    await expect(dialog.locator('[data-share-url]')).toHaveText(
      new RegExp(`/s/${created.shortId}$`),
    )

    await dialog.getByRole('button', { name: '閉じる', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '共有した構成', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: '共有した構成', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: build.name, exact: true })).toHaveAttribute(
      'href',
      `/s/${created.shortId}`,
    )
    await expect(
      page.getByRole('button', { name: `${build.name} の共有を取り消す`, exact: true }),
    ).toBeVisible()
  })

  test('受入基準 5・15（2）: 未ログインで共有の URL を開くと、名前と構成のカードが出る', async ({
    page,
  }) => {
    const build = seededBuild('e2e 共有された構成')
    const shortId = 'Ab3dE6gH9jK2'
    await mockApi(page, { loggedIn: false })
    await mockSharesApi(page, { viewable: { [shortId]: build } })

    await page.goto(`/s/${shortId}`)

    await expect(
      page.getByRole('heading', { level: 1, name: build.name, exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { name: '構成の内容', exact: true })).toBeVisible()
  })

  test('受入基準 10・15（3）: 取り消し済みの共有を開くと、見つからない旨が出る', async ({
    page,
  }) => {
    await mockApi(page, { loggedIn: false })
    await mockSharesApi(page)

    await page.goto('/s/Zz9yX8wV7uT6')

    await expect(
      page.getByRole('heading', { level: 1, name: '共有された構成が見つかりません', exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { name: '構成の内容', exact: true })).toHaveCount(0)
  })
})
