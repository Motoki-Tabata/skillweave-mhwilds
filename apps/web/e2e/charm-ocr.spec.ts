import { expect, type Page, type Request, test } from '@playwright/test'
import { openCharms } from './support/charms'

const ME_URL = '**/api/auth/me'

/** ブラウザの canvas で黒一色の PNG を作り、バイト列で返す。 */
async function blackPng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      // tsconfig.e2e.json に DOM の型が無いので、使う分だけ最小の型で受ける
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

/** paste / drop の合成イベントを、合成した File を載せて出す。 */
async function dispatchWithFiles(
  page: Page,
  kind: 'paste' | 'drop',
  base64: string,
  names: string[],
): Promise<void> {
  await page.evaluate(
    ([eventKind, data, fileNames]) => {
      interface Dt {
        items: { add(file: unknown): void }
      }
      interface Win {
        atob(s: string): string
        Uint8Array: new (n: number) => { [i: number]: number }
        File: new (parts: unknown[], name: string, init: { type: string }) => unknown
        DataTransfer: new () => Dt
        ClipboardEvent: new (type: string, init: object) => unknown
        DragEvent: new (type: string, init: object) => unknown
        document: {
          dispatchEvent(e: unknown): void
          querySelector(s: string): { dispatchEvent(e: unknown): void } | null
        }
      }
      const w = globalThis as unknown as Win
      const bin = w.atob(data as string)
      const bytes = new w.Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const dt = new w.DataTransfer()
      for (const name of fileNames as string[]) {
        dt.items.add(new w.File([bytes], name, { type: 'image/png' }))
      }
      const init = { bubbles: true, cancelable: true }
      if (eventKind === 'paste') {
        w.document.dispatchEvent(new w.ClipboardEvent('paste', { ...init, clipboardData: dt }))
      } else {
        const zone = w.document.querySelector('[data-testid="ocr-drop-zone"]')
        zone!.dispatchEvent(new w.DragEvent('drop', { ...init, dataTransfer: dt }))
      }
    },
    [kind, base64, names],
  )
}

function trackRequests(page: Page): Request[] {
  const requests: Request[] = []
  // worker からのリクエストは page ではなく context で拾う
  page.context().on('request', (request) => requests.push(request))
  return requests
}

async function mockGuest(page: Page): Promise<void> {
  await page.route(ME_URL, (route) => route.fulfill({ status: 401 }))
}

const progress = (page: Page) => page.locator('output')

