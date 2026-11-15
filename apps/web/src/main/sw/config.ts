// SW が埋め込みから読む設定と、キャッシュの名前（plan.md D5）。

/** ビルド時に `self.__SWV_PRECACHE__` として SW の先頭へ前置される値。 */
export interface PrecacheConfig {
  /** 事前キャッシュの版（16 桁の 16 進）。 */
  version: string
  /** 配信の基準パス（末尾に `/` を含む。例: `/`）。 */
  base: string
  /** 事前キャッシュの対象。`base` を前に付けた絶対パス。 */
  urls: string[]
  /** OCR のファイルの絶対パス → 内容の SHA-256 の先頭 16 桁。 */
  ocrHashes: Record<string, string>
}

export const PRECACHE_PREFIX = 'swv-precache-'
export const OCR_CACHE = 'swv-runtime-ocr'
export const FONTS_CACHE = 'swv-runtime-fonts'

export const FONTS_STATIC_ORIGIN = 'https://fonts.gstatic.com'
export const FONTS_CSS_ORIGIN = 'https://fonts.googleapis.com'

export function precacheName(version: string): string {
  return `${PRECACHE_PREFIX}${version}`
}

/** OCR のエントリのキー（パスと内容の hash）。ネットワークからは元の URL で取る。 */
export function ocrKey(pathname: string, hash: string): string {
  return `${pathname}?v=${hash}`
}
