import type { MasterBundle, MasterDictionary, SkillId } from '@swv/data'

/** 照合の候補（護石に付きうるスキル）。名前は正規化済み。 */
export interface SkillCandidate {
  id: SkillId
  name: string
  maxLevel: number
}

/** NFKC にして空白を除く（半角・全角や空白の揺れを無くす）。 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '')
}

/** 護石に付くのは武器スキルと防具スキルだけ（シリーズ・グループは除く）。辞書に名前が無いものも除く。 */
export function buildCandidates(
  bundle: MasterBundle,
  dictionary: MasterDictionary,
): SkillCandidate[] {
  const candidates: SkillCandidate[] = []
  for (const skill of bundle.skills) {
    if (skill.kind !== 'armor' && skill.kind !== 'weapon') continue
    const entry = dictionary.entries[skill.id]
    if (!entry) continue
    candidates.push({ id: skill.id, name: normalizeText(entry.name), maxLevel: skill.maxLevel })
  }
  return candidates
}

/** 編集距離（Levenshtein）。 */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a)
  const y = Array.from(b)
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost))
    }
    prev = row
  }
  return prev[y.length]
}

/**
 * 認識した名前をもっとも近い候補に照合する。最小の距離の候補がちょうど1つで、
 * 距離が「候補名の長さ ÷ 3 の切り捨て」以下のときだけ返す。それ以外は null。
 */
export function matchSkillName(text: string, candidates: SkillCandidate[]): SkillCandidate | null {
  const target = normalizeText(text)
  if (target === '') return null
  let best: SkillCandidate | null = null
  let bestDistance = Infinity
  let tied = false
  for (const candidate of candidates) {
    const d = editDistance(target, candidate.name)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
      tied = false
    } else if (d === bestDistance) {
      tied = true
    }
  }
  if (!best || tied) return null
  return bestDistance <= Math.floor(Array.from(best.name).length / 3) ? best : null
}
