import type { SkillLevel, Slot } from '@swv/data'

/**
 * 1枚の画像の読み取り結果（CharmDraft からレア度を除いた形）。並びは画面の表示順。
 * null は読み取れなかった行（推測で埋めない）。lines は認識した生の文字列（不一致の調査用）。
 */
export interface CharmReadResult {
  skills: (SkillLevel | null)[]
  slots: (Slot | null)[]
  lines: string[]
}

export interface CharmReader {
  read(image: Blob): Promise<CharmReadResult>
  terminate(): Promise<void>
}
