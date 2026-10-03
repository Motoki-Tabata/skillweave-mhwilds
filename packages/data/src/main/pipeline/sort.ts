/** コードユニット順の比較。localeCompare は実行環境のロケールで順序が変わるので使わない */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}
