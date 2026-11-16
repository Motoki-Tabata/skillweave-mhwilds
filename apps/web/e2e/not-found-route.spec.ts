import { expect, type Page, test } from '@playwright/test'
import { openSearch } from './support/search'

const ME_URL = '**/api/auth/me'
const CHARMS_CHUNK = '**/assets/CharmsView-*.js'
const NOT_FOUND_TITLE = 'ページが見つかりません | SkillWeave'

async function mockGuest(page: Page): Promise<void> {
  await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))
}

function notFoundHeading(page: Page) {
  return page.getByRole('heading', { level: 1, name: 'ページが見つかりません', exact: true })
}

function chunkNotice(page: Page) {
  return page.locator('[data-slot="chunk-load"]')
}

/** 護石の画面の部品の読み込みを失敗させる。本番の not_found_handling（存在しない JS に HTML の 200 を返す）を再現する。 */
async function blockCharmsChunk(page: Page): Promise<void> {
  await page.route(CHARMS_CHUNK, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
  )
}

async function clickCharmsNav(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '画面の切り替え' })
    .getByRole('link', { name: '護石', exact: true })
    .click()
}

test.describe('039 not-found-route', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuest(page)
  })

  test('AC-1, AC-2: 直接開くと枠の中に画面が出て、タイトルと URL はそのまま、リンクで装備検索へ移る', async ({
    page,
  }) => {
    await page.goto('/no-such-page')
    await expect(notFoundHeading(page)).toBeVisible()
    await expect(page).toHaveTitle(NOT_FOUND_TITLE)
    expect(new URL(page.url()).pathname).toBe('/no-such-page')
    // 既存の枠（ナビ）の中に出る
    await expect(page.getByRole('navigation', { name: '画面の切り替え' })).toBeVisible()

    await page.getByRole('link', { name: '装備検索へ', exact: true }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: '装備検索', exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('AC-1: アプリ内の移動でも画面が出て、URL はそのまま', async ({ page }) => {
    await openSearch(page)
    await page.evaluate(() => {
      const g = globalThis as unknown as {
        history: { pushState(s: unknown, t: string, u: string): void }
        dispatchEvent(e: unknown): boolean
        PopStateEvent: new (type: string) => unknown
      }
      g.history.pushState({}, '', '/another/missing/path')
      g.dispatchEvent(new g.PopStateEvent('popstate'))
    })
    await expect(notFoundHeading(page)).toBeVisible()
    await expect(page).toHaveTitle(NOT_FOUND_TITLE)
    expect(new URL(page.url()).pathname).toBe('/another/missing/path')
  })

  test('AC-5, AC-6: 部品の読み込み失敗で通知が出て自動では読み直さず、「再読み込み」で行き先を開く', async ({
    page,
  }) => {
    await openSearch(page)
    await blockCharmsChunk(page)
    await clickCharmsNav(page)

    const notice = chunkNotice(page)
    await expect(notice).toBeVisible()
    await expect(notice.getByText('画面を読み込めませんでした')).toBeVisible()
    // 自動で読み直さず、移動前の画面と URL のまま
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(
      page.getByRole('heading', { level: 1, name: '装備検索', exact: true }),
    ).toBeVisible()

    // 再読み込みでは、読めるようにしてから行き先を開く
    await page.unroute(CHARMS_CHUNK)
    await notice.getByRole('button', { name: '再読み込み', exact: true }).click()
    await expect(page).toHaveURL(/\/charms$/)
    await expect(page.getByRole('heading', { level: 1, name: '護石', exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(chunkNotice(page)).toHaveCount(0)
  })

  test('AC-7: 閉じると消えて操作を続けられ、再び失敗するとまた出る', async ({ page }) => {
    await openSearch(page)
    await blockCharmsChunk(page)
    await clickCharmsNav(page)

    const notice = chunkNotice(page)
    await expect(notice).toBeVisible()
    await notice.getByRole('button', { name: '通知を閉じる' }).click()
    await expect(notice).toHaveCount(0)
    // 今の画面の操作を続けられる
    await expect(
      page.getByRole('heading', { level: 1, name: '装備検索', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: '画面の切り替え' }).getByRole('link', {
        name: '護石',
        exact: true,
      }),
    ).toBeEnabled()

    await clickCharmsNav(page)
    await expect(notice).toBeVisible()
  })
})
