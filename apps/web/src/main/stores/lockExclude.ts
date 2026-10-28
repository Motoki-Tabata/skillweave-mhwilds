import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ArmorId, ArmorPart, DecorationId } from '@swv/data'
import { ARMOR_PARTS } from '@/constants/labels'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** 部位ごとの固定。キーが無い部位は「固定しない」、null は「何も付けない」。 */
export type FixedArmor = Partial<Record<ArmorPart, ArmorId | null>>

/**
 * 検索条件の「部位の固定」と「除外」。端末には保存しない（再読み込みで既定に戻る）。
 * 固定と除外が同じ防具に当たったときは、後の操作を優先して前の指定を解除する。
 */
export const useLockExcludeStore = defineStore('lockExclude', () => {
  const master = useMasterStore()
  const toast = useToastStore()

  const fixed = ref<FixedArmor>({})
  const excludedArmorIds = ref<ArmorId[]>([])
  const excludedDecorationIds = ref<DecorationId[]>([])

  /** 固定した部位の数（「何も付けない」を含む）。 */
  const fixedPartCount = computed(() => Object.keys(fixed.value).length)

  /**
   * 部位の固定を変える。value は防具の ID・null（何も付けない）・undefined（固定しない）。
   * 除外の一覧にある防具を固定したら、一覧から外す。
   */
  function setFixed(part: ArmorPart, value: ArmorId | null | undefined): void {
    const next = { ...fixed.value }
    if (value === undefined) delete next[part]
    else next[part] = value
    fixed.value = next
    if (typeof value === 'string' && excludedArmorIds.value.includes(value)) {
      excludedArmorIds.value = excludedArmorIds.value.filter((id) => id !== value)
      toast.push(`${master.nameOf(value)}を除外の一覧から外しました。`)
    }
  }

  /** 防具を除外に足す。その防具を固定している部位があれば「固定しない」に戻す。 */
  function addExcludedArmor(id: ArmorId): void {
    if (excludedArmorIds.value.includes(id)) return
    excludedArmorIds.value = [...excludedArmorIds.value, id]
    const part = ARMOR_PARTS.find((item) => fixed.value[item.id] === id)
    if (part !== undefined) {
      const next = { ...fixed.value }
      delete next[part.id]
      fixed.value = next
      toast.push(`${part.label}の固定を解除しました。`)
    }
  }

  function removeExcludedArmor(id: ArmorId): void {
    excludedArmorIds.value = excludedArmorIds.value.filter((item) => item !== id)
  }

  function addExcludedDecoration(id: DecorationId): void {
    if (excludedDecorationIds.value.includes(id)) return
    excludedDecorationIds.value = [...excludedDecorationIds.value, id]
  }

  function removeExcludedDecoration(id: DecorationId): void {
    excludedDecorationIds.value = excludedDecorationIds.value.filter((item) => item !== id)
  }

  return {
    fixed,
    excludedArmorIds,
    excludedDecorationIds,
    fixedPartCount,
    setFixed,
    addExcludedArmor,
    removeExcludedArmor,
    addExcludedDecoration,
    removeExcludedDecoration,
  }
})
