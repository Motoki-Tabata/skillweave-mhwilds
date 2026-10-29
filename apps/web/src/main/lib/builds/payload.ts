import type { SolvedBuild, SolverCharm } from '@swv/solver'
import type { BuildPayload, BuildWeapon, CustomWeaponPayload } from '@/lib/api/builds'
import { isCraftedCharmId } from '@/lib/charms/crafted'
import type { StoredWeapon } from '@/lib/weapons/types'

/** 検索を送った時点の写し。保存する内容は、検索の後の編集・削除に影響されない。 */
export interface SubmittedBuildSource {
  /** 送信した時点の武器の参照と写し */
  weapon: BuildWeapon
  /** 送信した時点の護石の候補（ID で引く） */
  charms: ReadonlyMap<string, SolverCharm>
  /** 送信した時点でオンだった発動条件 */
  activeConditionIds: readonly string[]
}

/** 個体差のある武器を、リアクティブでない素のオブジェクトの写しにする。 */
export function customWeaponSnapshot(stored: StoredWeapon): BuildWeapon {
  const { payload } = stored
  const copy: CustomWeaponPayload = {
    baseWeaponId: payload.baseWeaponId,
    name: payload.name,
    attack: payload.attack,
    affinity: payload.affinity,
    ...(payload.element === undefined
      ? {}
      : {
          element: {
            type: payload.element.type as NonNullable<CustomWeaponPayload['element']>['type'],
            value: payload.element.value,
          },
        }),
    slots: payload.slots.map((slot) => ({ target: slot.target, level: slot.level })),
    seriesBonusId: payload.seriesBonusId,
    groupBonusId: payload.groupBonusId,
  }
  return { kind: 'custom', id: stored.id, payload: copy }
}

function charmCopy(charm: SolverCharm | undefined): BuildPayload['charm'] {
  if (charm === undefined) return null
  return {
    id: charm.id,
    payload: {
      rarity: charm.rarity,
      skills: charm.skills.map((skill) => ({ skillId: skill.skillId, level: skill.level })),
      slots: charm.slots.map((slot) => ({ target: slot.target, level: slot.level })),
    },
  }
}

/** 生産護石は ID の参照だけ、鑑定護石は写し、護石なしは null。 */
function charmOf(charmId: string | null, source: SubmittedBuildSource): BuildPayload['charm'] {
  if (charmId === null) return null
  if (isCraftedCharmId(charmId)) return { kind: 'crafted', charmId }
  return charmCopy(source.charms.get(charmId))
}

/**
 * 検索結果の構成と送信した時点の写しから、構成の保存の `payload` を作る。
 * 項目を明示して素のオブジェクトを組み立てる（`score` などの契約に無い項目を送らない）。
 */
export function buildPayloadOf(build: SolvedBuild, source: SubmittedBuildSource): BuildPayload {
  return {
    weapon: structuredClone(source.weapon),
    armor: {
      head: build.armor.head,
      chest: build.armor.chest,
      arms: build.armor.arms,
      waist: build.armor.waist,
      legs: build.armor.legs,
    },
    charm: charmOf(build.charmId, source),
    decorations: build.decorations.map(({ slot, decorationId }) => ({
      slot: { owner: slot.owner, index: slot.index },
      decorationId,
    })),
    skills: build.skills.map(({ skillId, level, rawLevel }) => ({ skillId, level, rawLevel })),
    freeSlots: build.freeSlots.map((slot) => ({ owner: slot.owner, index: slot.index })),
    activeConditionIds: [...source.activeConditionIds],
  }
}
