<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { TriangleAlert } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Build } from '@/lib/api/builds'
import { savedMasterOf } from '@/lib/builds/savedMaster'
import { formatDateTime } from '@/lib/format'
import { savedBuildView } from '@/lib/solver/buildView'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{ build: Build; deleting: boolean }>()
defineEmits<{ rename: []; remove: [] }>()

const master = useMasterStore()
const view = computed(() => {
  const source = savedMasterOf(master)
  return source === null ? null : savedBuildView(props.build, source)
})
</script>

<template>
  <li>
    <Card class="gap-2 p-4">
      <RouterLink
        :to="`/builds/${build.id}`"
        :data-name-id="build.id"
        class="focus-visible:ring-ring/50 w-fit rounded-sm text-base leading-snug font-bold break-all outline-none hover:underline focus-visible:ring-3"
      >
        {{ build.name }}
      </RouterLink>
      <p v-if="view !== null" class="text-xs break-words">武器: {{ view.weaponName }}</p>
      <p class="text-xs">
        保存: <span class="font-num tabular-nums">{{ formatDateTime(build.createdAt) }}</span>
      </p>
      <Badge v-if="view?.versionDiffers" variant="outline">
        <TriangleAlert aria-hidden="true" />
        マスターの版が違う
      </Badge>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          class="h-10"
          :aria-label="`${build.name} の名前を変更`"
          :disabled="deleting"
          :data-rename-id="build.id"
          @click="$emit('rename')"
        >
          名前を変更
        </Button>
        <Button
          type="button"
          variant="outline"
          class="text-destructive border-destructive hover:text-destructive h-10"
          :aria-label="`${build.name} を削除`"
          :disabled="deleting"
          :data-delete-id="build.id"
          @click="$emit('remove')"
        >
          {{ deleting ? '削除中…' : '削除' }}
        </Button>
      </div>
    </Card>
  </li>
</template>
