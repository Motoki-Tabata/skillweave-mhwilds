import { SLOT_REGION } from '@/lib/ocr/slots'

/**
 * 読み取り範囲（画像の幅・高さに対する比率の矩形。基準は 1920x1080 の画素を幅・高さで割った値）。
 * 根拠: オーナーの画像（e2e/measure/charm-ocr/images/）20枚の「装備詳細」の「装備スキル」欄を見た。
 * - スキルは最大3つ。1つ分の枠が上から 60px 間隔で並ぶ（charm-001・charm-013・charm-016 で確認。
 *   先頭の枠の上端 y=362。charm-013 の3つ・charm-009 の2つで間隔が同じ）。
 * - 枠の中は、名前が上段（枠の上端から +2〜+30。左端 x=1238 から最長の「貫通弾・竜の矢強化」（charm-009）
 *   が x=1425 まで）、Lv が下段の右端（枠の上端から +31〜+53。x=1465〜1515。「Lv3」の表記）。
 *   下段の左の目盛り（橙の四角）は文字として誤認識されるので、Lv の部分だけを切り出して外す。
 * - 最大 Lv のスキルの Lv は橙で表示される（charm-009 の1行目・charm-013 の龍耐性）。グレースケール化で
 *   明るさは保たれる。
 * 切り出した名前と Lv を、1枠につき1行に並べ直した1枚の画像にして、PSM 6 で1回認識する。
 * 解像度の違いはスコープ外（Q114）。比率なので 16:9 の他の解像度でも同じ位置になる。
 */
const REF_WIDTH = 1920
const REF_HEIGHT = 1080

interface RefRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const SKILL_TOP = 362 / REF_HEIGHT
const SKILL_PITCH = 60 / REF_HEIGHT
export const SKILL_COUNT_MAX = 3

const NAME: RefRect = { x: 1238, y: 2, width: 200, height: 28 }
const LEVEL: RefRect = { x: 1465, y: 31, width: 50, height: 22 }
/** 並べ直した画像の1行の高さ・名前と Lv の間の余白（基準の画素） */
const ROW_HEIGHT = 36
const GAP = 16

export interface SkillRowPlan {
  source: Rect
  destination: Rect
}

/** スキル欄の切り出し元と、並べ直した画像での貼り付け先（どちらも実際の画素）。 */
export function planSkillRows(
  imageWidth: number,
  imageHeight: number,
): { rows: SkillRowPlan[][]; width: number; height: number } {
  const sx = imageWidth / REF_WIDTH
  const sy = imageHeight / REF_HEIGHT
  const rows: SkillRowPlan[][] = []
  for (let k = 0; k < SKILL_COUNT_MAX; k++) {
    const top = (SKILL_TOP + SKILL_PITCH * k) * REF_HEIGHT
    const rowY = ROW_HEIGHT * k
    rows.push([
      {
        source: scaleRect({ ...NAME, y: top + NAME.y }, sx, sy),
        destination: scaleRect(
          { x: 0, y: rowY + 4, width: NAME.width, height: NAME.height },
          sx,
          sy,
        ),
      },
      {
        source: scaleRect({ ...LEVEL, y: top + LEVEL.y }, sx, sy),
        destination: scaleRect(
          { x: NAME.width + GAP, y: rowY + 7, width: LEVEL.width, height: LEVEL.height },
          sx,
          sy,
        ),
      },
    ])
  }
  return {
    rows,
    width: Math.round((NAME.width + GAP + LEVEL.width) * sx),
    height: Math.round(ROW_HEIGHT * SKILL_COUNT_MAX * sy),
  }
}

function scaleRect(r: RefRect, sx: number, sy: number): Rect {
  return {
    x: Math.round(r.x * sx),
    y: Math.round(r.y * sy),
    width: Math.round(r.width * sx),
    height: Math.round(r.height * sy),
  }
}

/** スロット欄の切り出し元（実際の画素）。 */
export function planSlotRegion(imageWidth: number, imageHeight: number): Rect {
  return scaleRect(SLOT_REGION, imageWidth / REF_WIDTH, imageHeight / REF_HEIGHT)
}

export interface PreparedImage {
  /** スキル欄をグレースケールにして並べ直した画像（PSM 6 で認識する） */
  skillImage: Blob
  slotPixels: Uint8ClampedArray
  slotWidth: number
  slotHeight: number
}

function toGrayscale(data: ImageData): void {
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    px[i] = l
    px[i + 1] = l
    px[i + 2] = l
  }
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できません')
  return ctx
}

async function buildSkillImage(bitmap: ImageBitmap): Promise<Blob> {
  const plan = planSkillRows(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(plan.width, plan.height)
  const ctx = context2d(canvas)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, plan.width, plan.height)
  for (const { source: s, destination: d } of plan.rows.flat()) {
    ctx.drawImage(bitmap, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height)
  }
  const data = ctx.getImageData(0, 0, plan.width, plan.height)
  toGrayscale(data)
  ctx.putImageData(data, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

function readSlotArea(bitmap: ImageBitmap): ImageData {
  const region = planSlotRegion(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(region.width, region.height)
  const ctx = context2d(canvas)
  ctx.drawImage(
    bitmap,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )
  return ctx.getImageData(0, 0, region.width, region.height)
}

/** 画像（Blob）を、認識用のスキル欄の画像とスロット欄の画素にする。ブラウザ内だけで処理する。 */
export async function prepareImage(image: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(image)
  try {
    const slots = readSlotArea(bitmap)
    return {
      skillImage: await buildSkillImage(bitmap),
      slotPixels: slots.data,
      slotWidth: slots.width,
      slotHeight: slots.height,
    }
  } finally {
    bitmap.close()
  }
}
