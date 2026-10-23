import type { SlotTarget } from '@swv/data'

/** 鑑定護石のレア度（decisions.md Q32）。 */
export const CHARM_RARITIES: readonly number[] = [5, 6, 7, 8]

export const CHARM_MAX_SKILLS = 3
export const CHARM_MAX_SLOTS = 3
/** 護石のスロットの Lv の範囲（1〜3）。 */
export const CHARM_SLOT_LEVELS: readonly (1 | 2 | 3)[] = [1, 2, 3]

/** スロットの種別の表示名。 */
export const SLOT_TARGET_LABELS: Record<SlotTarget, string> = {
  weapon: '武器用',
  armor: '防具用',
}

export interface CharmSlotOption {
  /** Select の値。「なし」は `none`、それ以外は `<target>:<level>` */
  value: string
  label: string
  slot: { target: SlotTarget; level: 1 | 2 | 3 } | null
}

/** スロットの選択肢。「なし」→武器用 Lv1〜3 →防具用 Lv1〜3 の順。 */
export const CHARM_SLOT_OPTIONS: readonly CharmSlotOption[] = [
  { value: 'none', label: 'なし', slot: null },
  ...(['weapon', 'armor'] as const).flatMap((target) =>
    CHARM_SLOT_LEVELS.map((level) => ({
      value: `${target}:${level}`,
      label: `${SLOT_TARGET_LABELS[target]} Lv${level}`,
      slot: { target, level },
    })),
  ),
]

/** 照合の結果。 */
export type CharmMatchStatus = 'pass' | 'mismatch' | 'unchecked'

export const CHARM_MATCH_LABELS: Record<CharmMatchStatus, string> = {
  pass: '合格',
  mismatch: 'テーブル不一致',
  unchecked: '未検査',
}
