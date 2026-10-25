import type { DictionaryEntry } from '@swv/data'

/**
 * ja の辞書から、レベルの説明文を取り出す（`levelDescriptions[level - 1]`。index 0 = Lv1）。
 * 改行は `\n` にそろえる（表示側は `white-space: pre-line`）。空文字・欠けは null（説明文が無い）。
 */
export function levelDescription(entry: DictionaryEntry | undefined, level: number): string | null {
  const raw = entry?.levelDescriptions?.[level - 1]
  if (raw === undefined) return null
  const text = raw.replaceAll('\r\n', '\n')
  return text.trim() === '' ? null : text
}
