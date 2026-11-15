// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { iconRects, iconSvg, rasterize } from '@/pwa/icon'
import { buildManifest, buildPwaAssets } from '@/pwa/manifest'
import { crc32, encodePng } from '@/pwa/png'

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  const out = new Response(stream.readable).arrayBuffer()
  await Promise.all([writer.write(data), writer.close()])
  return new Uint8Array(await out)
}

interface Decoded {
  width: number
  height: number
  pixel: (x: number, y: number) => number[]
  types: string[]
  crcOk: boolean
}

async function decode(png: Uint8Array<ArrayBuffer>): Promise<Decoded> {
  const view = new DataView(png.buffer)
  const types: string[] = []
  let crcOk = true
  let offset = 8
  let width = 0
  let height = 0
  let idat = new Uint8Array(0)
  while (offset < png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const data = png.subarray(offset + 8, offset + 8 + length)
    crcOk &&=
      view.getUint32(offset + 8 + length) === crc32(png.subarray(offset + 4, offset + 8 + length))
    types.push(type)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
    }
    if (type === 'IDAT') idat = data as Uint8Array<ArrayBuffer>
    offset += 12 + length
  }
  const raw = await inflate(new Uint8Array(idat))
  const pixel = (x: number, y: number) => {
    const at = y * (width * 4 + 1) + 1 + x * 4
    return [...raw.subarray(at, at + 4)]
  }
  return { width, height, pixel, types, crcOk }
}

const GROUND = [15, 19, 23, 255]
const ORANGE = [246, 133, 52, 255]
const GRAY = [161, 169, 176, 255]

describe('アイコン（AC-1）', () => {
  it('AC-1: PNG は署名・IHDR の寸法・zlib 形式・CRC が正しい', async () => {
    const png = await encodePng(2, 2, new Uint8Array(16).fill(255))
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect([...png.subarray(41, 43)]).toEqual([0x78, 0x9c])
    const decoded = await decode(png)
    expect(decoded.types).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(decoded.crcOk).toBe(true)
    expect([decoded.width, decoded.height]).toEqual([2, 2])
    expect(decoded.pixel(1, 1)).toEqual([255, 255, 255, 255])
  })

  it('AC-1: crc32 は既知の値（"123456789" → cbf43926）に一致する', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('AC-1: 通常のアイコンは地・縦が上の交点・横が上の交点の色を持つ', async () => {
    const decoded = await decode(await encodePng(512, 512, rasterize('any', 512)))
    expect([decoded.width, decoded.height]).toEqual([512, 512])
    expect(decoded.pixel(0, 0)).toEqual(GROUND)
    expect(decoded.pixel(256, 256)).toEqual(ORANGE)
    expect(decoded.pixel(168, 256)).toEqual(GRAY)
  })

  it('AC-1: maskable は印が小さく、セーフゾーンの外は地の色', async () => {
    const decoded = await decode(await encodePng(512, 512, rasterize('maskable', 512)))
    expect(decoded.pixel(256, 256)).toEqual(ORANGE)
    // 通常では帯の上になる位置（印の端の近く）が、maskable では地になる
    expect(decoded.pixel(100, 256)).toEqual(GROUND)
    // 横が上の交点（印の一辺 9 の 2 の位置）は、通常では x=168・maskable では x=185 付近。x=100 は通常なら帯の上
    expect(decoded.pixel(185, 256)).toEqual(GRAY)
    const normal = await decode(await encodePng(512, 512, rasterize('any', 512)))
    expect(normal.pixel(100, 256)).toEqual(GRAY)
  })

  it('AC-1: 印は縦横 3 本ずつ（帯 6 本＋交点 9 組）で、帯の太さは印の 1/9', () => {
    const rects = iconRects('any')
    expect(rects).toHaveLength(1 + 6 + 18)
    expect(rects[1]!.w).toBeCloseTo(0.62 / 9, 10)
  })

  it('AC-1: SVG は同じ幾何の rect の並びで、文字を含まない', () => {
    const svg = iconSvg()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<rect /g)).toHaveLength(25)
    expect(svg).toContain('fill="#0f1317"')
    expect(svg).toContain('fill="#f68534"')
    expect(svg).toContain('fill="#a1a9b0"')
    expect(svg).not.toContain('<text')
  })
})

describe('マニフェスト（AC-1）', () => {
  it('AC-1: 名前・開始 URL・standalone・テーマの色・アイコンを持つ', () => {
    const m = buildManifest('/')
    expect(m).toMatchObject({
      name: 'SkillWeave（非公式の二次創作）',
      short_name: 'SkillWeave',
      start_url: '/',
      display: 'standalone',
      theme_color: '#0f1317',
      background_color: '#0f1317',
    })
    expect(m.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ])
  })

  it('AC-1: 配信するファイルを固定の名前で作る', async () => {
    const files = await buildPwaAssets('/')
    expect(files.map((f) => f.fileName)).toEqual([
      'manifest.webmanifest',
      'icons/icon.svg',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-512.png',
    ])
    const png192 = files[2]!.source as Uint8Array<ArrayBuffer>
    expect((await decode(png192)).width).toBe(192)
    expect(JSON.parse(files[0]!.source as string).start_url).toBe('/')
  })
})
