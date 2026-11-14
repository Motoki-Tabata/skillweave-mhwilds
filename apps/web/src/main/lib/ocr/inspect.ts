import { SKILL_BOUNDS, type Rect } from '@/lib/ocr/preprocess'
import { SLOT_REGION } from '@/lib/ocr/slots'

/** 画像の検査と切り抜き（D10）。デコードは1回で、検査と切り抜きを同じ画像から作る。 */
export type InspectResult =
  { kind: 'ok'; preview: Blob } | { kind: 'notImage' } | { kind: 'notWide' }

const WIDE_TOLERANCE = 0.01
const REF_WIDTH = 1920
const REF_HEIGHT = 1080
/** 切り抜きの余白（1920x1080 の基準の画素） */
const MARGIN = 8

/** 16:9 の判定。縦横比が 16:9 から 1% 以内なら true（1366x768 は許し、16:10 は許さない）。 */
export function isWide(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  return Math.abs(width / height / (16 / 9) - 1) <= WIDE_TOLERANCE
}

/**
 * 切り抜きの矩形（実際の画素）。スロットの行とスキルの3枠を包む矩形に、上下左右 8px（基準）の余白を足す。
 * 基準では { x: 1230, y: 256, width: 298, height: 287 }。
 */
export function planPreviewRect(width: number, height: number): Rect {
  const left = Math.min(SLOT_REGION.x, SKILL_BOUNDS.x) - MARGIN
  const top = Math.min(SLOT_REGION.y, SKILL_BOUNDS.y) - MARGIN
  const right =
    Math.max(SLOT_REGION.x + SLOT_REGION.width, SKILL_BOUNDS.x + SKILL_BOUNDS.width) + MARGIN
  const bottom =
    Math.max(SLOT_REGION.y + SLOT_REGION.height, SKILL_BOUNDS.y + SKILL_BOUNDS.height) + MARGIN
  const sx = width / REF_WIDTH
  const sy = height / REF_HEIGHT
  return {
    x: Math.round(left * sx),
    y: Math.round(top * sy),
    width: Math.round((right - left) * sx),
    height: Math.round((bottom - top) * sy),
  }
}

async function cropPng(bitmap: ImageBitmap): Promise<Blob> {
  const rect = planPreviewRect(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(rect.width, rect.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できません')
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
  return canvas.convertToBlob({ type: 'image/png' })
}

/** 画像として開けるか・16:9 かを調べ、よければ切り抜き（PNG）を返す。MIME やファイル名では判定しない。 */
export async function inspectCharmImage(image: Blob): Promise<InspectResult> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(image)
  } catch {
    return { kind: 'notImage' }
  }
  try {
    if (!isWide(bitmap.width, bitmap.height)) return { kind: 'notWide' }
    return { kind: 'ok', preview: await cropPng(bitmap) }
  } finally {
    bitmap.close()
  }
}
