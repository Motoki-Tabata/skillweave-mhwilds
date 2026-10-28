import type { MasterWeapon, Slot } from '@swv/data'

/** 「Lv3・Lv2・Lv1」。スロットが無いときは「なし」。 */
export function formatSlotLevels(slots: readonly Slot[]): string {
  return slots.length === 0 ? 'なし' : slots.map((slot) => `Lv${slot.level}`).join('・')
}

/** 「攻撃力 210 ／ 会心 25% ／ スロット Lv3・Lv2・Lv1」。武器種は含めない。 */
export function formatWeaponStats(weapon: MasterWeapon): string {
  return `攻撃力 ${weapon.attack} ／ 会心 ${weapon.affinity}% ／ スロット ${formatSlotLevels(weapon.slots)}`
}

/**
 * 小数第 `digits` 位に四捨五入した表示用の文字列。丸めは表示だけで行い、並び順・比較には使わない。
 * `Intl.NumberFormat` は10進の表記で丸めるので、`toFixed` のような2進の誤差は出ない。
 * 負の値の符号は半角の `-`。`-0` は出さない。
 */
export function formatFixed(value: number, digits: number): string {
  // 'negative' は ES2023 の値で、導入済みの lib の型にまだ無いので型だけ広げる
  const options = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
    signDisplay: 'negative',
  } as unknown as Intl.NumberFormatOptions
  return new Intl.NumberFormat('en-US', options).format(value)
}

/** 期待値・攻撃力: 小数第1位。 */
export function formatDamageValue(value: number): string {
  return formatFixed(value, 1)
}

/** 会心率: 整数の %。 */
export function formatAffinityPercent(value: number): string {
  return `${formatFixed(value, 0)}%`
}

/** 会心倍率・倍率: 小数第2位。 */
export function formatMultiplier(value: number): string {
  return formatFixed(value, 2)
}

/** 日時（ISO 8601）をブラウザのローカル時刻の `YYYY/MM/DD hh:mm` にする。 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
