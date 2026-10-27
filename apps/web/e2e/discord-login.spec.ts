import { expect, type Page, test } from '@playwright/test'

const LOGIN_PATH = '/api/oauth2/authorization/discord'
const DISPLAY_NAME = 'モンハン太郎'
const ME_URL = '**/api/auth/me'

function jsonMe(): { status: number; contentType: string; body: string } {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ displayName: DISPLAY_NAME }),
  }
}

async function waitMe(page: Page, action: () => Promise<unknown>): Promise<void> {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/me')
  await action()
  await response
}

test.describe('009 discord-login', () => {
  test('受入基準 3・5: 未ログインでログインを押すと押した画面へ戻り、トーストと表示名が出る', async ({
    page,
    baseURL,
  }) => {
    let loggedIn = false
    await page.route(ME_URL, (route) =>
      loggedIn ? route.fulfill(jsonMe()) : route.fulfill({ status: 401 }),
    )
    // Discord の認可と API の戻りを差し替える。API は成功時も Web のトップへ固定で 302 を返す
    await page.route(`**${LOGIN_PATH}`, (route) => {
      loggedIn = true
      return route.fulfill({ status: 302, headers: { location: `${baseURL}/` } })
    })

    await waitMe(page, () => page.goto('/charms'))
    const login = page.getByRole('link', { name: 'Discord でログイン' })
    await expect(login).toBeVisible()
    await expect(login).toHaveAttribute('href', LOGIN_PATH)

    await login.click()

    await expect(page).toHaveURL(/\/charms$/)
    await expect(page.getByText('Discord でログインしました', { exact: true })).toBeVisible()
    await expect(page.getByText(DISPLAY_NAME, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('swv-login-return'))).toBeNull()
  })

  test('受入基準 5・6: ログイン中は表示名が出て、ログアウトは X-XSRF-TOKEN 付きで POST され、画面を移らず未ログインに戻る', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'xsrf-test', url: baseURL }])
    let logoutHeader: string | undefined
    await page.route(ME_URL, (route) => route.fulfill(jsonMe()))
    await page.route('**/api/auth/logout', (route) => {
      logoutHeader = route.request().headers()['x-xsrf-token']
      expect(route.request().method()).toBe('POST')
      return route.fulfill({ status: 204 })
    })

    await waitMe(page, () => page.goto('/weapons'))
    await expect(page.getByText(DISPLAY_NAME, { exact: true })).toBeVisible()
    await expect(page.locator('img[src*="avatar"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'ログアウト' }).click()

    await expect(page.getByRole('link', { name: 'Discord でログイン' })).toBeVisible()
    await expect(page.getByText('ログアウトしました', { exact: true })).toBeVisible()
    await expect(page.getByText(DISPLAY_NAME, { exact: true })).toHaveCount(0)
    await expect(page).toHaveURL(/\/weapons$/)
    expect(logoutHeader).toBe('xsrf-test')
  })

  test('受入基準 11・12: me が 500 のとき部品も通知も出ず、検索・護石・武器の画面を使える', async ({
    page,
  }) => {
    await page.route(ME_URL, (route) => route.fulfill({ status: 500 }))

    await waitMe(page, () => page.goto('/'))
    await expect(page.getByRole('heading', { level: 1, name: '装備検索' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('link', { name: 'Discord でログイン' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ログアウト' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText(/ログインできませんでした|ログインしました/)).toHaveCount(0)

    const navigation = page.getByRole('navigation', { name: '画面の切り替え' })
    await navigation.getByRole('link', { name: '護石', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: '護石', exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await navigation.getByRole('link', { name: '個体差のある武器', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: '個体差のある武器' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('link', { name: 'Discord でログイン' })).toHaveCount(0)
  })
})
