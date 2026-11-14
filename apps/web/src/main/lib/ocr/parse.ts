import type { SkillLevel } from '@swv/data'
import { matchSkillName, type SkillCandidate } from '@/lib/ocr/match'

/**
 * スキル欄の画面の表記: 名前の右に「Lv3」のように Lv と数字が並ぶ（charm-001 など。pip の目盛りは
 * 読み取りの対象から外してある）。NFKC の後に大文字・小文字を区別せず Lv と続く数字を読む。
 */
const LEVEL_PATTERN = /lv\s*(\d+)/i

function splitLine(line: string): { name: string; level: number | null } {
  const text = line.normalize('NFKC')
  const found = LEVEL_PATTERN.exec(text)
  const level = found ? Number(found[1]) : null
  return { name: text.replace(/lv\s*\d*/gi, ''), level }
}

function parseLine(line: string, candidates: SkillCandidate[]): SkillLevel | null {
  const { name, level } = splitLine(line)
  const skill = matchSkillName(name, candidates)
  if (!skill || level === null || level < 1 || level > skill.maxLevel) return null
  return { skillId: skill.id, level }
}

/** 認識した文字列の、空白だけでない行を1行＝1スキルとして上から並べる。読めない行は null で位置に残す。 */
export function parseSkillLines(text: string, candidates: SkillCandidate[]): (SkillLevel | null)[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => parseLine(line, candidates))
}

/** 枠1つの読み取りの結果。empty は画素の判定で空だった枠（D2） */
export type FrameReading = SkillLevel | null | 'empty'

/** 枠1つの認識結果の文字列を解釈する。 */
export function parseSkillFrame(text: string, candidates: SkillCandidate[]): SkillLevel | null {
  return parseLine(text.replace(/\r?\n/g, ' '), candidates)
}

/**
 * 枠ごとの結果から `skills` を作る（D2）。末尾から続く空の枠は入れず、途中の空の枠は null にする。
 * 読めなかった枠も前に詰めず、位置に null を残す。
 */
export function assembleSkills(frames: FrameReading[]): (SkillLevel | null)[] {
  let end = frames.length
  while (end > 0 && frames[end - 1] === 'empty') end--
  return frames.slice(0, end).map((frame) => (frame === 'empty' ? null : frame))
}
