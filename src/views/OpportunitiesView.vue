<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PublicHeader from "../components/public/PublicHeader.vue";
import OpportunityRows from "../components/public/OpportunityRows.vue";
import { api } from "../adapters/repository/http";
import type { OpportunityPage } from "../types/opportunities";
const route = useRoute(),
  router = useRouter(),
  data = ref<OpportunityPage | null>(null),
  loading = ref(true),
  error = ref(false);
const form = reactive({
  q: "",
  location: "",
  degree: "",
  type: "",
  source: "",
});
let generation = 0;
async function load() {
  const id = ++generation;
  loading.value = true;
  error.value = false;
  for (const key of Object.keys(form) as (keyof typeof form)[])
    form[key] =
      typeof route.query[key] === "string" ? String(route.query[key]) : "";
  try {
    const params = new window.URLSearchParams();
    for (const key of ["q", "location", "degree", "type", "source", "page"])
      if (typeof route.query[key] === "string")
        params.set(key, String(route.query[key]));
    const value = await api<OpportunityPage>(
      `/api/public/opportunities?${params}`,
    );
    if (id === generation) data.value = value;
  } catch {
    if (id === generation) error.value = true;
  } finally {
    if (id === generation) loading.value = false;
  }
}
function search() {
  const query = Object.fromEntries(
    Object.entries(form).filter(([, value]) => value.trim()),
  );
  void router.push({ path: "/opportunities", query });
}
function page(value: number) {
  void router.push({ query: { ...route.query, page: String(value) } });
}
watch(() => route.fullPath, load);
onMounted(() => {
  void load();
  window.addEventListener("focus", load);
});
onUnmounted(() => {
  generation++;
  window.removeEventListener("focus", load);
});
</script>
<template>
  <div class="public-page feature-opportunities ui-scene ui-scene--campus">
    <PublicHeader />
    <main id="main-content" class="public-container public-section">
      <h1>找到值得奔赴的机会。</h1>
      <p class="public-subtitle">从岗位要求出发，选择适合自己的下一步。</p>
      <form class="public-filters" role="search" @submit.prevent="search">
        <label
          >岗位关键词<input
            v-model="form.q"
            maxlength="200"
            placeholder="岗位、企业或专业" /></label
        ><label
          >工作地点<select v-model="form.location">
            <option value="">全部地点</option>
            <option v-for="item in data?.facets.locations" :key="item">
              {{ item }}
            </option>
          </select></label
        ><label
          >学历要求<select v-model="form.degree">
            <option value="">全部学历</option>
            <option v-for="item in data?.facets.degrees" :key="item">
              {{ item }}
            </option>
          </select></label
        ><label
          >岗位来源<select v-model="form.source">
            <option value="">全部来源</option>
            <option value="local">本站办理</option>
            <option value="external">国家平台</option>
          </select></label
        ><label
          >招聘类型<select v-model="form.type">
            <option value="">全部类型</option>
            <option v-for="item in data?.facets.types" :key="item">
              {{ item }}
            </option>
          </select></label
        >
        <div class="public-filter-actions">
          <button class="public-button" type="submit">搜索</button
          ><RouterLink class="public-button secondary" to="/opportunities"
            >清空筛选</RouterLink
          >
        </div>
      </form>
      <p v-if="error" role="alert" class="public-error">
        岗位暂时无法读取，请稍后重试。<button
          class="public-button secondary"
          @click="load"
        >
          重新加载
        </button>
      </p>
      <p v-else-if="loading" role="status" class="public-empty">
        正在读取岗位…
      </p>
      <template v-else
        ><div class="public-heading">
          <h2>岗位机会</h2>
          <span class="public-caption"
            >{{ data?.total ?? 0 }} 条 · 最近更新优先</span
          >
        </div>
        <OpportunityRows v-if="data?.items.length" :items="data.items" />
        <p v-else class="public-empty">
          没有找到符合条件的岗位，试试其他关键词或清空筛选。
        </p>
        <nav
          v-if="data && data.total > data.pageSize"
          class="public-pagination"
          aria-label="岗位分页"
        >
          <button
            class="public-button secondary"
            :disabled="data.page === 1"
            @click="page(data.page - 1)"
          >
            上一页</button
          ><span
            >第 {{ data.page }} /
            {{ Math.max(1, Math.ceil(data.total / data.pageSize)) }} 页</span
          ><button
            class="public-button secondary"
            :disabled="data.page * data.pageSize >= data.total"
            @click="page(data.page + 1)"
          >
            下一页
          </button>
        </nav></template
      >
    </main>
  </div>
</template>
