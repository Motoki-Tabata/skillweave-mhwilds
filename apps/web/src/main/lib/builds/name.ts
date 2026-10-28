/** 構成名の最大文字数（Unicode のコードポイント）。 */
export const BUILD_NAME_MAX = 50

export const BUILD_NAME_EMPTY_MESSAGE = '名前を入力してください。'
export const BUILD_NAME_TOO_LONG_MESSAGE = '名前は50文字以内で入力してください。'

/** コードポイントでの文字数（サロゲートペアを1文字と数える）。 */
export function codePointLength(text: string): number {
  return Array.from(text).length
}

export type BuildNameCheck = { ok: true; name: string } | { ok: false; message: string }

/** 前後の空白を除いて 1〜50 文字かを検証する。通れば送る名前（前後を除いたもの）を返す。 */
export function validateBuildName(input: string): BuildNameCheck {
  const name = input.trim()
  if (name === '') return { ok: false, message: BUILD_NAME_EMPTY_MESSAGE }
  if (codePointLength(name) > BUILD_NAME_MAX) {
    return { ok: false, message: BUILD_NAME_TOO_LONG_MESSAGE }
  }
  return { ok: true, name }
}

/** 初期値「<武器名> 構成<N>」。50 コードポイントを超えるときは武器名を切り詰める。 */
export function defaultBuildName(weaponName: string, index: number): string {
  const suffix = ` 構成${index}`
  const room = Math.max(0, BUILD_NAME_MAX - codePointLength(suffix))
  const head = Array.from(weaponName).slice(0, room).join('')
  return `${head}${suffix}`.trim()
}
