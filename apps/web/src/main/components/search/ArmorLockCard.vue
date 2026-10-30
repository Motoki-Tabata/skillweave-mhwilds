<script setup lang="ts">
import ArmorLockRow from '@/components/search/ArmorLockRow.vue'
import { Card, CardContent } from '@/components/ui/card'
import { ARMOR_PARTS } from '@/constants/labels'

const HEADING_ID = 'armor-lock-heading'
</script>

<template>
  <Card class="gap-3 py-4">
    <div class="flex flex-col gap-1 px-4">
      <h2 :id="HEADING_ID" class="text-base leading-snug font-bold">部位の固定</h2>
      <p class="text-muted-foreground text-xs">
        固定した防具は、候補にするランクにかかわらず使います。
      </p>
    </div>
    <CardContent class="px-4">
      <fieldset :aria-labelledby="HEADING_ID" class="flex flex-col gap-2">
        <ArmorLockRow
          v-for="part in ARMOR_PARTS"
          :key="part.id"
          :part="part.id"
          :label="part.label"
        />
      </fieldset>
    </CardContent>
  </Card>
</template>
