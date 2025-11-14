<script setup lang="ts">
import { badgeVariants, type BadgeVariants } from './variants'
import { cn } from '@/lib/utils'

interface Props {
  variant?: BadgeVariants['variant']
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), $attrs.class ?? '')">
    <slot />
  </div>
</template>
