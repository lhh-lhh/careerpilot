<script setup lang="ts">
/* global HTMLVideoElement, HTMLSelectElement, PointerEvent, MouseEvent, MediaQueryList */
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {activatePetDrag,beginPetPress,choosePetIdle,clampPetPosition,finishPetPress,movePetPress,petVisualState,restorePetSettings} from '../../services/assistant-pet';
import type {PetAnimationPools,PetPoint,PetPress} from '../../services/assistant-pet';
const props=defineProps<{open:boolean;busy:boolean;responding:boolean;error:boolean}>();
const emit=defineEmits<{toggle:[]}>();
interface AnimationConfig extends PetAnimationPools {drag:string[];clicks:string[];moves:{actions:{name:string}[]};events:{whisper:string[];workStatus:string[];balance:string[]};sleep:{start:string[];loop:string[];end:string[]}[];baifan:string[]}
const base='/vendor/dsh-pet/',storageKey='careerpilot.assistant-pet.v1';
const viewport=ref({width:window.innerWidth,height:window.innerHeight});
let saved:string|null=null;try{saved=localStorage.getItem(storageKey);}catch{/* Private mode may deny preferences. */}
const settings=ref(restorePetSettings(saved,viewport.value)),menu=ref(false),dragging=ref(false),sleeping=ref(false),reduced=ref(false),hidden=ref(document.hidden),unsupported=ref(false),failed=ref(false),config=ref<AnimationConfig|null>(null),selected=ref(''),current=ref('待机呼吸休闲'),front=ref(0),ready=ref(false),sources=ref(['','']),videos=ref<HTMLVideoElement[]>([]),mirrored=ref(false);
// A new preference only controls presentation. Existing saved drag coordinates remain authoritative.
let dockPreference:string|null=null;try{dockPreference=localStorage.getItem('careerpilot.assistant-pet.docked');}catch{/* Optional preference. */}
const docked=ref(dockPreference==='true'||dockPreference===null&&saved===null),launcher=ref<HTMLElement|null>(null);
if(dockPreference===null&&saved===null){try{localStorage.setItem('careerpilot.assistant-pet.docked','true');}catch{/* Optional preference. */}}
function dock(){docked.value=true;menu.value=false;try{localStorage.setItem('careerpilot.assistant-pet.docked','true');}catch{/* Optional preference. */}}
function undock(){if(!docked.value)return;const box=launcher.value?.getBoundingClientRect();docked.value=false;if(box)place({x:box.x,y:box.y});try{localStorage.setItem('careerpilot.assistant-pet.docked','false');}catch{/* Optional preference. */}}
let press:PetPress|null=null,origin:PetPoint={x:0,y:0},capture:HTMLButtonElement|null=null,pressTimer:ReturnType<typeof setTimeout>|undefined,roamTimer:ReturnType<typeof setTimeout>|undefined,lastRequestHadText=false,transient='',suppressClick=false;
const motionPaused=computed(()=>settings.value.paused||reduced.value||hidden.value);
const state=computed(()=>petVisualState({dragging:dragging.value,busy:props.busy,responding:props.responding,error:props.error,sleeping:sleeping.value}));
const rootStyle=computed(()=>({position:docked.value?'relative' as const:'fixed' as const,left:docked.value?'0':`${settings.value.x}px`,top:docked.value?'0':`${settings.value.y}px`,width:`${settings.value.size}px`,height:`${settings.value.size+36}px`,'--pet-size':`${settings.value.size}px`}));
const groups=computed(()=>{const a=config.value;return a?[{id:'待机与拖拽',weight:0,actions:[...a.idle,...a.drag]},...a.categories,{id:'转向与移动',weight:0,actions:[...a.turn,...a.moves.actions.map(row=>row.name)]},{id:'点击回应',weight:0,actions:a.clicks},{id:'工作与对话',weight:0,actions:[...a.events.workStatus,...a.events.whisper]},{id:'睡眠',weight:0,actions:a.sleep.flatMap(row=>[...row.start,...row.loop,...row.end])},{id:'开饭动作',weight:0,actions:a.baifan},{id:'其他原动画',weight:0,actions:a.events.balance}]:[];});
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings.value));}catch{/* Preferences are optional. */}}
function place(point:PetPoint){const bounded=clampPetPosition(point,viewport.value,{width:settings.value.size,height:settings.value.size+36});settings.value={...settings.value,...bounded};}
function resize(){viewport.value={width:window.innerWidth,height:window.innerHeight};place(settings.value);persist();}
function reset(){undock();settings.value={...settings.value,x:viewport.value.width-settings.value.size-24,y:viewport.value.height-settings.value.size-60};resize();menu.value=false;}
function changeSize(event:Event){settings.value.size=Number((event.target as HTMLSelectElement).value);resize();}
function mediaState(){for(const [index,video] of videos.value.entries()){if(index!==front.value||motionPaused.value)video.pause();else void video.play().catch(()=>{failed.value=true;});}}
async function play(name:string){
 if(!name||unsupported.value||failed.value)return;
 const target=ready.value?1-front.value:front.value;current.value=name;
 sources.value[target]=`${base}webm/${encodeURIComponent(name)}.webm`;
 await nextTick();videos.value[target]?.load();
}
function loaded(index:number){if(!sources.value[index])return;front.value=index;ready.value=true;mediaState();}
function choose(pool:string[]|undefined){return pool?.[Math.floor(Math.random()*pool.length)]??'待机呼吸休闲';}
function nextAnimation(){
 const a=config.value;if(!a)return;
 if(transient){const completed=transient;transient='';void play(completed==='error'||completed==='success'?choose(a.idle):forState());return;}
 if(state.value==='error'){void play(choose(a.idle));return;}
 if(state.value!=='idle'){void play(forState());return;}
 if(menu.value||props.open){void play(choose(a.idle));return;}
 const name=choosePetIdle(a,Math.random(),current.value);
 if(a.turn.includes(name))mirrored.value=!mirrored.value;
 // Text-bearing animations must never be mirrored.
 if(a.categories.some(group=>group.id==='文字'&&group.actions.includes(name)))mirrored.value=false;
 void play(name);
}
function forState(){const a=config.value;if(!a)return '待机呼吸休闲';return state.value==='drag'?choose(a.drag):state.value==='reply'?choose(a.events.whisper):state.value==='thinking'?a.events.workStatus[0]!:state.value==='error'?a.events.workStatus[5]!:state.value==='sleep'?choose(a.sleep[0]?.loop):choose(a.idle);}
watch(state,()=>{transient='';void play(forState());});
watch(()=>props.responding,value=>{if(value)lastRequestHadText=true;});
watch(()=>props.busy,(value,previous)=>{if(value){lastRequestHadText=props.responding;}else if(previous&&lastRequestHadText&&!props.error){transient='success';void play(config.value?.events.workStatus[4]??'工作状态-雀跃庆祝');}});
watch(motionPaused,()=>void nextTick(mediaState));
watch(()=>props.error,value=>{if(value){transient='error';void play(config.value?.events.workStatus[5]??'工作状态-垂头叹气冒汗');}});
function action(name:string){selected.value=name;transient='action';sleeping.value=false;mirrored.value=false;void play(name);menu.value=false;}
function toggleSleep(){sleeping.value=!sleeping.value;transient='sleep-transition';void play(choose(sleeping.value?config.value?.sleep[0]?.start:config.value?.sleep[0]?.end));menu.value=false;}
function toggle(){if(sleeping.value){sleeping.value=false;transient='wake';void play(choose(config.value?.sleep[0]?.end));}else{transient='click';void play(choose(config.value?.clicks));}emit('toggle');}
function clearPress(cancelled=true,event?:PointerEvent){
 clearTimeout(pressTimer);pressTimer=undefined;
 if(!press)return;
 const result=finishPetPress(press,window.performance.now(),cancelled);
 suppressClick=true;
 const previousPress=press,previousCapture=capture;press=null;capture=null;
 if(previousCapture?.hasPointerCapture(previousPress.pointerId))previousCapture.releasePointerCapture(previousPress.pointerId);
 dragging.value=false;persist();
 if(result.click&&!event?.defaultPrevented)toggle();
}
function down(event:PointerEvent){
 if(event.button!==0||press)return;
 menu.value=false;capture=event.currentTarget as HTMLButtonElement;press=beginPetPress(event.pointerId,{x:event.clientX,y:event.clientY},window.performance.now());origin={x:settings.value.x,y:settings.value.y};capture.setPointerCapture(event.pointerId);
 pressTimer=setTimeout(()=>{if(press){undock();origin={x:settings.value.x,y:settings.value.y};press=activatePetDrag(press,window.performance.now()+1);dragging.value=press.dragging;}},300);
}
function move(event:PointerEvent){if(!press||event.pointerId!==press.pointerId)return;press=movePetPress(press,{x:event.clientX,y:event.clientY},window.performance.now());dragging.value=press.dragging;if(press.dragging){place({x:origin.x+event.clientX-press.start.x,y:origin.y+event.clientY-press.start.y});event.preventDefault();}}
function up(event:PointerEvent){if(press&&event.pointerId===press.pointerId)clearPress(false,event);}
function click(event:MouseEvent){if(event.detail===0){suppressClick=false;toggle();return;}if(suppressClick){suppressClick=false;event.preventDefault();}}
function keyboard(event:KeyboardEvent){
 const directions:Record<string,PetPoint>={ArrowLeft:{x:-16,y:0},ArrowRight:{x:16,y:0},ArrowUp:{x:0,y:-16},ArrowDown:{x:0,y:16}};
 const shift=directions[event.key];if(shift){event.preventDefault();undock();place({x:settings.value.x+shift.x,y:settings.value.y+shift.y});persist();}else if(event.key==='Escape')menu.value=false;
}
function blurred(){clearPress();}
function visibility(){hidden.value=document.hidden;if(hidden.value)clearPress();}
function roam(){
 clearTimeout(roamTimer);
 roamTimer=setTimeout(()=>{if(!docked.value&&settings.value.roam&&!motionPaused.value&&!props.open&&!props.busy&&!dragging.value&&!press&&!menu.value&&!sleeping.value&&document.activeElement?.getAttribute('data-pet-control')!=='true'){
  place({x:settings.value.x+(Math.random()>.5?28:-28),y:settings.value.y});transient='roam';void play(choose(config.value?.moves.actions.map(row=>row.name)));persist();
 }roam();},14000);
}
let mediaQuery:MediaQueryList|undefined;
function preference(){reduced.value=mediaQuery?.matches??false;}
onMounted(async()=>{
 const ua=navigator.userAgent;unsupported.value=/iPhone|iPad|iPod/i.test(ua)||(/Mac/i.test(navigator.platform||ua)&&!/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua));
 mediaQuery=window.matchMedia('(prefers-reduced-motion: reduce)');preference();mediaQuery.addEventListener('change',preference);
 window.addEventListener('resize',resize);window.addEventListener('blur',blurred);document.addEventListener('visibilitychange',visibility);resize();roam();
 try{const response=await fetch(base+'animations.json');if(!response.ok)throw Error();const value=await response.json();config.value=value.animations;await play(choose(config.value?.idle));}catch{failed.value=true;}
});
onBeforeUnmount(()=>{clearPress();clearTimeout(roamTimer);window.removeEventListener('resize',resize);window.removeEventListener('blur',blurred);document.removeEventListener('visibilitychange',visibility);mediaQuery?.removeEventListener('change',preference);for(const video of videos.value)video.pause();});
</script>
<template>
 <div :class="['pet-stage',{'is-docked':docked}]" :style="{'--pet-size':`${settings.size}px`}">
 <section v-if="docked" class="assistant-safe-dock" data-pet-dock><div><strong>AI 助手 · 安全停靠位</strong><p>单击交谈，长按可拖动。手动放置后可从设置返回此处。</p><button type="button" @click="toggle">打开AI助手</button></div></section>
 <div ref="launcher" class="pet-launcher" :class="{dragging,roaming:settings.roam&&!dragging,docked}" :style="rootStyle" :data-state="state" :data-docked="String(docked)" data-pet-launcher>
  <div class="pet-art" :class="{mirrored}">
   <img v-if="!ready||failed||unsupported" class="pet-poster" :src="base+'poster.png'" alt="" draggable="false">
   <template v-if="!failed&&!unsupported"><video v-for="index in [0,1]" :key="index" :ref="el=>{if(el)videos[index]=el as HTMLVideoElement}" class="pet-video" :class="{'is-front':ready&&front===index}" :src="sources[index]||undefined" muted playsinline preload="auto" aria-hidden="true" @canplay="loaded(index)" @ended="()=>{if(index===front)nextAnimation()}" @error="failed=true"></video></template>
  </div>
  <button class="pet-hit" data-pet-control="true" aria-label="AI Chatbot · 长按拖动" :aria-expanded="open" aria-controls="global-assistant" title="单击打开助手 · 长按拖动 · 方向键移动 · 右键设置" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="clearPress()" @lostpointercapture="()=>{if(press)clearPress()}" @click="click" @keydown="keyboard" @contextmenu.prevent="menu=!menu"><span class="pet-nameplate">AI Chatbot<span class="pet-status" :class="{busy}"></span></span></button>
  <button class="pet-settings" data-pet-control="true" aria-label="宠物动作与设置" :aria-expanded="menu" @click="menu=!menu">···</button>
  <span class="pet-hint">{{ dragging?'松手放在这里':busy?'DeepSeek 正在处理':'单击交谈 · 长按拖动' }}</span>
 </div>
 </div>
 <section v-if="menu" class="pet-menu" aria-label="宠物动作与设置">
  <header><strong>AI Chatbot · dsh-pet</strong><button aria-label="关闭宠物设置" @click="menu=false">×</button></header>
  <div class="pet-menu-actions"><button @click="toggle();menu=false">{{ open?'收起助手':'打开助手' }}</button><button @click="dock">停靠安全位</button><button @click="reset">回到右下角</button><button @click="toggleSleep">{{ sleeping?'叫醒宠物':'睡一会儿' }}</button></div>
  <label>角色大小<select :value="settings.size" @change="changeSize"><option :value="120">小</option><option :value="150">标准</option><option :value="180">大</option></select></label>
  <label class="pet-check"><input v-model="settings.paused" type="checkbox" @change="persist">暂停动画</label><label class="pet-check"><input v-model="settings.roam" type="checkbox" @change="persist">慢速漫游（聊天关闭时）</label>
  <label>播放原版动作<select v-model="selected" @change="action(selected)"><option value="" disabled>选择一个动作</option><optgroup v-for="group in groups" :key="group.id" :label="group.id"><option v-for="name in group.actions" :key="name" :value="name">{{ name }}</option></optgroup></select></label>
  <p v-if="unsupported" class="pet-license">当前WebKit使用完整静态角色；透明动画请使用Chrome、Edge或Firefox。</p><p v-if="reduced" class="pet-license">已遵循系统“减少动态效果”设置。</p>
  <details><summary>来源与许可 · 非商业学习使用</summary><p class="pet-license">角色动画来自 <a href="https://github.com/PC2005-cloud/dsh-pet" target="_blank" rel="noopener noreferrer">PC2005-cloud/dsh-pet</a>。原型“溟月”：<a href="https://space.bilibili.com/4456176" target="_blank" rel="noopener noreferrer">上善无形</a>；女仆鲸鱼娘设计：<a href="https://space.bilibili.com/4168597" target="_blank" rel="noopener noreferrer">ZipZipPipe</a>。社区二创，非DeepSeek官方形象。</p><p class="pet-license">代码MIT；素材 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>，署名·非商业·相同方式共享。此处仅改造网页交互并保留原动画，不接入上游独立后端。动画不会调用AI或产生费用。</p><a :href="base+'ATTRIBUTION.txt'" target="_blank">查看本地来源说明</a></details>
 </section>
