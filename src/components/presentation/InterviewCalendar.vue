<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {beijingDay,calendarMonth} from '../../presentation/interview-calendar';
import {businessNow} from '../../services/runtime';
const props=defineProps<{events:readonly {id:string;scheduledAt:string;name:string;status:string}[];date:string}>();
const month=ref((props.date||beijingDay(businessNow())).slice(0,7));
watch(()=>props.date,date=>{if(date)month.value=date.slice(0,7);});
const days=computed(()=>calendarMonth(month.value+'-01',props.events));
function shift(delta:number){const [y,m]=month.value.split('-').map(Number);month.value=new Date(Date.UTC(y!,m!-1+delta,1)).toISOString().slice(0,7);}
</script>
<template>
  <section class="surface interview-calendar" aria-label="面试月历">
    <header><h2>面试日程 · {{ month.replace('-', '年') }}月</h2><nav aria-label="切换日历月份"><button type="button" aria-label="上个月" @click="shift(-1)">‹</button><button type="button" aria-label="下个月" @click="shift(1)">›</button></nav></header>
    <div class="calendar-grid"><span v-for="weekday in ['一','二','三','四','五','六','日']" :key="weekday" class="weekday">{{ weekday }}</span>
      <div v-for="cell in days" :key="cell.date" :data-calendar-date="cell.date" :class="['calendar-day',{'outside':!cell.inMonth,'has-events':cell.events.length,'selected':cell.date===date}]"><span>{{ cell.day }}</span><small v-for="event in cell.events.slice(0,2)" :key="event.id">{{ event.name }}</small><small v-if="cell.events.length>2">另有 {{ cell.events.length-2 }} 场</small></div>
    </div><p class="caption">北京时间 · 日历只读呈现当前筛选结果，邀约与调整请进入原候选人流程。</p>
  </section>
</template>
<style scoped>
.interview-calendar{padding:24px;min-width:0}.interview-calendar header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}.interview-calendar h2{font-size:20px}.interview-calendar nav{display:flex;gap:6px}.interview-calendar button{width:40px;height:40px;border:1px solid var(--border-control);border-radius:8px;background:var(--surface);color:var(--brand-text);font-size:24px}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.weekday{text-align:center;font-size:12px;padding:10px 0;color:var(--text-2)}.calendar-day{min-height:95px;min-width:0;padding:9px 6px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface-2)}.calendar-day.outside{opacity:.4}.calendar-day.has-events{background:var(--brand-soft);border-color:var(--border-control)}.calendar-day.selected{outline:2px solid var(--brand-text);outline-offset:-2px}.calendar-day small{display:block;font-size:10px;color:var(--brand-text);overflow-wrap:anywhere;margin-top:6px;line-height:1.5}.caption{margin-top:18px;line-height:1.9}@media(max-width:767px){.interview-calendar{padding:17px 12px}.interview-calendar header{align-items:start}.interview-calendar h2{font-size:17px}.calendar-grid{gap:3px}.calendar-day{padding:6px 3px;min-height:69px;font-size:11px}.calendar-day small{font-size:9px}.interview-calendar button{width:36px}}
</style>
