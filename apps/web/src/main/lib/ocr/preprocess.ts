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
/** 枠1つ分の画像の高さ・名前と Lv の間の余白（基準の画素） */
const ROW_HEIGHT = 36
const GAP = 16
/** 認識用の画像の拡大率（D14。小さい文字を読みやすくする） */
export const UPSCALE = 2

/** スキル欄全体の矩形（基準の画素。名前の左端〜Lv の右端、先頭の枠の上端〜最後の枠の Lv の下端）。切り抜きが使う。 */
export const SKILL_BOUNDS: RefRect = {
  x: NAME.x,
  y: 362,
  width: LEVEL.x + LEVEL.width - NAME.x,
  height: 60 * (SKILL_COUNT_MAX - 1) + LEVEL.y + LEVEL.height,
}

export interface SkillRowPlan {
  source: Rect
  destination: Rect
}

/**
 * スキル欄の切り出し元と、枠ごとの画像での貼り付け先（どちらも実際の画素）。
 * rows[k] が k 番目の枠の [名前, Lv]。width・height は枠1つ分の画像の寸法（枠ごとに別の画像にする。D1）。
 */
export function planSkillRows(
  imageWidth: number,
  imageHeight: number,
): { rows: SkillRowPlan[][]; width: number; height: number } {
  const sx = imageWidth / REF_WIDTH
  const sy = imageHeight / REF_HEIGHT
  // 貼り付け先だけ UPSCALE 倍にする（切り出し元は画像の実際の画素のまま）
  const dx = sx * UPSCALE
  const dy = sy * UPSCALE
  const rows: SkillRowPlan[][] = []
  for (let k = 0; k < SKILL_COUNT_MAX; k++) {
    const top = (SKILL_TOP + SKILL_PITCH * k) * REF_HEIGHT
    const rowY = 0
    rows.push([
      {
        source: scaleRect({ ...NAME, y: top + NAME.y }, sx, sy),
        destination: scaleRect(
          { x: 0, y: rowY + 4, width: NAME.width, height: NAME.height },
          dx,
          dy,
        ),
      },
      {
        source: scaleRect({ ...LEVEL, y: top + LEVEL.y }, sx, sy),
        destination: scaleRect(
          { x: NAME.width + GAP, y: rowY + 7, width: LEVEL.width, height: LEVEL.height },
          dx,
          dy,
        ),
      },
    ])
  }
  return {
    rows,
    width: Math.round((NAME.width + GAP + LEVEL.width) * dx),
    height: Math.round(ROW_HEIGHT * dy),
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

/** 1つの枠の認識用の画像。empty は、名前の範囲に文字が無い（スキルが付いていない）枠 */
export interface SkillFrame {
  image: Blob
  empty: boolean
}

export interface PreparedImage {
  /** 枠ごとに、2倍に拡大し、グレースケール・二値化（文字が黒）にして名前と Lv を1行に並べた画像（D1） */
  skillFrames: SkillFrame[]
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

/** 0〜255 の度数分布から、大津の方法で二値化のしきい値を求める（しきい値以下が暗い側）。 */
export function otsuThreshold(histogram: ArrayLike<number>): number {
  let total = 0
  let sum = 0
  for (let i = 0; i < histogram.length; i++) {
    total += histogram[i]
    sum += i * histogram[i]
  }
  let weightBack = 0
  let sumBack = 0
  let best = 0
  let bestVariance = -1
  for (let t = 0; t < histogram.length; t++) {
    weightBack += histogram[t]
    if (weightBack === 0) continue
    const weightFore = total - weightBack
    if (weightFore === 0) break
    sumBack += t * histogram[t]
    const diff = sumBack / weightBack - (sum - sumBack) / weightFore
    const variance = weightBack * weightFore * diff * diff
    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

/**
 * グレースケール化済みの RGBA を、大津の方法で二値化する。明るい文字（白）を黒、暗い背景を白に反転する
 * （Tesseract は白地に黒文字を想定している）。
 */
export function binarize(px: Uint8ClampedArray): void {
  const histogram = Array.from<number>({ length: 256 }).fill(0)
  for (let i = 0; i < px.length; i += 4) histogram[px[i]]++
  const threshold = otsuThreshold(histogram)
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i] > threshold ? 0 : 255
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
  }
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できません')
  return ctx
}

/** 空の枠の判定に使う「明るい」画素の下限（グレースケールの 0〜255） */
export const BRIGHT_LUMA = 140
/**
 * 名前の範囲（拡大後の貼り付け先）の明るい画素の割合がこの値未満なら、その枠は空（スキルが付いていない）。
 * 根拠（016 の測定。015 の20枚・1920x1080）: スキルが無い枠12か所は割合が 0.0000、スキルがある枠は
 * 最小が 0.0264（charm-010 の「匠」）・多くは 0.05〜0.2。両者の間の 0.01 にした。
 * PSM・拡大率の比較（同じ20枚）: PSM 7（1行）・拡大2倍＝誤り0・空欄2（charm-001 の「渾身」の1文字落ち・
 * charm-019 の「剛刃研磨」）、拡大3倍＝誤り0・空欄2（charm-001・charm-020）、拡大4倍＝誤り0・空欄3、
 * PSM 6・拡大2倍＝PSM 7 と同じ。最大の認識時間はどれも 150 ms 以下。空欄が最少で最速の PSM 7・2倍を採る。
 * 空欄の2件は、照合のしきい値（D3）を緩めないかぎり誤りでなく空欄として返る。
 */
export const EMPTY_BRIGHT_RATIO = 0.01

/** グレースケールの RGBA のうち、矩形の中の明るい画素の割合 */
export function brightRatio(px: ArrayLike<number>, width: number, rect: Rect): number {
  let bright = 0
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (px[(y * width + x) * 4] >= BRIGHT_LUMA) bright++
    }
  }
  const area = rect.width * rect.height
  return area === 0 ? 0 : bright / area
}

async function buildSkillFrame(bitmap: ImageBitmap, row: SkillRowPlan[]): Promise<SkillFrame> {
  const plan = planSkillRows(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(plan.width, plan.height)
  const ctx = context2d(canvas)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, plan.width, plan.height)
  for (const { source: s, destination: d } of row) {
    ctx.drawImage(bitmap, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height)
  }
  const data = ctx.getImageData(0, 0, plan.width, plan.height)
  toGrayscale(data)
  const ratio = brightRatio(data.data, plan.width, row[0].destination)
  binarize(data.data)
  ctx.putImageData(data, 0, 0)
  return {
    image: await canvas.convertToBlob({ type: 'image/png' }),
    empty: ratio < EMPTY_BRIGHT_RATIO,
  }
}

async function buildSkillFrames(bitmap: ImageBitmap): Promise<SkillFrame[]> {
  const frames: SkillFrame[] = []
  for (const row of planSkillRows(bitmap.width, bitmap.height).rows) {
    frames.push(await buildSkillFrame(bitmap, row))
  }
  return frames
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
      skillFrames: await buildSkillFrames(bitmap),
      slotPixels: slots.data,
      slotWidth: slots.width,
      slotHeight: slots.height,
    }
  } finally {
    bitmap.close()
  }
}