</template>
<style scoped>
.pet-stage{display:contents}.pet-stage.is-docked{display:grid;grid-template-columns:210px minmax(0,1fr);align-items:center;gap:24px;margin:0 30px 28px 248px;padding:22px 24px;border:1px solid var(--border);border-radius:16px;background:var(--surface);color:var(--text-1);min-width:0}.assistant-safe-dock{grid-column:2;grid-row:1;font-size:13px;min-width:0}.assistant-safe-dock p{line-height:1.9;color:var(--text-2);margin:8px 0 12px}.assistant-safe-dock button{min-height:44px;padding:10px 16px;border:1px solid var(--border-control);background:var(--brand-soft);color:var(--brand-text);border-radius:9px}.pet-launcher.docked{grid-column:1;grid-row:1;justify-self:center;overflow:clip}@media(max-width:1023px){.pet-stage.is-docked{margin-left:193px}}@media(max-width:767px){.pet-stage.is-docked{margin:0 14px 22px;padding:18px;grid-template-columns:minmax(0,1fr);gap:10px;text-align:center}.assistant-safe-dock{grid-column:1;grid-row:2}.pet-launcher.docked{grid-row:1}}
.pet-launcher{position:fixed;z-index:1102;pointer-events:none;user-select:none;touch-action:none}.pet-art{position:absolute;left:0;top:0;width:var(--pet-size);height:var(--pet-size);pointer-events:none;transform-origin:50% 60%}.pet-art.mirrored{transform:scaleX(-1)}.dragging .pet-art{transform:rotate(-4deg) scale(.97,1.03)}.pet-video{position:absolute;width:calc(var(--pet-size)*640/285);height:calc(var(--pet-size)*360/285);max-width:none;left:calc(var(--pet-size)*(1 - 640/285)/2);top:calc(var(--pet-size)*-50/285);object-fit:contain;pointer-events:none;opacity:0;transition:opacity .12s}.pet-video.is-front{opacity:1}.pet-poster{position:absolute;width:100%;height:100%;object-fit:contain;pointer-events:none}.pet-hit{position:absolute;inset:0 0 22px;pointer-events:auto;cursor:grab;background:transparent;border:0;border-radius:42%;padding:0;touch-action:none;-webkit-user-select:none;-webkit-touch-callout:none}.pet-hit:focus-visible{outline:3px solid var(--brand-text);outline-offset:3px}.dragging .pet-hit{cursor:grabbing}.pet-nameplate{position:absolute;bottom:0;left:50%;transform:translateX(-50%);white-space:nowrap;display:flex;align-items:center;gap:6px;background:#f9fcffed;color:#233d67;border:1px solid #b6c7df;border-radius:8px;padding:5px 9px;font:700 12px/1.2 system-ui;box-shadow:0 3px 10px #19315818}.pet-status{width:5px;height:5px;border-radius:50%;background:#4d9f95}.pet-status.busy{background:#c28e42}.pet-settings{position:absolute;right:0;bottom:29px;width:24px;height:24px;pointer-events:auto;border:1px solid var(--border);border-radius:50%;background:var(--surface);color:var(--text-2);font-size:18px;line-height:15px;cursor:pointer}.pet-hint{position:absolute;bottom:0;left:50%;transform:translateX(-50%);white-space:nowrap;color:var(--text-2);font-size:10px;text-shadow:0 1px 3px var(--surface)}.pet-menu{position:fixed;z-index:1104;right:16px;bottom:16px;width:min(330px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text-1);box-shadow:var(--sh-2);font-size:13px}.pet-menu header{display:flex;align-items:center;justify-content:space-between;gap:10px}.pet-menu header button{border:0;font-size:22px;background:transparent;color:var(--text-2)}.pet-menu-actions{display:flex;gap:7px;flex-wrap:wrap;margin:15px 0}.pet-menu-actions button{padding:7px 9px;background:var(--brand-soft);color:var(--brand-text);border:0;border-radius:7px;cursor:pointer}.pet-menu label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:13px 0}.pet-menu select{max-width:180px;min-height:34px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-1);padding:4px}.pet-menu .pet-check{justify-content:flex-start}.pet-menu details{border-top:1px solid var(--border);padding-top:14px}.pet-license{font-size:11px;line-height:1.8;color:var(--text-2)}.pet-menu a{color:var(--brand-text)}@media(prefers-reduced-motion:reduce){.pet-video{transition:none}.pet-art{transition:none}}
</style>
<style scoped>
/* Keep the transparent corners click-through, especially over bottom-right forms. */
.pet-hit{clip-path:polygon(32% 0,75% 0,88% 22%,92% 72%,100% 86%,100% 100%,0 100%,0 86%,12% 72%,18% 25%)}
</style>
