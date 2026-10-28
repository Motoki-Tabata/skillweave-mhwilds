import { randomBytes } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { openSearch, searchButton, selectWeapon } from './support/search'

const master = loadMasterInfo()

const ME_URL = '**/api/auth/me'
const BUILDS_URL = '**/api/builds'
const BUILD_URL = '**/api/builds/*'
const FIXED_TIME = '2026-01-01T00:00:00Z'
const OLD_VERSION = '0.0.1-e2e-old'

interface FakeBuild {
  id: string
  name: string
  masterVersion: string
  payload: {
    weapon: { kind: 'master'; weaponId: string }
    armor: Record<'head' | 'chest' | 'arms' | 'waist' | 'legs', string | null>
    charm: null
    decorations: []
    skills: []
    freeSlots: []
    activeConditionIds: string[]
  }
  schemaVersion: 1
  version: number
  createdAt: string
  updatedAt: string
}

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

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

function seededBuild(name: string, masterVersion: string): FakeBuild {
  return {
    id: uuidV7(),
    name,
    masterVersion,
    payload: {
      weapon: { kind: 'master', weaponId: master.plainWeaponId },
      armor: { head: null, chest: null, arms: null, waist: null, legs: null },
      charm: null,
      decorations: [],
      skills: [],
      freeSlots: [],
      activeConditionIds: [],
    },
    schemaVersion: 1,
    version: 0,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  }
}

/** /api/auth/me と /api/builds/** を、テストの中のメモリ上の状態で差し替える。 */
async function mockApi(page: Page, initial: { loggedIn: boolean; builds?: FakeBuild[] }) {
  const state = {
    loggedIn: initial.loggedIn,
    builds: [...(initial.builds ?? [])],
    /** true のあいだ、PATCH は 409 を返す */
    conflictOnPatch: false,
    /** PATCH が 409 を返すときに、サーバー側で行う変更 */
    onConflict: undefined as undefined | (() => void),
    listCalls: 0,
    posts: [] as FakeBuild[],
  }
  await page.route(ME_URL, (route) =>
    state.loggedIn
      ? route.fulfill(json(200, { displayName: 'モンハン太郎' }))
      : route.fulfill({ status: 401 }),
  )
  await page.route(BUILDS_URL, (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      state.listCalls++
      return route.fulfill(json(200, state.builds))
    }
    const body = request.postDataJSON() as Pick<
      FakeBuild,
      'id' | 'name' | 'masterVersion' | 'payload' | 'schemaVersion'
    >
    const build: FakeBuild = { ...body, version: 0, createdAt: FIXED_TIME, updatedAt: FIXED_TIME }
    state.posts.push(build)
    state.builds = [build, ...state.builds]
    return route.fulfill(json(201, build))
  })
  await page.route(BUILD_URL, (route) => {
    if (route.request().method() === 'PATCH' && state.conflictOnPatch) {
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

async function openBuilds(page: Page): Promise<void> {
  await page.goto('/builds')
  await expect(
    page.getByRole('heading', { level: 1, name: '保存した構成', exact: true }),
  ).toBeVisible({ timeout: 60_000 })
}

/** 武器を選んで検索し、結果の構成が出るまで待つ。 */
async function searchPlainWeapon(page: Page): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(master.plainWeaponId))
  await page.getByRole('radio', { name: '空きスロットの最大化' }).click()
  await searchButton(page).click()
  await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
}

test.describe('011 build-save', () => {
  test('受入基準 1・15（1）: ログイン中に検索結果の構成を保存すると、POST され、一覧に出て、名前から構成のカードを開ける', async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: true })
    await searchPlainWeapon(page)

    await page.getByRole('button', { name: '構成 1 を保存', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '構成を保存' })
    await expect(dialog).toBeVisible()
    const name = 'e2e 保存した構成'
    await dialog.getByRole('textbox', { name: /名前/ }).fill(name)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()

    await expect(
      page.getByText(`「${name}」を保存しました。「保存した構成」から開けます。`, { exact: true }),
    ).toBeVisible()
    expect(api.posts).toHaveLength(1)
    const posted = api.posts[0]!
    expect(posted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(posted.name).toBe(name)
    expect(posted.masterVersion).toBe(master.version)
    expect(posted.payload.weapon).toEqual({ kind: 'master', weaponId: master.plainWeaponId })

    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '保存した構成', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: /^保存した構成（1）$/ })).toBeVisible({
      timeout: 60_000,
    })
    await page.getByRole('link', { name, exact: true }).click()

    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '構成の内容', exact: true })).toBeVisible()
    // 版が同じなので警告は出ない
    await expect(page.getByText(/で保存しました。いまの版は/)).toHaveCount(0)
  })

  test('受入基準 5・15（2）: マスターの版が違う構成を開くと、両方の版を示す警告が出る', async ({
    page,
  }) => {
    const build = seededBuild('e2e 古い版の構成', OLD_VERSION)
    await mockApi(page, { loggedIn: true, builds: [build] })
    await page.goto(`/builds/${build.id}`)

    await expect(
      page.getByRole('heading', { level: 1, name: build.name, exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText(
        `この構成は、マスターデータの版 ${OLD_VERSION} で保存しました。いまの版は ${master.version} です。名前・防御力・火力などの表示が、保存したときと異なる場合があります。`,
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: '構成の内容', exact: true })).toBeVisible()
  })

  test('受入基準 9・15（3）: 名前の変更が 409 のとき、トーストを出して一覧を読み直す', async ({
    page,
  }) => {
    const seeded = seededBuild('e2e 変更前の名前', master.version)
    const api = await mockApi(page, { loggedIn: true, builds: [seeded] })
    await openBuilds(page)
    await expect(page.getByRole('link', { name: seeded.name, exact: true })).toBeVisible({
      timeout: 60_000,
    })

    // 別の端末が先に名前を変えた状態を、409 の応答と同時にサーバー側へ作る
    const serverName = 'e2e 別の端末で変えた名前'
    api.conflictOnPatch = true
    api.onConflict = () => {
      api.builds = [{ ...seeded, name: serverName, version: 1 }]
    }
    const callsBefore = api.listCalls

    await page.getByRole('button', { name: `${seeded.name} の名前を変更`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '名前を変更' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: /名前/ }).fill('e2e 新しい名前')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()

    await expect(
      page.getByText(
        'この構成は別の端末で変更されていたため、名前を変更しませんでした。一覧を読み直しました。内容を確かめて、もう一度お試しください。',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: serverName, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: seeded.name, exact: true })).toHaveCount(0)
    expect(api.listCalls).toBeGreaterThan(callsBefore)
  })

  test('受入基準 2・15（4）: 未ログインでは「保存」でログインが必要のダイアログが出て、POST されない', async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: false })
    await searchPlainWeapon(page)

    await page.getByRole('button', { name: '構成 1 を保存', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: '構成の保存にはログインが必要です' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Discord でログイン' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: '構成を保存' })).toHaveCount(0)
    expect(api.posts).toHaveLength(0)
  })
})
