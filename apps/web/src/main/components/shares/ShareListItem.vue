<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Copy } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Share } from '@/lib/api/shares'
import { formatDateTime } from '@/lib/format'
import { copyUrlWithToast } from '@/lib/shares/copy'
import { shareUrl } from '@/lib/shares/url'

const props = defineProps<{ share: Share; revoking: boolean }>()
defineEmits<{ revoke: [] }>()

const router = useRouter()
const url = computed(() => shareUrl(router, props.share.shortId))
const urlText = ref<HTMLElement | null>(null)
</script>

<template>
  <li>
    <Card class="gap-2 p-4">
      <RouterLink
        :to="`/s/${share.shortId}`"
        :data-name-id="share.id"
        class="focus-visible:ring-ring/50 w-fit rounded-sm text-base leading-snug font-bold break-all outline-none hover:underline focus-visible:ring-3"
      >
        {{ share.name }}
      </RouterLink>
      <p class="text-xs">
        共有: <span class="font-num tabular-nums">{{ formatDateTime(share.createdAt) }}</span>
      </p>
      <p ref="urlText" class="text-muted-foreground text-xs break-all">{{ url }}</p>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          class="h-10 gap-1"
          :aria-label="`${share.name} の URL をコピー`"
          :disabled="revoking"
          @click="copyUrlWithToast(url, urlText)"
        >
          <Copy class="size-4" aria-hidden="true" />
          URL をコピー
        </Button>
        <Button
          type="button"
          variant="outline"
          class="text-destructive border-destructive hover:text-destructive h-10"
          :aria-label="`${share.name} の共有を取り消す`"
          :disabled="revoking"
          :data-revoke-id="share.id"
          @click="$emit('revoke')"
        >
          {{ revoking ? '取り消し中…' : '共有を取り消す' }}
        </Button>
      </div>
    </Card>
  </li>
</template>
