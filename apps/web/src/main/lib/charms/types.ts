import type { SkillLevel, Slot } from '@swv/data'

/** 護石の中身（保存する形・SolverCharm の rarity／skills／slots と同じ形）。並びはゲーム内の表示順。 */
export interface CharmPayload {
  rarity: number
  skills: SkillLevel[]
  slots: Slot[]
}

/** 入力中の護石。レア度は未選択を許し、スキルとスロットの行は空（null）を許す。 */
export interface CharmDraft {
  rarity: number | null
  skills: (SkillLevel | null)[]
  slots: (Slot | null)[]
}

/** 表示名を引く関数（マスターの ID から辞書の名前）。 */
export type NameOf = (id: string) => string
