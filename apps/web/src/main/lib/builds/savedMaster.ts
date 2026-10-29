import type { MasterBundle } from '@swv/data'
import type { SavedBuildMaster } from '@/lib/solver/buildView'

/** マスターのストアのうち、保存した構成の表示が引くもの。 */
export interface SavedMasterSource {
  bundle: MasterBundle | null
  nameOf: SavedBuildMaster['nameOf']
  armorById: SavedBuildMaster['armorById']
  decorationById: ReadonlyMap<string, unknown>
  skillById: SavedBuildMaster['skillById']
  weaponById: SavedBuildMaster['weaponById']
  charmById: SavedBuildMaster['charmById']
}

/** 読み込んだマスターから `savedBuildView` に渡す形を作る。マスターが無ければ null。 */
export function savedMasterOf(source: SavedMasterSource): SavedBuildMaster | null {
  const { bundle } = source
  if (bundle === null) return null
  const conditionIds = new Set<string>(bundle.conditions.map((condition) => condition.id))
  return {
    version: bundle.version,
    nameOf: source.nameOf,
    armorById: source.armorById,
    hasDecoration: (id) => source.decorationById.has(id),
    skillById: source.skillById,
    weaponById: source.weaponById,
    charmById: source.charmById,
    hasCondition: (id) => conditionIds.has(id),
  }
}
