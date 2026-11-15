import type { BuildFile } from './manifest'

/** `self.__SWV_PRECACHE__` の値（SW の `PrecacheConfig` と同じ形）。 */
export interface SwPrecache {
  version: string
  base: string
  urls: string[]
  ocrHashes: Record<string, string>
}

export interface PrecacheInput {
  /** 配信の基準パス（末尾に `/` を含む）。 */
  base: string
  /** バンドルの全ファイル（chunk・asset）とマニフェスト・アイコン・マスターの2ファイル。 */
  files: BuildFile[]
  /** `tesseract/**` のファイル（事前キャッシュには入れず、hash だけを SW に渡す）。 */
  ocrFiles: BuildFile[]
  /** 前置前の `sw.js` の chunk のコード。版の計算に含める（SW 本体の変更でも版を変えるため）。 */
  swCode: string
}

// 事前キャッシュから除く: SW 自身・OCR・e2e と測定の入口・en の辞書。
const EXCLUDED = [
  /^sw\.js$/,
  /^tesseract\//,
  /^e2e\//,
  /^assets\/charm-ocr-/,
  /^master-.*\.en\.json$/,
]

export function isPrecacheTarget(fileName: string): boolean {
  return !EXCLUDED.some((pattern) => pattern.test(fileName))
}

/** `index.html` は `/`（base）で持つ。 */
export function precacheUrl(fileName: string, base: string): string {
  return fileName === 'index.html' ? base : `${base}${fileName}`
}

function toBytes(source: string | Uint8Array): Uint8Array<ArrayBuffer> {
  return typeof source === 'string' ? new TextEncoder().encode(source) : new Uint8Array(source)
}

export async function sha256Hex(source: string | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toBytes(source)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 内容の SHA-256 の先頭 16 桁。 */
export async function shortHash(source: string | Uint8Array): Promise<string> {
  return (await sha256Hex(source)).slice(0, 16)
}

/** 事前キャッシュの一覧・OCR の hash・版を作る。版は「URL と内容の hash」の一覧（末尾に SW 本体の hash）の hash の先頭 16 桁。 */
export async function buildPrecache(input: PrecacheInput): Promise<SwPrecache> {
  const targets = input.files.filter((file) => isPrecacheTarget(file.fileName))
  const entries = await Promise.all(
    targets.map(async (file) => ({
      url: precacheUrl(file.fileName, input.base),
      hash: await sha256Hex(file.source),
    })),
  )
  entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  // `sw.js` は事前キャッシュに入れないが、版の入力には末尾へ足す。
  const listing =
    entries.map((entry) => `${entry.url} ${entry.hash}\n`).join('') +
    `sw.js ${await sha256Hex(input.swCode)}\n`
  const ocrEntries = await Promise.all(
    input.ocrFiles.map(
      async (file) => [`${input.base}${file.fileName}`, await shortHash(file.source)] as const,
    ),
  )
  return {
    version: await shortHash(listing),
    base: input.base,
    urls: entries.map((entry) => entry.url),
    ocrHashes: Object.fromEntries(ocrEntries),
  }
}

/** `sw.js` の chunk の先頭に前置する文。 */
export function precacheHeader(precache: SwPrecache): string {
  return `self.__SWV_PRECACHE__ = ${JSON.stringify(precache)};\n`
}
