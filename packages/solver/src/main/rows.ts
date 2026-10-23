export interface Row {
  lower: number
  upper: number
  indices: number[]
  values: number[]
}

export type Coefs = [number, number][]

/** 係数が 0 でない列だけを集めた行を作る */
export function sparseRow(lower: number, upper: number, coefs: Coefs): Row {
  const nonZero = coefs.filter(([, v]) => v !== 0)
  return {
    lower,
    upper,
    indices: nonZero.map(([c]) => c),
    values: nonZero.map(([, v]) => v),
  }
}
