<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 24 });
const paths: Record<string, string> = {
  student: "M3 9 12 5l9 4-9 4-9-4Zm4 2v6c3 3 7 3 10 0v-6M21 9v7",
  company:
    "M4 21V4h11v17M15 10h5v11M8 8h3M8 12h3M8 16h3M8 21v-2h3v2M18 14h.01M18 17h.01",
  counselor:
    "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3M10 13l2 3 2-3M12 16v5",
  admin:
    "m9 3-1 3-3 1-2 3 2 2v3l2 2h3l2 3 3-1 1-3 3-1 2-3-2-2v-3l-2-2h-3l-2-3-3 1ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  arrow: "M4 12h15M13 6l6 6-6 6",
  search: "M19 19l-5-5M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  chevron: "m9 5 7 7-7 7",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20.5 14a9 9 0 0 1-10.5-11A9 9 0 1 0 20.5 14Z",
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  resume: "M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7M9 16h5",
  jobs: "M3 7h18v13H3V7Zm5 0V4h8v3M3 12c6 3 12 3 18 0M10 12h4v4h-4v-4Z",
  interview:
    "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 11h.01M12 11h.01M16 11h.01",
  timeline: "M6 4v16M8 5h12M8 12h9M8 19h12M3 5h.01M3 12h.01M3 19h.01",
  destination:
    "M12 21S4 14 4 8a8 8 0 1 1 16 0c0 6-8 13-8 13ZM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  chart: "M4 3v18h17M8 17v-6M13 17V7M18 17V4",
  design: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm14-1 5 5-5 5-5-5 5-5Z",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.5 8.5a2.5 2.5 0 1 1 4 2L12 12v2M12 17h.01",
  logout: "M9 4H4v16h5M9 12h12M17 8l4 4-4 4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  lock: "M6 10h12v11H6V10Zm2 0V6a4 4 0 1 1 8 0v4M12 14v3",
  sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  warning: "m12 3 10 18H2L12 3ZM12 9v5M12 17h.01",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  agreement: "M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h3M15 16l1 1 2-3",
  plus: "M12 5v14M5 12h14",
  calendar: "M4 5h16v16H4V5Zm4-2v4M16 3v4M4 10h16",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.arrow" />
  </svg>
</template>
