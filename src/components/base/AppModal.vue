<script setup lang="ts">
import AppOverlay from "./AppOverlay.vue";
defineProps<{ open: boolean; title: string }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <AppOverlay :open="open" :title="title" @close="$emit('close')"
    ><slot /><template v-if="$slots.footer" #footer
      ><slot name="footer" /></template
  ></AppOverlay>
</template>
