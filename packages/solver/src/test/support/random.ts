/** シード付きの擬似乱数（mulberry32）。Math.random・現在時刻に依存しない。 */
export interface Rng {
  /** [0, 1) */
  next(): number
  /** [0, maxExclusive) の整数 */
  int(maxExclusive: number): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
  /** weights[i] に比例して添字 i を返す */
  weighted(weights: readonly number[]): number
  /** 新しい配列を返す（Fisher-Yates） */
  shuffle<T>(items: readonly T[]): T[]
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive)
  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick: (items) => {
      const item = items[int(items.length)]
      if (item === undefined) throw new Error('空の配列から選べない')
      return item
    },
    weighted: (weights) => {
      const total = weights.reduce((sum, w) => sum + w, 0)
      let r = next() * total
      for (const [i, w] of weights.entries()) {
        r -= w
        if (r < 0) return i
      }
      return weights.length - 1
    },
    shuffle: (items) => {
      const result = [...items]
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(i + 1)
        const a = result[i]
        const b = result[j]
        if (a === undefined || b === undefined) throw new Error('範囲外')
        result[i] = b
        result[j] = a
      }
      return result
    },
  }
}
