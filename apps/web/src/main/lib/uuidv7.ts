/** 時計と乱数の源。テストで差し替える。 */
export interface UuidSources {
  /** UNIX ミリ秒 */
  now: () => number
  fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void
}

const DEFAULT_SOURCES: UuidSources = {
  now: () => Date.now(),
  fillRandom: (bytes) => {
    globalThis.crypto.getRandomValues(bytes)
  },
}

/**
 * RFC 9562 の UUIDv7 を作る（小文字の 8-4-4-4-12）。
 * 同じミリ秒の中の単調増加は保証しない。
 */
export function uuidv7(sources: UuidSources = DEFAULT_SOURCES): string {
  const bytes = new Uint8Array(16)
  sources.fillRandom(bytes)
  // 先頭 48 ビットは UNIX ミリ秒（ビッグエンディアン）
  let time = sources.now()
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time % 256
    time = Math.floor(time / 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // 版 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 保存日時（UTC の ISO 8601）。 */
export function nowIso(): string {
  return new Date().toISOString()
}
