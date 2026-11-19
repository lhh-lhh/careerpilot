<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useThemeStore } from "../stores/theme";
import { contrastRatio } from "../domain/design/contrast";
import BrandMark from "../components/base/BrandMark.vue";
import ThemeToggle from "../components/base/ThemeToggle.vue";
import AppButton from "../components/base/AppButton.vue";
import AppIcon from "../components/base/AppIcon.vue";
import AppInput from "../components/base/AppInput.vue";
import AppSelect from "../components/base/AppSelect.vue";
import AppTag from "../components/base/AppTag.vue";
import AppCard from "../components/base/AppCard.vue";
import AppDrawer from "../components/base/AppDrawer.vue";
import AppModal from "../components/base/AppModal.vue";
import AppToast from "../components/base/AppToast.vue";
import AppSkeleton from "../components/base/AppSkeleton.vue";
import AiBlock from "../components/base/AiBlock.vue";
const drawer = ref(false),
  modal = ref(false),
  toast = ref("");
const name = ref(""),
  disabledValue = ref("自动保存的草稿"),
  city = ref("shanghai");
function printDesign() {
  window.print();
}
const palette = [
  { name: "引路蓝", token: "--brand", hex: "#2F55C8", note: "方向与行动" },
  { name: "墨海蓝", token: "--text-1", hex: "#16233A", note: "信息与秩序" },
  { name: "智能紫", token: "--ai", hex: "#6E56CF", note: "辅助与启发" },
  { name: "生长青", token: "--teal", hex: "#0E9F92", note: "进展与完成" },
  { name: "微光金", token: "--amber", hex: "#E9A23B", note: "提醒与关注" },
];
const theme = useThemeStore();
const measured = ref<{ token: string; value: string; minimum: number }[]>([]);
async function measureContrast() {
  await nextTick();
  const css = getComputedStyle(document.documentElement);
  const read = (token: string) => css.getPropertyValue(token).trim();
  measured.value = [
    "--text-1",
    "--text-2",
    "--text-3",
    "--brand-text",
    "--ai-text",
    "--success-text",
    "--warn-text",
    "--danger-text",
    "--info-text",
  ].map((token) => ({
    token,
    value: read(token),
    minimum: Math.min(
      ...["--bg-base", "--surface", "--surface-2"].map((bg) =>
        contrastRatio(read(token), read(bg)),
      ),
    ),
  }));
}
const measuredTheme = computed(() =>
  theme.theme === "dark" ? "B · 深色" : "A · 浅色",
);
onMounted(measureContrast);
watch(() => theme.theme, measureContrast, { flush: "post" });
</script>
<template>
  <div class="ds-page ui-scene ui-scene--service">
    <header class="ds-nav no-print">
      <RouterLink to="/login"><BrandMark :size="32" /></RouterLink>
      <div>
        <span>Lighthouse Design / 1.0</span><ThemeToggle /><AppButton
          variant="secondary"
          size="sm"
          @click="printDesign"
          ><AppIcon name="resume" :size="16" />打印规范</AppButton
        >
      </div>
    </header>
    <main id="main-content">
      <section class="ds-intro">
        <div>
          <p class="ds-overline">灯塔 · 设计语言</p>
          <h1>清晰，是最好的指引。</h1>
          <p class="intro-description" data-contrast="secondary">
            让每一条信息有层次，让每一次行动有方向。<br />为毕业生的探索，也为每一位同行者的支持而设计。
          </p>
        </div>
        <div class="intro-mark">
          <BrandMark :size="140" :wordmark="false" /><span
            >闻鸣知路，循引赴职</span
          >
        </div>
      </section>
      <section class="principles ds-section">
        <article>
          <span class="numeric">01 / CLARITY</span>
          <h3>清晰，不喧哗</h3>
          <p>用留白与字重建立层次，让重要的事情先被看见。</p>
        </article>
        <article>
          <span class="numeric">02 / TRUST</span>
          <h3>建议，有依据</h3>
          <p>来源、证据和决定权始终可见。智能辅助，不替人决策。</p>
        </article>
        <article>
          <span class="numeric">03 / PROGRESS</span>
          <h3>每一步，都算数</h3>
          <p>可见的状态、及时的反馈，让复杂流程变得从容。</p>
        </article>
      </section>
      <section class="ds-section">
        <div class="section-heading">
          <div>
            <span class="section-number numeric">01</span>
            <h2>色彩，有自己的职责。</h2>
          </div>
          <p>克制的主色，清晰的语义；文字与图形分别取色。</p>
        </div>
        <div class="palette">
          <article v-for="color in palette" :key="color.token">
            <div
              class="color-swatch"
              :style="{ background: `var(${color.token})` }"
            ></div>
            <div class="color-meta">
              <strong>{{ color.name }}</strong><span class="numeric">{{
                color.hex
              }}</span>
            </div>
            <small>{{ color.note }}</small>
          </article>
        </div>
        <p class="palette-note">
          当前主题的完整颜色在组件中实时呈现。正文对比度 ≥ 4.5:1，必要控件轮廓 ≥
          3:1；不是仅凭颜色区分状态。
        </p>
        <div class="contrast-scroll">
          <table aria-label="主题文字对比度实测" class="contrast-table">
            <caption>
              {{
                measuredTheme
              }}
              / WCAG sRGB · 三种主题底色的最小比值
            </caption>
            <thead>
              <tr>
                <th>文字令牌</th>
                <th>当前值</th>
                <th>最小对比度</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in measured" :key="row.token">
                <th scope="row" class="numeric">{{ row.token }}</th>
                <td class="numeric">{{ row.value }}</td>
                <td class="numeric" data-contrast-ratio>
                  {{ row.minimum.toFixed(2) }}:1
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="ds-section type-section">
        <div class="section-heading">
          <div>
            <span class="section-number numeric">02</span>
            <h2>排版，让阅读自然发生。</h2>
          </div>
          <p>中文系统字体 · 4px 间距基准 · 数据等宽对齐</p>
        </div>
        <div class="type-layout">
          <div class="type-specimen">
            <span class="sample-40">找到方向，也找到自己。</span
            ><span class="sample-24">好的机会，来自更清晰的表达。</span
            ><span class="sample-16"
              >你的经历值得被认真看见。保留事实，完善表达，迈出下一步。</span
            ><span class="sample-14"
              >辅助信息以克制的色彩呈现，不降低重要内容的可读性。</span
            >
          </div>
          <dl class="type-labels">
            <div>
              <dt class="numeric">40 / 600</dt>
              <dd>品牌叙事</dd>
            </div>
            <div>
              <dt class="numeric">24 / 600</dt>
              <dd>区块标题</dd>
            </div>
            <div>
              <dt class="numeric">16 / 400</dt>
              <dd>正文阅读</dd>
            </div>
            <div>
              <dt class="numeric">14 / 400</dt>
              <dd>控件与辅助</dd>
            </div>
          </dl>
        </div>
      </section>
      <section class="ds-section">
        <div class="section-heading">
          <div>
            <span class="section-number numeric">03</span>
            <h2>交互，始终给出回应。</h2>
          </div>
          <p>Hover / Focus / Loading / Disabled / Error</p>
        </div>
        <div class="component-row">
          <AppButton @click="toast = '交互已完成。这是一条组件演示提示。'"
            >主要操作<AppIcon name="arrow" :size="16" /></AppButton
          ><AppButton variant="secondary" @click="toast = '次级操作已完成。'"
            >次级操作</AppButton
          ><AppButton variant="ghost" @click="toast = '轻量操作已完成。'"
            >轻量操作</AppButton
          ><AppButton variant="danger" @click="modal = true">危险操作</AppButton
          ><AppButton loading>处理中</AppButton
          ><AppButton disabled>暂不可用</AppButton>
        </div>
        <div class="form-grid">
          <AppInput
            v-model="name"
            label="经历标题"
            placeholder="例如：校园服务平台前端开发"
            helper="真实、具体的表达，更有说服力。"
          /><AppInput
            label="项目名称"
            error="请填写项目名称，便于准确展示你的经历。"
            required
          /><AppSelect
            v-model="city"
            label="意向城市"
            :options="[
              { value: 'shanghai', label: '上海' },
              { value: 'hangzhou', label: '杭州' },
              { value: 'anywhere', label: '不限城市' },
            ]"
            helper="选择表达偏好，不推断你的籍贯。"
          /><AppInput
            v-model="disabledValue"
            label="禁用状态"
            disabled
            helper="说明不可用原因，而不是只让按钮变灰。"
          />
        </div>
        <div class="component-row">
          <AppTag tone="brand">进行中</AppTag
          ><AppTag tone="success">已完成</AppTag
          ><AppTag tone="warn">待确认</AppTag
          ><AppTag tone="danger">需处理</AppTag
          ><AppTag tone="ai">人工审校示例</AppTag><AppTag>尚未开始</AppTag>
        </div>
      </section>
      <section class="ds-section feedback-grid">
        <div>
          <div class="section-heading">
            <div>
              <span class="section-number numeric">04</span>
              <h2>智能，保持透明。</h2>
            </div>
          </div>
          <AiBlock
            mode="REPLAY"
            origin="CURATED"
            reason="此处为设计系统的人工审校示例，不是模型调用结果。"
            ><p>
              完善表达，不需要夸大经历。建议说明自己实际负责的任务、采取的行动，以及可以核实的结果。
            </p>
            <template #evidence
              ><p>
                依据：简历信息完整度与 STAR 文本线索。规则分不是招聘能力测评。
              </p></template
            ></AiBlock
          >
        </div>
        <div>
          <div class="section-heading">
            <div>
              <span class="section-number numeric">05</span>
              <h2>状态，也被认真设计。</h2>
            </div>
          </div>
          <AppCard
            title="正在准备内容"
            description="骨架与真实内容结构相近，减少等待中的跳动。"
            ><div class="skeleton-sample">
              <AppSkeleton width="40%" /><AppSkeleton /><AppSkeleton
                width="70%"
              /></div
          ></AppCard>
        </div>
      </section>
      <section class="ds-section overlay-demo">
        <div>
          <span class="section-number numeric">06</span>
          <h2>专注一件事，<br />再回到原来的位置。</h2>
          <p>
            抽屉与弹窗保留操作上下文。支持键盘焦点循环、Esc 关闭和焦点归还。
          </p>
          <div class="component-row no-print">
            <AppButton variant="secondary" @click="drawer = true"
              >打开抽屉演示<AppIcon name="arrow" :size="16" /></AppButton
            ><AppButton variant="ghost" @click="modal = true"
              >打开弹窗演示</AppButton
            >
          </div>
        </div>
        <div class="overlay-illustration" aria-hidden="true">
          <div class="mini-window">
            <span></span><span></span><span></span>
            <div></div>
            <div></div>
          </div>
          <div class="mini-drawer">
            <span></span>
            <div></div>
            <div></div>
            <div></div>
            <i></i>
          </div>
        </div>
      </section>
      <section class="ds-section brand-section">
        <div class="section-heading">
          <div>
            <span class="section-number numeric">07</span>
            <h2>路、鸣、引，汇成一个起点。</h2>
          </div>
          <p>虚线路径 · 求贤声波 · 引导星点</p>
        </div>
        <div class="brand-examples">
          <div>
            <BrandMark :size="40" /><small
              >默认横版 · 徽记安全留白不小于高度的 1/4</small
            >
          </div>
          <div class="brand-safe-space">
            <BrandMark :size="40" vertical /><small
              >竖版组合 · 登录与封面</small
            >
          </div>
          <div class="mark-sizes">
            <BrandMark :size="16" :wordmark="false" /><BrandMark
              :size="28"
              :wordmark="false"
            /><BrandMark :size="40" :wordmark="false" /><span class="numeric"
              >16 / 28 / 40</span
            >
          </div>
        </div>
        <p class="palette-note">不拉伸徽记，不给主名加渐变，不放大副标。</p>
      </section>
      <footer class="ds-footer">
        <span>路鸣职引 CareerPilot</span>
        <p>教学演示 · 全部虚构数据 · AI 只引导，不替人决策</p>
        <span>Lighthouse Design 1.0</span>
      </footer>
    </main>
    <AppDrawer data-scene="service" :open="drawer" title="一束清晰的指引" @close="drawer = false"
      ><p>
        这是覆盖式抽屉。大屏保留当前页面，小屏专注当前任务，不把密集信息硬挤进同一行。
      </p>
      <div class="drawer-sample">
        <AppTag tone="ai">REPLAY · 人工审校示例</AppTag>
        <h3>每一分，都有依据。</h3>
        <p>
          正式岗位解释会展示六维贡献、命中技能与待补信息。本示例不展示虚构分数。
        </p>
      </div>
      <template #footer
        ><AppButton @click="drawer = false">完成演示</AppButton></template
      ></AppDrawer
    >
    <AppModal data-scene="service" :open="modal" title="决定始终在你手中" @close="modal = false"
      ><p>
        这里只演示确认交互，不删除数据、不发起外部请求。真实危险操作必须说明影响并由你明确确认。
      </p>
      <template #footer
        ><AppButton variant="secondary" @click="modal = false">取消</AppButton
        ><AppButton
          @click="
            modal = false;
            toast = '确认交互已完成，没有业务数据被修改。';
          "
          >确认演示</AppButton
        ></template
      ></AppModal
    ><AppToast :message="toast" @close="toast = ''" />
  </div>
