/** 見出しと、箇条書きの行を並べた失敗メッセージにする */
export function formatList(title: string, lines: string[]): string {
  const bullets = lines.map((line) => `  - ${line}`).join('\n')
  return `${title}:\n${bullets}`
}
