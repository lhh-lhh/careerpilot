<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>
<template>
  <section class="app-card">
    <header v-if="title || $slots.actions">
      <div>
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="description">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
<style scoped>
.app-card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--sh-1);
  min-width: 0;
}
.app-card header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.app-card h3 {
  font-size: 16px;
}
.app-card p {
  color: var(--text-2);
  font-size: 14px;
  margin-top: 8px;
}
</style>