</template>
<style scoped>
.ds-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 48px;
}
.ds-nav {
  padding: 28px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  gap: 24px;
}
.ds-nav > a:hover {
  text-decoration: none;
}
.ds-nav > div {
  display: flex;
  align-items: center;
  gap: 20px;
}
.ds-nav > div > span {
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0;
}
.ds-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 72px 0 64px;
  gap: 40px;
}
.ds-overline {
  color: var(--brand-text);
  font-size: 14px;
  margin-bottom: 24px;
  letter-spacing: 0;
}
.ds-intro h1 {
  font-size: clamp(32px, 3.4vw, 48px);
  font-weight: 600;
  letter-spacing: 0;
}
.intro-description {
  color: var(--text-2);
  font-size: 16px;
  line-height: 1.9;
  margin-top: 24px;
}
.intro-mark {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  padding: 0 48px;
}
.intro-mark > span {
  font-size: 12px;
  letter-spacing: 0;
  color: var(--text-3);
}
.principles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 32px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  gap: 40px;
}
.principles article > span {
  font-size: 11px;
  color: var(--brand-text);
  letter-spacing: 0;
}
.principles h3 {
  font-size: 18px;
  margin-top: 16px;
}
.principles p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 12px;
  line-height: 1.8;
}
.ds-section {
  margin-bottom: 64px;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
}
.section-number {
  display: block;
  font-size: 12px;
  color: var(--brand-text);
  margin-bottom: 16px;
  letter-spacing: 0;
}
.section-heading > p {
  font-size: 13px;
  color: var(--text-2);
  text-align: right;
  max-width: 320px;
}
.palette {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.color-swatch {
  height: 120px;
  border-radius: 10px;
}
.color-meta {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.color-meta strong {
  font-size: 14px;
  font-weight: 600;
}
.color-meta span {
  color: var(--text-3);
  font-size: 11px;
}
.palette article > small {
  display: block;
  color: var(--text-2);
  margin-top: 6px;
  font-size: 12px;
}
.palette-note {
  color: var(--text-2);
  font-size: 12px;
  margin-top: 24px;
}
.type-section {
  padding: 40px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.type-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 40px;
}
.type-specimen {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.sample-40 {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 600;
  letter-spacing: 0;
}
.sample-24 {
  font-size: 24px;
  font-weight: 600;
}
.sample-16 {
  font-size: 16px;
}
.sample-14 {
  font-size: 14px;
  color: var(--text-2);
}
.type-labels {
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.type-labels div {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
  align-items: center;
}
.type-labels dd {
  margin-left: 12px;
}
.component-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px 32px;
  margin: 32px 0;
}
.feedback-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
.feedback-grid h2 {
  font-size: 20px;
}
.skeleton-sample {
  display: grid;
  gap: 16px;
}
.overlay-demo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 48px;
  background: var(--surface-2);
  padding: 48px;
  border-radius: var(--r-panel);
}
.overlay-demo h2 {
  font-size: 28px;
  line-height: 1.5;
}
.overlay-demo p {
  color: var(--text-2);
  font-size: 14px;
  margin: 20px 0 24px;
}
.overlay-illustration {
  position: relative;
  min-height: 240px;
}
.mini-window {
  width: 90%;
  height: 200px;
  border: 1px solid var(--border-control);
  border-radius: 10px;
  background: var(--surface);
  position: absolute;
  left: 0;
  top: 0;
  padding: 20px;
  box-shadow: var(--sh-2);
}
.mini-window > span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-control);
  margin-right: 5px;
}
.mini-window > div {
  width: 55%;
  height: 8px;
  background: var(--surface-2);
  margin-top: 28px;
  border-radius: 4px;
}
.mini-window > div + div {
  margin-top: 16px;
  width: 45%;
}
.mini-drawer {
  width: 50%;
  height: 220px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--sh-3);
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 24px;
}
.mini-drawer > span {
  display: block;
  height: 6px;
  width: 65%;
  background: var(--brand);
  border-radius: 3px;
  margin-bottom: 32px;
}
.mini-drawer > div {
  height: 6px;
  background: var(--surface-2);
  border-radius: 3px;
  margin-bottom: 12px;
}
.mini-drawer > div:nth-of-type(2) {
  width: 80%;
}
.mini-drawer > i {
  display: block;
  width: 50%;
  height: 24px;
  border-radius: 4px;
  background: var(--brand);
  margin-top: 28px;
}
.brand-examples {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 40px;
  padding: 32px 0;
}
.brand-safe-space {
  padding: 20px;
  border: 1px dashed var(--border-control);
}
.contrast-scroll {
  overflow-x: auto;
  margin-top: 24px;
}
.contrast-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
}
.contrast-table caption {
  text-align: left;
  padding: 12px 0;
  color: var(--text-2);
}
.contrast-table th,
.contrast-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.contrast-table th {
  font-weight: 500;
}
.brand-examples small {
  display: block;
  margin-top: 20px;
  color: var(--text-2);
  font-size: 12px;
}
.mark-sizes {
  display: flex;
  align-items: center;
  gap: 28px;
}
.mark-sizes > span {
  font-size: 12px;
  color: var(--text-3);
}
.ds-footer {
  border-top: 1px solid var(--border);
  padding: 28px 0;
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  color: var(--text-3);
  font-size: 11px;
}
.drawer-sample {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
.drawer-sample h3 {
  margin: 24px 0 16px;
}
.drawer-sample p {
  color: var(--text-2);
  font-size: 14px;
}
@media (max-width: 1023px) {
  .ds-page {
    padding: 0 32px;
  }
  .intro-mark {
    padding: 0;
  }
  .intro-mark :deep(svg) {
    width: 100px;
    height: 100px;
  }
  .intro-description {
    font-size: 14px;
  }
  .type-labels {
    display: none;
  }
  .type-layout {
    display: block;
  }
  .overlay-demo {
    padding: 32px;
    gap: 32px;
  }
  .ds-nav > div > span {
    display: none;
  }
  .color-meta {
    flex-direction: column;
  }
  .section-heading > p {
    max-width: 220px;
  }
}
@media (max-width: 767px) {
  .ds-page {
    padding: 0 24px;
  }
  .ds-nav {
    padding: 20px 0;
  }
  .ds-nav > div {
    gap: 12px;
  }
  .ds-nav :deep(.brand-wordmark span) {
    display: none;
  }
  .ds-nav :deep(.brand-wordmark strong) {
    font-size: 16px;
  }
  .ds-nav .app-button {
    display: none;
  }
  .ds-intro {
    padding: 48px 0 40px;
  }
  .ds-intro h1 {
    font-size: 28px;
  }
  .intro-mark {
    display: none;
  }
  .intro-description br {
    display: none;
  }
  .principles {
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 28px 0;
  }
  .principles h3 {
    margin-top: 8px;
  }
  .principles p {
    margin-top: 8px;
  }
  .ds-section {
    margin-bottom: 40px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }
  .section-heading h2 {
    font-size: 20px;
  }
  .section-heading > p {
    text-align: left;
    max-width: none;
    font-size: 12px;
  }
  .palette {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .color-swatch {
    height: 72px;
  }
  .color-meta strong {
    font-size: 11px;
  }
  .color-meta span {
    display: none;
  }
  .palette article > small {
    display: none;
  }
  .sample-40 {
    font-size: 24px;
  }
  .sample-24 {
    font-size: 20px;
  }
  .sample-16 {
    font-size: 14px;
  }
  .form-grid,
  .feedback-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .overlay-demo {
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .overlay-demo h2 {
    font-size: 24px;
  }
  .overlay-illustration {
    display: none;
  }
  .brand-examples {
    flex-direction: column;
    align-items: flex-start;
  }
  .mark-sizes {
    gap: 20px;
  }
  .ds-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
