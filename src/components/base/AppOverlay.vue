<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";
const props = withDefaults(
  defineProps<{ open: boolean; title: string; kind?: "modal" | "drawer" }>(),
  { kind: "modal" },
);
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const titleId = useId();
let previous: HTMLElement | null = null;
let previousOverflow = "";
let locked = false;
const tabbables = () =>
  [
    ...(panel.value?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
    ) ?? []),
  ].filter((el) => el.getClientRects().length > 0);
function onKey(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
  if (event.key !== "Tab") return;
  const all = tabbables();
  if (all.length === 0) {
    event.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = all[0]!;
  const last = all.at(-1)!;
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
function unlock() {
  if (!locked) return;
  locked = false;
  document.body.style.overflow = previousOverflow;
  document.removeEventListener("keydown", onKey);
  if (previous?.isConnected) previous.focus();
}
watch(
  () => props.open,
  async (open) => {
    if (open) {
      previous =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      locked = true;
      document.addEventListener("keydown", onKey);
      await nextTick();
      (tabbables()[0] ?? panel.value)?.focus();
    } else unlock();
  },
  { immediate: true },
);
onBeforeUnmount(unlock);
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="open"
      :class="['overlay-backdrop', `overlay-${kind}`]"
      @click.self="emit('close')"
    >
      <section
        v-bind="$attrs"
        ref="panel"
        :class="['overlay-panel', 'ui-window', `panel-${kind}`]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header>
          <h2 :id="titleId">{{ title }}</h2>
          <div class="window-art" aria-hidden="true"></div>
          <button
            class="overlay-close"
            aria-label="关闭"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="20" />
          </button>
        </header>
        <div class="overlay-body"><slot /></div>
        <footer v-if="$slots.footer"><slot name="footer" /></footer>
      </section></div
  ></Teleport>
</template>
<style scoped>
.overlay-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--navy) 50%, transparent);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.overlay-panel {
  background: var(--surface);
  color: var(--text-1);
  box-shadow: var(--sh-3);
  width: min(520px, 100%);
  border-radius: var(--r-panel);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  animation: appear var(--t-state) var(--ease);
}
.overlay-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
  border-bottom: 1px solid var(--border);
}
.overlay-panel h2 {
  font-size: 20px;
}
.overlay-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-2);
}
.overlay-body {
  padding: 24px;
}
.overlay-panel footer {
  padding: 16px 24px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.overlay-drawer {
  justify-content: flex-end;
  padding: 0;
}
.panel-drawer {
  border-radius: 20px 0 0 20px;
  height: 100dvh;
  max-height: 100dvh;
  width: min(440px, 100%);
  animation: slide var(--t-panel) var(--ease);
}
@keyframes appear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes slide {
  from {
    transform: translateX(100%);
  }
}
@media (max-width: 767px) {
  .overlay-backdrop {
    padding: 16px;
  }
  .overlay-drawer {
    padding: 0;
  }
  .panel-drawer {
    border-radius: 0;
  }
}
</style>
