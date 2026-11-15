import { expect, type Page, test } from '@playwright/test'
import { openCharms, registerCharm } from './support/charms'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon, setSkillLevel } from './support/search'
import { openWeapons, registerWeapon } from './support/weapons'

// 018 は SW を許可して動かす（既存の e2e は playwright.config.ts の既定で SW をブロックしている）
test.use({ serviceWorkers: 'allow' })

const master = loadMasterInfo()
const ME_URL = '**/api/auth/me'

// tsconfig.e2e.json に DOM の型が無いので、ページ内で使う分だけ最小の型で受ける
interface PageGlobals {
  navigator: {
    serviceWorker: {
      controller: unknown
      ready: Promise<unknown>
    }
  }
  caches: {
    keys(): Promise<string[]>
    open(name: string): Promise<{ keys(): Promise<{ url: string }[]> }>
  }
}

const ROUTES = [
  { path: '/', heading: '装備検索' },
  { path: '/charms', heading: '護石' },
  { path: '/weapons', heading: '個体差のある武器' },
  { path: '/builds', heading: '保存した構成' },
  { path: '/privacy', heading: 'プライバシー' },
]

async function mockGuest(page: Page): Promise<void> {
  await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))
}

/** `/` を開き、SW が有効になって、読み込み直さずにこの画面を制御するまで待つ（AC-2）。 */
async function openControlled(page: Page): Promise<void> {
  await mockGuest(page)
  await openSearch(page)
  await page.waitForFunction(
    () => (globalThis as unknown as PageGlobals).navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 60_000 },
  )
}

/** キャッシュ名ごとの URL（パス＋クエリ）の一覧。 */
async function cacheContents(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const g = globalThis as unknown as PageGlobals
    const result: Record<string, string[]> = {}
    for (const name of await g.caches.keys()) {
      const cache = await g.caches.open(name)
      result[name] = (await cache.keys()).map((r) => {
        const u = new URL(r.url)
        return u.pathname + u.search
      })
    }
    return result
  })
}

const precacheUrls = (contents: Record<string, string[]>): string[] =>
  Object.entries(contents)
    .filter(([name]) => name.startsWith('swv-precache-'))
    .flatMap(([, urls]) => urls)

async function expectHeading(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible({
    timeout: 60_000,
  })
}

