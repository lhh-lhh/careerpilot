<script setup lang="ts">
import { FunnelChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import type { EChartsOption } from "echarts";
import { SVGRenderer } from "echarts/renderers";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

use([
  PieChart,
  FunnelChart,
  LineChart,
  HeatmapChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

const props = withDefaults(
  defineProps<{
    title: string;
    summary: string;
    option: EChartsOption;
    height?: number;
  }>(),
  { height: 230 },
);

const host = ref<Parameters<typeof init>[0] | null>(null);
let chart: EChartsType | null = null;
let resizeObserver: InstanceType<typeof window.ResizeObserver> | null = null;
let themeObserver: InstanceType<typeof window.MutationObserver> | null = null;

function token(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function axisStyle(axis: unknown) {
  if (!axis || typeof axis !== "object") return axis;
  const source = record(axis);
  const axisLine = record(source.axisLine);
  const axisTick = record(source.axisTick);
  const axisLabel = record(source.axisLabel);
  const splitLine = record(source.splitLine);
  const nameTextStyle = record(source.nameTextStyle);
  return {
    ...source,
    axisLine: {
      ...axisLine,
      lineStyle: {
        ...record(axisLine.lineStyle),
        color: token("--border-control"),
      },
    },
    axisTick: {
      ...axisTick,
      lineStyle: {
        ...record(axisTick.lineStyle),
        color: token("--border-control"),
      },
    },
    axisLabel: { ...axisLabel, color: token("--text-2"), fontSize: 11 },
    splitLine: {
      ...splitLine,
      lineStyle: {
        ...record(splitLine.lineStyle),
        color: token("--border"),
      },
    },
    nameTextStyle: {
      ...nameTextStyle,
      color: token("--text-2"),
      fontSize: 11,
    },
  };
}

function draw() {
  if (!chart) return;
  const normalize = (value: unknown) =>
    Array.isArray(value) ? value.map(axisStyle) : axisStyle(value);
  chart.setOption(
    {
      animationDuration: 320,
      color: [
        token("--brand-text"),
        token("--teal"),
        token("--ai"),
        token("--amber"),
        token("--info"),
      ],
      textStyle: {
        color: token("--text-2"),
        fontFamily: token("--font-sans"),
      },
      tooltip: {
        trigger: "item",
        backgroundColor: token("--surface"),
        borderColor: token("--border-control"),
        textStyle: { color: token("--text-1") },
      },
      ...props.option,
      xAxis: normalize(props.option.xAxis),
      yAxis: normalize(props.option.yAxis),
    },
    { notMerge: true },
  );
}

onMounted(async () => {
  await nextTick();
  if (!host.value) return;
  chart = init(host.value, undefined, { renderer: "svg" });
  draw();
  resizeObserver = new window.ResizeObserver(() => chart?.resize());
  resizeObserver.observe(host.value);
  themeObserver = new window.MutationObserver(draw);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

watch(() => props.option, draw, { deep: true });
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <figure class="insight-chart">
    <div
      ref="host"
      class="chart-canvas"
      role="img"
      :aria-label="`${title}。${summary}`"
      :style="{ height: `${height}px` }"
    ></div>
    <figcaption>{{ summary }}</figcaption>
  </figure>
</template>

<style scoped>
.insight-chart {
  margin: 0;
  min-width: 0;
}
.chart-canvas {
  width: 100%;
  min-width: 0;
}
figcaption {
  margin-top: 8px;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.6;
}
@media (prefers-reduced-motion: reduce) {
  .chart-canvas {
    animation: none;
  }
}
</style>
