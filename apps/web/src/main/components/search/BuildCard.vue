<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { evaluateDamage } from '@swv/solver'
import type { DamageBase, SolvedBuild } from '@swv/solver'
import type { ConditionId } from '@swv/data'
import SkillLevelText from '@/components/search/SkillLevelText.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SKILL_KINDS } from '@/constants/labels'
import { formatAffinityPercent, formatDamageValue, formatMultiplier } from '@/lib/format'
import { toBuildView } from '@/lib/solver/buildView'
import type { BuildLookup } from '@/lib/solver/buildView'
import { useMasterStore } from '@/stores/master'

/** 火力の計算の材料。`base` が null のときは、武器が無いため計算できない。 */
export interface BuildCardDamage {
  base: DamageBase | null
  skills: SolvedBuild['skills']
  conditionIds: readonly ConditionId[]
}

const props = withDefaults(
  defineProps<{
    build: SolvedBuild
    /** 見出しの文言（「構成 1」「構成の内容」） */
    title: string
    headingLevel?: 2 | 3
    lookup: BuildLookup
    /** null のときは火力の節を出さない */
    damage: BuildCardDamage | null
    /** 護石の節を出すか（護石を使っていないときは「護石なし」） */
    showCharm: boolean
  }>(),
  { headingLevel: 3 },
)

const master = useMasterStore()

const view = computed(() => toBuildView(props.build, props.lookup))

// 火力は渡された材料（武器の攻撃力・会心率とオンの条件）だけから計算する。ソルバーの score は使わない
const damageUnknown = computed(() => props.damage !== null && props.damage.base === null)
const damageRows = computed(() => {
  const input = props.damage
  if (master.bundle === null || input === null || input.base === null) return null
  const stats = evaluateDamage(master.bundle, input.base, input.skills, input.conditionIds)
  return [
    { label: '期待値', text: formatDamageValue(stats.expectedDamage), strong: true },
    { label: '攻撃力', text: formatDamageValue(stats.attack), strong: false },
    { label: '会心率', text: formatAffinityPercent(stats.affinity), strong: false },
    { label: '会心倍率', text: formatMultiplier(stats.critMultiplier), strong: false },
  ]
})

// スキルの効果の一覧。並びはチップと同じ（種類の順、種類の中はチップの順）
const effectSkills = computed(() =>
  SKILL_KINDS.flatMap(({ id }) =>
    props.build.skills.filter((skill) => props.lookup.skillKind(skill.skillId) === id),
  ),
)
const effectsOpen = ref(false)
const effectsId = useId()

function levelLabel(level: number | null): string {
  return level === null ? '−' : `Lv${level}`
}
</script>

<template>
  <Card class="@container gap-3 py-4">
    <div class="flex items-center justify-between gap-2 px-4">
      <component :is="`h${headingLevel}`" class="text-base leading-snug font-semibold">
        {{ title }}
      </component>
      <div class="flex items-center gap-2">
        <div class="flex flex-wrap justify-end gap-x-4 text-sm">
          <p v-if="damageRows !== null">
            期待値 <span class="font-num font-bold tabular-nums">{{ damageRows[0].text }}</span>
          </p>
          <p>
            防御力 <span class="font-num font-bold tabular-nums">{{ view.defenseTotal }}</span>
          </p>
        </div>
        <slot name="action" />
      </div>
    </div>
    <section v-if="damageUnknown" class="flex flex-col gap-1 px-4">
      <h4 class="text-sm font-bold">火力</h4>
      <p class="text-sm">武器が現在のマスターに無いため、火力を計算できません。</p>
    </section>
    <section v-else-if="damageRows !== null" class="flex flex-col gap-1 px-4">
      <h4 class="text-sm font-bold">火力</h4>
      <dl class="grid grid-cols-4 gap-2">
        <div v-for="item in damageRows" :key="item.label" class="flex flex-col">
          <dt class="text-muted-foreground text-xs">{{ item.label }}</dt>
          <dd
            class="font-num tabular-nums"
            :class="item.strong ? 'text-base font-bold' : 'text-sm'"
          >
            {{ item.text }}
          </dd>
        </div>
      </dl>
    </section>
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
                <td class="py-1.5 text-right align-top font-num tabular-nums">
                  {{ row.known ? row.defense : '−' }}
                </td>
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

        <section v-if="view.charm !== null || showCharm" class="flex flex-col gap-1">
          <h4 class="text-sm font-bold">護石</h4>
          <p v-if="view.charm === null" class="text-sm">護石なし</p>
          <dl v-else class="flex flex-col gap-1 text-sm">
            <div class="flex items-start gap-2">
              <dt class="w-14 shrink-0 pt-0.5 text-xs">レア度</dt>
              <dd class="font-num tabular-nums">{{ view.charm.rarity }}</dd>
            </div>
            <div class="flex items-start gap-2">
              <dt class="w-14 shrink-0 pt-0.5 text-xs">スキル</dt>
              <dd class="min-w-0 flex-1">
                <p v-if="view.charm.skills.length === 0">スキルなし</p>
                <ul v-else class="flex flex-wrap gap-1">
                  <li
                    v-for="chip in view.charm.skills"
                    :key="chip.name"
                    class="rounded-md border px-2 py-0.5 text-xs break-words"
                  >
                    {{ chip.name }} <span class="font-num tabular-nums">Lv{{ chip.level }}</span>
                  </li>
                </ul>
              </dd>
            </div>
            <div class="flex items-start gap-2">
              <dt class="w-14 shrink-0 pt-0.5 text-xs">スロット</dt>
              <dd class="min-w-0 flex-1 break-words">
                <template v-if="view.charm.slots.length === 0">スロットなし</template>
                <template v-else>
                  {{ view.charm.slots.map((s) => `${s.targetLabel} Lv${s.level}`).join('・') }}
                </template>
              </dd>
            </div>
          </dl>
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
          <template v-if="effectSkills.length > 0">
            <Button
              type="button"
              variant="ghost"
              class="h-11 justify-start gap-2 px-2"
              :aria-expanded="effectsOpen"
              :aria-controls="effectsId"
              @click="effectsOpen = !effectsOpen"
            >
              <component
                :is="effectsOpen ? ChevronDown : ChevronRight"
                class="size-4"
                aria-hidden="true"
              />
              {{
                effectsOpen ? 'スキルの効果を隠す' : `スキルの効果を表示（${effectSkills.length}）`
              }}
            </Button>
            <dl v-if="effectsOpen" :id="effectsId" class="flex flex-col gap-2">
              <div v-for="skill in effectSkills" :key="skill.skillId" class="flex flex-col gap-0.5">
                <dt class="text-sm font-bold">
                  {{ lookup.nameOf(skill.skillId) }}
                  <span class="font-num tabular-nums">Lv{{ skill.level }}</span>
                </dt>
                <dd class="flex flex-col gap-0.5">
                  <SkillLevelText :skill-id="skill.skillId" :level="skill.level" />
                </dd>
              </div>
            </dl>
          </template>
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