test.describe('018 pwa-offline', () => {
  test('AC-1: マニフェストの項目・theme-color の一致・アイコンの PNG の寸法', async ({ page }) => {
    await mockGuest(page)
    await page.goto('/')

    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()
    const response = await page.request.get(href!)
    expect(response.ok()).toBe(true)
    const manifest = (await response.json()) as {
      name: string
      short_name: string
      start_url: string
      display: string
      theme_color: string
      icons: { src: string; sizes: string; type: string; purpose?: string }[]
    }

    expect(manifest.name).not.toBe('')
    expect(manifest.short_name).not.toBe('')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    expect(manifest.theme_color).toBe(themeColor)

    const dimensions = (bytes: Buffer): string =>
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
    const purposes = (size: string, purpose: string) =>
      manifest.icons.filter((i) => i.sizes === size && (i.purpose ?? 'any') === purpose)
    expect(purposes('192x192', 'any')).toHaveLength(1)
    expect(purposes('512x512', 'any')).toHaveLength(1)
    expect(purposes('512x512', 'maskable')).toHaveLength(1)
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      const res = await page.request.get(icon.src)
      expect(res.ok()).toBe(true)
      const bytes = await res.body()
      // PNG のシグネチャと IHDR の幅・高さ
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(dimensions(bytes)).toBe(icon.sizes)
    }
  })

  test('AC-2, AC-7: 読み込み直さずに controller が付き、事前キャッシュに「入る」があり「入らない」が無い（/api/ と en の辞書も無い）', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openControlled(page)

    const contents = await cacheContents(page)
    const names = Object.keys(contents)
    expect(names.filter((n) => n.startsWith('swv-precache-'))).toHaveLength(1)
    const urls = precacheUrls(contents)

    // 入る: 画面・バンドル・マスター・ja の辞書・マニフェスト・アイコン
    const version = master.version
    expect(urls).toContain('/')
    expect(urls).toContain(`/master-${version}.json`)
    expect(urls).toContain(`/master-${version}.ja.json`)
    expect(urls).toContain('/manifest.webmanifest')
    expect(urls).toContain('/icons/icon-192.png')
    expect(urls.some((u) => /^\/assets\/main-.+\.js$/.test(u))).toBe(true)
    expect(urls.some((u) => /^\/assets\/solver\.worker-.+\.js$/.test(u))).toBe(true)
    expect(urls.some((u) => /^\/assets\/.+\.wasm$/.test(u))).toBe(true)

    // 入らない: sw.js・OCR のファイル・en の辞書・測定の入口
    expect(urls).not.toContain('/sw.js')
    expect(urls.filter((u) => u.startsWith('/tesseract/'))).toEqual([])
    expect(urls).not.toContain(`/master-${version}.en.json`)
    expect(urls.filter((u) => u.startsWith('/e2e/'))).toEqual([])
    expect(urls.filter((u) => u.startsWith('/assets/charm-ocr-'))).toEqual([])

    // AC-7: どのキャッシュにも /api/ と en の辞書が無い
    const all = Object.values(contents).flat()
    expect(all.filter((u) => u.startsWith('/api/'))).toEqual([])
    expect(all.filter((u) => u.endsWith('.en.json'))).toEqual([])
  })

  test('AC-3: オフラインで各ルートを直接開いても、再読み込みしても、見出しが出る', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000)
    await openControlled(page)
    await context.setOffline(true)

    for (const route of ROUTES) {
      await page.goto(route.path)
      await expectHeading(page, route.heading)
      await page.reload()
      await expectHeading(page, route.heading)
    }
  })

  test('AC-4: オフラインで装備検索の結果が出て、端末内の護石と武器の一覧が出る', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000)
    await openControlled(page)
    // オンラインのうちに、端末内の護石と武器を1件ずつ登録する（このテストのブラウザコンテキストだけの領域）
    await openCharms(page)
    await registerCharm(page, 8)
    await openWeapons(page)
    await registerWeapon(page, 250)

    await context.setOffline(true)

    await page.goto('/charms')
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible({
      timeout: 60_000,
    })
    await page.goto('/weapons')
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible({
      timeout: 60_000,
    })

    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    // 004 の既定の条件と同じ。護石なしの検索にして、解のある下限にする
    const taijutsu = 'sk:-1689391744'
    await addSkills(page, [master.nameOf(taijutsu)])
    await setSkillLevel(page, master.nameOf(taijutsu), 3)
    await page.getByRole('checkbox', { name: '生産護石を候補に含める' }).uncheck()
    await searchButton(page).click()
    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
  })

  test('AC-5, AC-7: オンラインで1回画像から読み取った後、オフラインで再読み込みしても読み取れる', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000)
    await openControlled(page)
    await openCharms(page)

    // ブラウザの canvas で黒一色の PNG を作る（charm-ocr.spec.ts と同じ画像）
    const png = await blackPng(page, 1920, 1080)
    const banner = page.getByText(/画像から読み取った内容を入れました（この護石を含めて残り 1 件）/)
    const input = page.locator('input[type="file"][accept="image/*"]')

    await input.setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: png }])
    await expect(banner).toBeVisible({ timeout: 120_000 })

    // 読み取りで写された OCR のファイルが、利用時キャッシュにある（事前キャッシュには無い）
    const contents = await cacheContents(page)
    const ocr = contents['swv-runtime-ocr'] ?? []
    expect(ocr.some((u) => u.includes('/tesseract/lang/jpn.traineddata.gz?v='))).toBe(true)
    expect(ocr.some((u) => u.includes('/tesseract/worker.min.js?v='))).toBe(true)
    expect(precacheUrls(contents).filter((u) => u.startsWith('/tesseract/'))).toEqual([])

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: /^登録済みの護石（\d+）$/ })).toBeVisible({
      timeout: 60_000,
    })
    await input.setInputFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: png }])
    await expect(banner).toBeVisible({ timeout: 120_000 })
  })
})

/** ブラウザの canvas で黒一色の PNG を作り、バイト列で返す。 */
async function blackPng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      interface Ctx {
        fillStyle: string
        fillRect(x: number, y: number, w: number, h: number): void
      }
      interface Canvas {
        width: number
        height: number
        getContext(kind: '2d'): Ctx
        toDataURL(type: string): string
      }
      const doc = (globalThis as unknown as { document: { createElement(t: 'canvas'): Canvas } })
        .document
      const canvas = doc.createElement('canvas')
      canvas.width = w!
      canvas.height = h!
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w!, h!)
      return canvas.toDataURL('image/png').split(',')[1]!
    },
    [width, height],
  )
  return Buffer.from(base64, 'base64')
}
