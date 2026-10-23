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

/** カタカナ（U+30A1〜U+30F6）をひらがなに寄せる。 */
function katakanaToHiragana(text: string): string {
  return text.replaceAll(/[ァ-ヶ]/g, (char) => String.fromCodePoint(char.codePointAt(0)! - 0x60))
}

function normalizeForSkillSearch(text: string): string {
  return katakanaToHiragana(normalizeForSearch(text))
}

/**
 * スキル名の検索。名前か読みのどちらかに部分一致すれば一致にする。
 * ひらがなとカタカナ、全角と半角を同一視し、読みが無ければ名前だけで照らす。空の語はすべてに一致する。
 */
export function matchesSkillQuery(
  name: string,
  reading: string | undefined,
  query: string,
): boolean {
  const normalizedQuery = normalizeForSkillSearch(query.trim())
  if (normalizedQuery === '') return true
  return [name, reading].some(
    (target) => target !== undefined && normalizeForSkillSearch(target).includes(normalizedQuery),
  )
}
