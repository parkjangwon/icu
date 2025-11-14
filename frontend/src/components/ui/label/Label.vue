<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  Label,
  type LabelProps,
  useForwardProps,
} from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <Label
    v-bind="forwardedProps"
    :class="cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      props.class,
    )"
  >
    <slot />
  </Label>
</template>
