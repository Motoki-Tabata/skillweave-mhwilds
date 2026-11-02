import type { SkillCategory } from '../index.ts'

/** スキルの分類の一覧。overlay の読み込み（overlay.ts）と出力前の検証（validate.ts）が共有する。妥当性の判定にだけ使い、表示の順の正は Web の定数 */
export const SKILL_CATEGORIES = [
  'attack',
  'affinity',
  'element',
  'sharpness',
  'weapon_specific',
  'defense',
  'resistance',
  'mobility',
  'support',
] as const satisfies readonly SkillCategory[]

/** 変換の直後の `category`。overlay の `categories` で埋め、残っていれば検証が失敗させる */
export const UNASSIGNED_CATEGORY = '' as SkillCategory
