import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useThemeStore = defineStore("theme", () => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("careerpilot-theme");
  } catch {
    /* Preference storage is optional; domain storage is not. */
  }
  const theme = ref<"light" | "dark">(stored === "dark" ? "dark" : "light");
  watch(
    theme,
    (value) => {
      document.documentElement.dataset.theme = value;
      try {
        localStorage.setItem("careerpilot-theme", value);
      } catch {
        /* keep usable in private mode */
      }
    },
    { immediate: true },
  );
  function toggle() {
    theme.value = theme.value === "light" ? "dark" : "light";
  }
  return { theme, toggle };
});
