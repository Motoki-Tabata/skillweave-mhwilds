// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildPrecache,
  isPrecacheTarget,
  precacheHeader,
  precacheUrl,
  sha256Hex,
  shortHash,
} from '@/pwa/precache'

const files = (names: string[]) => names.map((fileName) => ({ fileName, source: `c:${fileName}` }))

const SW_CODE = 'console.log("sw")'

const BUNDLE = [
  'index.html',
  'assets/main-GxbOW8wZ.js',
  'assets/solver.worker-DOZrhvIW.js',
  'assets/highs-CTQpMom3.wasm',
  'master-2026.11.1.json',
  'master-2026.11.1.ja.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
]
const EXCLUDED = [
  'sw.js',
  'tesseract/lang/jpn.traineddata.gz',
  'master-2026.11.1.en.json',
  'e2e/measure/charm-ocr/index.html',
  'assets/charm-ocr-Ds125BQP.js',
]

describe('事前キャッシュの一覧（D4）', () => {
  it('AC-2: 入るもの・除くものが D4 の例どおり', async () => {
    const p = await buildPrecache({
      base: '/',
      files: files([...BUNDLE, ...EXCLUDED]),
      ocrFiles: [],
      swCode: SW_CODE,
    })
    expect(p.urls).toEqual([
      '/',
      '/assets/highs-CTQpMom3.wasm',
      '/assets/main-GxbOW8wZ.js',
      '/assets/solver.worker-DOZrhvIW.js',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
      '/master-2026.11.1.ja.json',
      '/master-2026.11.1.json',
    ])
  })

  it('AC-5: tesseract は一覧に入れず、hash（16 桁）だけを渡す', async () => {
    const p = await buildPrecache({
      base: '/',
      files: files(BUNDLE),
      ocrFiles: files(['tesseract/worker.min.js']),
      swCode: SW_CODE,
    })
    expect(p.urls.some((u) => u.includes('tesseract'))).toBe(false)
    expect(p.ocrHashes).toEqual({
      '/tesseract/worker.min.js': await shortHash('c:tesseract/worker.min.js'),
    })
    expect(p.ocrHashes['/tesseract/worker.min.js']).toMatch(/^[0-9a-f]{16}$/)
  })

  it('AC-7: en の辞書と /api/ を一覧に入れない', () => {
    expect(isPrecacheTarget('master-2026.11.1.en.json')).toBe(false)
    expect(isPrecacheTarget('master-2026.11.1.ja.json')).toBe(true)
  })

  it('AC-2: index.html は base の / で持ち、base を前に付ける', () => {
    expect(precacheUrl('index.html', '/')).toBe('/')
    expect(precacheUrl('index.html', '/app/')).toBe('/app/')
    expect(precacheUrl('assets/a.js', '/app/')).toBe('/app/assets/a.js')
  })
})

describe('版の計算（D5）', () => {
  const input = (body: string, swCode = SW_CODE) => ({
    base: '/',
    files: [
      { fileName: 'index.html', source: body },
      { fileName: 'a.js', source: 'a' },
    ],
    ocrFiles: [],
    swCode,
  })

  it('AC-8: 版は 16 桁の 16 進の小文字で、入力の順に依らず決まる', async () => {
    const a = await buildPrecache(input('x'))
    const reversed = await buildPrecache({ ...input('x'), files: input('x').files.toReversed() })
    expect(a.version).toMatch(/^[0-9a-f]{16}$/)
    expect(reversed.version).toBe(a.version)
  })

  it('AC-8: 内容が1バイト変わると版が変わる', async () => {
    expect((await buildPrecache(input('x'))).version).not.toBe(
      (await buildPrecache(input('y'))).version,
    )
  })

  it('AC-8: 版は「URL 内容の hash」の一覧（末尾に sw.js の hash）の SHA-256 の先頭 16 桁', async () => {
    const p = await buildPrecache(input('x'))
    const listing =
      `/ ${await sha256Hex('x')}\n/a.js ${await sha256Hex('a')}\n` +
      `sw.js ${await sha256Hex(SW_CODE)}\n`
    expect(p.version).toBe((await sha256Hex(listing)).slice(0, 16))
  })

  it('AC-8: swCode だけが1バイト変わっても版が変わる', async () => {
    expect((await buildPrecache(input('x', 'sw-a'))).version).not.toBe(
      (await buildPrecache(input('x', 'sw-b'))).version,
    )
  })

  it('AC-2: sw.js は urls にも ocrHashes にも入らない', async () => {
    const p = await buildPrecache(input('x'))
    expect(p.urls.some((u) => u.includes('sw.js'))).toBe(false)
    expect(Object.keys(p.ocrHashes).some((u) => u.includes('sw.js'))).toBe(false)
  })

  it('AC-2: SHA-256 は既知の値に一致し、バイト列も同じ hash になる', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(await sha256Hex('abc'))
  })

  it('AC-2: 埋め込みの文は self.__SWV_PRECACHE__ への代入で、値を JSON で持つ', async () => {
    const p = await buildPrecache(input('x'))
    const header = precacheHeader(p)
    expect(header.startsWith('self.__SWV_PRECACHE__ = {')).toBe(true)
    expect(JSON.parse(header.slice('self.__SWV_PRECACHE__ = '.length, -2))).toEqual(p)
  })
})
