import { expect, test, type Page } from '@playwright/test'

// e2e の tsconfig は DOM 型を持たないので、ブラウザ内の globalThis を最小の型で受ける。
type BrowserElement = {
  scrollWidth: number
  clientWidth: number
  getBoundingClientRect(): { left: number; right: number }
}
type BrowserGlobal = {
  scrollY: number
  innerWidth: number
  scrollTo(x: number, y: number): void
  document: {
    body: { appendChild(el: unknown): void }
    documentElement: { scrollWidth: number }
    createElement(tag: string): { style: { height: string } }
  }
}
const scrollY = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as BrowserGlobal).scrollY)

const ME_URL = '**/api/auth/me'
const TITLE = 'プライバシー | SkillWeave'

const ME_RESPONSES = [
  { label: '未ログイン(401)', status: 401, body: '' },
  {
    label: 'ログイン中(200)',
    status: 200,
    body: JSON.stringify({
      id: '019a0000-0000-7000-8000-000000000030',
      displayName: 'privacy-e2e',
    }),
  },
  { label: '取得不能(503)', status: 503, body: '' },
]

test.describe('030 privacy-notice', () => {
  for (const me of ME_RESPONSES) {
    test(`AC-1: ${me.label}でも /privacy を直接開くと、表記とタイトルが出て h1 にフォーカスがある`, async ({
      page,
    }) => {
      await page.route(ME_URL, (route) =>
        route.fulfill({ status: me.status, contentType: 'application/json', body: me.body }),
      )

      await page.goto('/privacy')

      const h1 = page.getByRole('heading', { level: 1, name: 'プライバシー', exact: true })
      await expect(h1).toBeVisible()
      await expect(page.getByText('contact@skillweave.app').first()).toBeVisible()
      await expect(page).toHaveTitle(TITLE)
      await expect(h1).toBeFocused()
    })
  }

  for (const path of ['/', '/charms', '/privacy']) {
    test(`AC-2: ${path} のフッターに /privacy へのリンクがある`, async ({ page }) => {
      await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))

      await page.goto(path)

      const link = page.getByRole('contentinfo').getByRole('link', { name: 'プライバシー' })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/privacy')
    })
  }

  test('AC-2: スクロールした / からリンクを押すと、/privacy の先頭が表示され h1 にフォーカスがある', async ({
    page,
  }) => {
    await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))
    await page.goto('/')
    // 画面が縦に伸びていなくてもスクロールした状態にするため、高さを足してから動かす
    await page.evaluate(() => {
      const g = globalThis as unknown as BrowserGlobal
      const spacer = g.document.createElement('div')
      spacer.style.height = '3000px'
      g.document.body.appendChild(spacer)
      g.scrollTo(0, 500)
    })
    await expect.poll(() => scrollY(page)).toBeGreaterThan(0)

    await page.getByRole('contentinfo').getByRole('link', { name: 'プライバシー' }).click()

    await expect(page).toHaveURL(/\/privacy$/)
    const h1 = page.getByRole('heading', { level: 1, name: 'プライバシー', exact: true })
    await expect(h1).toBeFocused()
    await expect.poll(() => scrollY(page)).toBe(0)
  })

  test('AC-2: 幅 360px でもリンクは切り詰められず、画面に収まり、横スクロールが無い', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))

    await page.goto('/')

    const footer = page.getByRole('contentinfo')
    const link = footer.getByRole('link', { name: 'プライバシー' })
    await expect(link).toBeVisible()
    const m = await link.evaluate((node) => {
      const el = node as unknown as BrowserElement
      const g = globalThis as unknown as BrowserGlobal
      const r = el.getBoundingClientRect()
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        left: r.left,
        right: r.right,
        docScroll: g.document.documentElement.scrollWidth,
        innerWidth: g.innerWidth,
      }
    })
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth)
    expect(m.left).toBeGreaterThanOrEqual(0)
    expect(m.right).toBeLessThanOrEqual(m.innerWidth)
    expect(m.docScroll).toBeLessThanOrEqual(m.innerWidth)
    const box = await footer.boundingBox()
    expect(box?.height).toBe(32)
  })
})
