<script setup lang="ts">
import { computed } from 'vue'
import type { SolvedBuild } from '@swv/solver'
import { Card } from '@/components/ui/card'
import { toBuildView } from '@/lib/solver/buildView'
import { useMasterStore } from '@/stores/master'
import { useSearchStore } from '@/stores/search'

const props = defineProps<{ build: SolvedBuild; index: number }>()

const master = useMasterStore()
const search = useSearchStore()

// 検索の後に武器の選択を変えても、結果は検索したときの武器で表示する
const view = computed(() =>
  toBuildView(props.build, {
    armor: (id) => master.armorById.get(id),
    weapon: search.summary === null ? undefined : master.weaponById.get(search.summary.weaponId),
    skillKind: (skillId) => master.skillById.get(skillId)?.kind,
    nameOf: master.nameOf,
  }),
)

function levelLabel(level: number | null): string {
  return level === null ? '−' : `Lv${level}`
}
</script>

<template>
  <Card class="@container gap-3 py-4">
    <div class="flex items-baseline justify-between gap-2 px-4">
      <h3 class="text-base leading-snug font-semibold">構成 {{ index + 1 }}</h3>
      <p class="text-sm">
        防御力 <span class="font-num font-bold tabular-nums">{{ view.defenseTotal }}</span>
      </p>
    </div>
    <div class="grid gap-4 px-4 @[600px]:grid-cols-2">
      <div class="flex flex-col gap-4">
        <section class="flex flex-col gap-1">
          <h4 class="text-sm font-bold">防具</h4>
          <table class="w-full text-sm">
            <caption class="sr-only">
              防具
            </caption>
            <thead>
              <tr class="text-left text-xs">
                <th scope="col" class="py-1 pr-2 font-normal">部位</th>
                <th scope="col" class="py-1 pr-2 font-normal">防具</th>
                <th scope="col" class="py-1 text-right font-normal">防御力</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in view.armors" :key="row.part" class="border-t">
                <td class="py-1.5 pr-2 align-top">{{ row.partLabel }}</td>
                <td class="py-1.5 pr-2 break-words">{{ row.name }}</td>
                <td class="py-1.5 text-right align-top font-num tabular-nums">{{ row.defense }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t font-bold">
                <th scope="row" colspan="2" class="py-1.5 pr-2 text-left">防御力の合計</th>
                <td class="py-1.5 text-right font-num tabular-nums">{{ view.defenseTotal }}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section class="flex flex-col gap-1">
          <h4 class="text-sm font-bold">装飾品</h4>
          <p v-if="view.decorations.length === 0" class="text-sm">装飾品なし</p>
          <table v-else class="w-full text-sm">
            <caption class="sr-only">
              装飾品
            </caption>
            <thead>
              <tr class="text-left text-xs">
                <th scope="col" class="py-1 pr-2 font-normal">持ち主</th>
                <th scope="col" class="py-1 pr-2 font-normal">スロット</th>
                <th scope="col" class="py-1 font-normal">装飾品</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in view.decorations" :key="i" class="border-t">
                <td class="py-1.5 pr-2 align-top">{{ row.ownerLabel }}</td>
                <td class="py-1.5 pr-2 align-top font-num tabular-nums">
                  {{ levelLabel(row.slotLevel) }}
                </td>
                <td class="py-1.5 break-words">{{ row.name }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <section class="flex flex-col gap-1">
          <h4 class="text-sm font-bold">発動スキル</h4>
          <p v-if="view.skillGroups.length === 0" class="text-sm">発動するスキルはありません</p>
          <div v-for="group in view.skillGroups" :key="group.kind" class="flex items-start gap-2">
            <span class="w-14 shrink-0 pt-0.5 text-xs">{{ group.label }}</span>
            <ul class="flex min-w-0 flex-1 flex-wrap gap-1">
              <li
                v-for="chip in group.chips"
                :key="chip.name"
                class="rounded-md border px-2 py-0.5 text-xs break-words"
              >
                {{ chip.name }} <span class="font-num tabular-nums">Lv{{ chip.level }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="flex flex-col gap-1">
          <h4 class="text-sm font-bold">空きスロット</h4>
          <p v-if="view.freeSlots.length === 0" class="text-sm">空きスロットなし</p>
          <ul v-else class="flex flex-wrap gap-1">
            <li
              v-for="(slot, i) in view.freeSlots"
              :key="i"
              class="rounded-md border px-2 py-0.5 text-xs"
            >
              {{ slot.ownerLabel }}
              <span class="font-num tabular-nums">{{ levelLabel(slot.slotLevel) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </Card>
</template>
