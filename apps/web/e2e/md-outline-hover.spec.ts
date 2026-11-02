import { expect, test } from '@playwright/test'
import { uuidV7 } from './support/uuid'

// 029 AC-5: md 以上のダークで、ヘッダーのログインのリンクの hover 背景色が
// 026 AC-6 の outline の hover と同じ色であること。色の値は書き写さず、outline の実物から読む。
test.describe('029 md-outline-hover', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('AC-5: ログインのリンクの hover の背景色が outline の hover と同じ', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 401 }),
      }),
    )
    await page.route('**/api/shared-builds/*', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 404 }),
      }),
    )

    await page.goto(`/s/${uuidV7().slice(-12)}`)
    await page.addStyleTag({ content: '* { transition: none !important; }' })
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

    const outline = page.getByRole('link', { name: '装備検索へ' })
    const login = page.getByRole('link', { name: 'Discord でログイン' })
    await expect(outline).toBeVisible()
    await expect(login).toBeVisible()

    // e2e の tsconfig は DOM 型を持たないので、ブラウザ内の globalThis を最小の型で受ける。
    type BrowserGlobal = { getComputedStyle(el: unknown): { backgroundColor: string } }
    const backgroundOf = (target: typeof outline) =>
      target.evaluate(
        (el) => (globalThis as unknown as BrowserGlobal).getComputedStyle(el).backgroundColor,
      )

    // 空振り防止: hover の前後で outline の背景色が変わること。
    const outlineBefore = await backgroundOf(outline)
    await outline.hover()
    await expect
      .poll(() => backgroundOf(outline), { message: 'outline の hover で背景色が変わる' })
      .not.toBe(outlineBefore)
    const outlineHover = await backgroundOf(outline)

    await login.hover()
    await expect(login).toHaveCSS('background-color', outlineHover)
  })
})
