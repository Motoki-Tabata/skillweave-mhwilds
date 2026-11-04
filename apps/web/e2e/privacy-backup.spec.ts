import { expect, test } from '@playwright/test'

const ME_URL = '**/api/auth/me'

test.describe('033 privacy-backup', () => {
  test('AC-13: /privacy に「データの削除」の見出しとバックアップの説明が表示される', async ({
    page,
  }) => {
    await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))

    await page.goto('/privacy')

    await expect(
      page.getByRole('heading', { level: 2, name: 'データの削除', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(/データベースのバックアップを週に\s*1\s*回ほど取り/).first(),
    ).toBeVisible()
  })
})
