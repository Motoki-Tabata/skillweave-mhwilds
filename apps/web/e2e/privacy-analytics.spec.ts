import { expect, test } from '@playwright/test'

test.describe('032 privacy-analytics', () => {
  test('AC-10: /privacy を開くと、アクセス解析の節の見出しと Cloudflare Web Analytics の説明へのリンクが表示される', async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }))

    await page.goto('/privacy')

    await expect(
      page.getByRole('heading', { level: 2, name: 'アクセス解析', exact: true }),
    ).toBeVisible()
    // リンクの名前は末尾に「（新しいタブで開く）」の sr-only 文が付くので部分一致で探す
    const link = page.getByRole('link', { name: 'Cloudflare Web Analytics の説明' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://www.cloudflare.com/web-analytics/')
    await expect(link).toHaveAttribute('target', '_blank')
  })
})
