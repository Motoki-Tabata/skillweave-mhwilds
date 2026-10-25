/**
 * 画面の測定（004 の solver-ui.measure.ts・007 の damage-ui.measure.ts）が共有する6ケース。
 * 測定のファイルどうしを import すると相手のテストが登録されるので、共通部分はここに置く。
 * 003 の測定（packages/solver/src/test/solveBuilds.measure.ts）と同じスキル・下限。
 */
import type { Page } from '@playwright/test'
import { loadMasterInfo } from './masterData'
import { addSkills, openSearch, selectWeapon, setSkillLevel } from './search'

/** 003 と同じ実データのスキル（ID。名前は辞書から引く） */
export const SK = {
  fire: 'sk:-3666104', // 火竜の力（シリーズ）
  scale: 'sk:1487598336', // 鱗張りの技法（グループ）
  taijutsu: 'sk:-1689391744', // 体術
  evade: 'sk:144660544', // 回避性能
  challenger: 'sk:1865909632', // 挑戦者
  weak: 'sk:-397570464', // 弱点特効
  grudge: 'sk:1359821952', // 逆恨み
  fullcharge: 'sk:2106877312', // フルチャージ
  release: 'sk:1763191040', // 力の解放
  stamina: 'sk:-315492576', // スタミナ急速回復
}

export type Pair = [skillId: string, level: number]
export type Expected = 'found' | 'infeasible'

export interface MeasureCase {
  label: string
  required: Pair[]
  expected: Expected
}

export const CASES: MeasureCase[] = [
  {
    label: 'k=3 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
    ],
    expected: 'found',
  },
  {
    label: 'k=3 解なし',
    required: [
      [SK.fire, 2],
      [SK.evade, 5],
      [SK.challenger, 5],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=6 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 3],
      [SK.challenger, 3],
      [SK.weak, 3],
    ],
    expected: 'found',
  },
  {
    label: 'k=6 解なし',
    required: [
      [SK.fire, 2],
      [SK.taijutsu, 4],
      [SK.evade, 4],
      [SK.challenger, 4],
      [SK.weak, 4],
      [SK.grudge, 3],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=10 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 1],
      [SK.fullcharge, 1],
      [SK.release, 1],
      [SK.stamina, 1],
    ],
    expected: 'found',
  },
  {
    label: 'k=10 解なし',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 2],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 2],
      [SK.fullcharge, 2],
      [SK.release, 2],
      [SK.stamina, 1],
    ],
    expected: 'infeasible',
  },
]

export const master = loadMasterInfo()

/** 画面を開き、武器（先頭の武器）と必須スキル・下限を入れる（目的・ランク・検索は呼び出し側）。 */
export async function fillRequiredSkills(page: Page, testCase: MeasureCase): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(master.plainWeaponId))
  await addSkills(
    page,
    testCase.required.map(([id]) => master.nameOf(id)),
  )
  for (const [id, level] of testCase.required) {
    if (level < master.maxLevelOf(id)) await setSkillLevel(page, master.nameOf(id), level)
  }
}
