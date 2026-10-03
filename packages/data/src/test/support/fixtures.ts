import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import type { MhdbArmorSet, MhdbInput } from '../../main/pipeline/mhdb.ts'

export const CONFIG = { repository: 'owner/repo', commit: 'abc123', version: '9.9.9' }

export const names = (ja: string, en: string): Record<string, string> => ({
  ja,
  en,
  fr: `${en}-fr`,
})

/** 手で書いた小さな MHDB の入力。防具セット 10・11 は同じシリーズスキル 200 を持つ */
export function makeInput(): MhdbInput {
  const armorSet = (gameId: number, headSkills: Record<string, number>): MhdbArmorSet => ({
    game_id: gameId,
    rarity: 5,
    set_bonus: {
      skill_id: 200,
      ranks: [
        { pieces: 2, skill_level: 1 },
        { pieces: 4, skill_level: 2 },
      ],
    },
    group_bonus: null,
    pieces: [
      {
        kind: 'head',
        names: names(`頭${gameId}`, `head${gameId}`),
        descriptions: names(`頭の説明${gameId}`, `head desc ${gameId}`),
        defense: { base: 10, max: 50 },
        slots: [1, 3],
        skills: headSkills,
      },
      {
        kind: 'chest',
        names: names(`胴${gameId}`, `chest${gameId}`),
        defense: { base: 11, max: 55 },
        slots: [],
        skills: {},
      },
    ],
  })
  return {
    skills: [
      {
        game_id: 100,
        names: names('攻撃', 'Attack'),
        descriptions: names('攻撃が上がる', 'Raises attack'),
        kind: 'armor',
        ranks: [
          { level: 2, descriptions: names('中', 'mid') },
          { level: 1, descriptions: names('小', 'low') },
        ],
      },
      {
        game_id: 101,
        names: names('武器スキル', 'Weapon skill'),
        kind: 'weapon',
        ranks: [{ level: 1 }],
      },
      {
        game_id: 200,
        names: names('シリーズ', 'Series'),
        kind: 'set',
        ranks: [{ level: 1 }, { level: 2 }],
      },
      { game_id: 201, names: names('グループ', 'Group'), kind: 'group', ranks: [{ level: 1 }] },
    ],
    armors: [armorSet(10, { '100': 2, '200': 1, '201': 1 }), armorSet(11, { '100': 1, '200': 1 })],
    accessories: [
      {
        game_id: 1,
        names: names('珠', 'Jewel'),
        level: 3,
        skills: { '100': 1 },
        allowed_on: 'armor',
      },
    ],
    amulets: [
      {
        game_id: 5,
        is_random: false,
        ranks: [
          { names: names('護石I', 'Charm I'), rarity: 3, level: 1, skills: { '100': 1 } },
          { names: names('護石II', 'Charm II'), rarity: 4, level: 2, skills: { '100': 2 } },
        ],
      },
      {
        game_id: 6,
        is_random: true,
        ranks: [{ names: names('鑑定護石', 'Appraised'), rarity: 8, level: 1, skills: {} }],
      },
    ],
    weapons: [
      {
        game_id: 22,
        kind: 'charge-blade',
        names: names('剣', 'Blade'),
        attack_raw: 200,
        affinity: 5,
        slots: [2],
        specials: [{ kind: 'element', element: 'fire', raw: 30, hidden: false }],
        skills: { '101': 1 },
      },
      {
        game_id: 3,
        kind: 'bow',
        names: names('弓', 'Bow'),
        attack_raw: 100,
        affinity: 0,
        slots: [],
        specials: [{ kind: 'status', status: 'poison', raw: 20, hidden: false }],
        skills: {},
      },
      {
        game_id: 4,
        kind: 'bow',
        names: names('弓2', 'Bow2'),
        attack_raw: 90,
        affinity: -5,
        slots: [],
        specials: [],
        skills: {},
      },
    ],
  }
}

/** os.tmpdir() 配下に一時ディレクトリを作り、各テストの後に削除する */
export function useTempDirs(): () => Promise<string> {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })
  return async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swv-data-test-'))
    dirs.push(dir)
    return dir
  }
}