test.describe('016 charm-ocr', () => {
  test('AC-1, AC-4, AC-6, AC-9, AC-10, AC-11: ファイル選択から、待ち列・仮入力・登録・飛ばす・終わりまでを、自オリジンへの GET だけで進める', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await mockGuest(page)
    const requests = trackRequests(page)
    await openCharms(page)

    // AC-9: 画面を開いただけでは Tesseract.js のファイルを読み込まない
    expect(requests.filter((r) => r.url().includes('/tesseract/'))).toHaveLength(0)

    const wide = await blackPng(page, 1920, 1080)
    const notWide = await blackPng(page, 1600, 1200)
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
      { name: 'wide-1.png', mimeType: 'image/png', buffer: wide },
      { name: 'wide-2.png', mimeType: 'image/png', buffer: wide },
      { name: 'not-wide.png', mimeType: 'image/png', buffer: notWide },
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    ])

    // AC-4: 先頭の1件を仮入力し、残りの件数を出す。レア度は未選択
    const banner = page.getByText(/画像から読み取った内容を入れました（この護石を含めて残り 2 件）/)
    await expect(banner).toBeVisible({ timeout: 120_000 })
    await expect(
      page.getByRole('radio', { name: /^[5-8]$/ }).and(page.getByRole('radio', { checked: true })),
    ).toHaveCount(0)

    // AC-3 相当: 読み取らなかった画像の帯（2件の理由）
    await expect(
      page.getByText('読み取らなかった画像があります（2 枚）', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('not-wide.png: 16:9 の画像ではないため、読み取りませんでした。', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText('broken.png: 画像として開けないため、読み取りませんでした。', {
        exact: true,
      }),
    ).toBeVisible()

    // AC-9: 最初の画像を渡した後には /tesseract/ を読み込んでいる
    expect(requests.some((r) => r.url().includes('/tesseract/'))).toBe(true)

    // 読み終えるまで待つ
    await expect(progress(page)).not.toContainText('読み取っています', { timeout: 120_000 })
    await expect(page.getByRole('button', { name: '待ち列を空にする' })).toBeVisible()

    // AC-6: レア度を選んで登録すると、一覧が増えて次の1件へ進む
    await page.getByRole('radio', { name: '8', exact: true }).click()
    await page.getByRole('button', { name: '登録', exact: true }).click()
    // 照合が一致しないときは、確認のチェックを付けて登録し直す
    const confirm = page.getByRole('checkbox', { name: 'テーブルに合わないことを確認しました' })
    if (await confirm.isVisible()) {
      await confirm.check()
      await page.getByRole('button', { name: '登録', exact: true }).click()
    }
    await expect(page.getByText('護石を登録しました。', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    await expect(
      page.getByText(/画像から読み取った内容を入れました（この護石を含めて残り 1 件）/),
    ).toBeVisible()

    // AC-6: 「飛ばす」で最後の1件を除くと、終わりの表示とフォームの空に戻る
    await page.getByRole('button', { name: '飛ばす', exact: true }).click()
    await expect(
      page.getByText('読み取った護石をすべて終えました。', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/画像から読み取った内容を入れました/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '待ち列を空にする' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()

    // AC-10: worker・core・lang の3種を記録できていること（拾えていなければ検査が素通りしている）
    const paths = requests.map((r) => new URL(r.url()).pathname)
    const tesseractPaths = [
      {
        label: 'tesseract/worker.min.js',
        test: (p: string) => p.endsWith('/tesseract/worker.min.js'),
      },
      { label: 'tesseract/core/', test: (p: string) => p.includes('/tesseract/core/') },
      {
        label: 'tesseract/lang/jpn.traineddata.gz',
        test: (p: string) => p.endsWith('/tesseract/lang/jpn.traineddata.gz'),
      },
    ]
    const missing = tesseractPaths.filter((t) => !paths.some(t.test)).map((t) => t.label)
    expect(
      missing,
      `監視が worker の通信を捉えていない（記録に無い: ${missing.join(', ')}）`,
    ).toEqual([])

    // AC-10: 自オリジン以外・GET 以外のリクエストが無い（未ログインで端末に保存する）
    const origin = new URL(page.url()).origin
    // Web フォント（Google Fonts。index.html の既存の読み込みで、プライバシーの画面に記載済み）は
    // 画像の読み取りと無関係なので除く
    const fontHosts = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/']
    const external = requests.filter((r) => {
      const url = r.url()
      return (
        !url.startsWith(origin) &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:') &&
        !fontHosts.some((host) => url.startsWith(host))
      )
    })
    expect(external.map((r) => r.url())).toEqual([])
    expect(
      requests.filter((r) => r.method() !== 'GET').map((r) => `${r.method()} ${r.url()}`),
    ).toEqual([])
  })

  test('AC-1: 貼り付けの合成イベントで、画像が待ち列に入る', async ({ page }) => {
    test.setTimeout(180_000)
    await mockGuest(page)
    await openCharms(page)
    const wide = await blackPng(page, 1920, 1080)

    await dispatchWithFiles(page, 'paste', wide.toString('base64'), ['a.png'])

    await expect(
      page.getByText(/画像から読み取った内容を入れました（この護石を含めて残り 1 件）/),
    ).toBeVisible({ timeout: 120_000 })
  })

  test('AC-1: ドロップの合成イベントで、複数の画像が渡した順に待ち列に入る', async ({ page }) => {
    test.setTimeout(180_000)
    await mockGuest(page)
    await openCharms(page)
    const wide = await blackPng(page, 1920, 1080)

    await dispatchWithFiles(page, 'drop', wide.toString('base64'), ['a.png', 'b.png'])

    await expect(
      page.getByText(/画像から読み取った内容を入れました（この護石を含めて残り 2 件）/),
    ).toBeVisible({ timeout: 120_000 })
  })
})
