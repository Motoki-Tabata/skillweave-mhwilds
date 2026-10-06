/** 名前の部分一致のために、全角・半角と大文字・小文字の違いをそろえる。 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/** 空の語はすべてに一致する。 */
export function matchesQuery(name: string, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query.trim())
  return normalizedQuery === '' || normalizeForSearch(name).includes(normalizedQuery)
}

const jaCollator = new Intl.Collator('ja')

export function compareJa(a: string, b: string): number {
  return jaCollator.compare(a, b)
}
