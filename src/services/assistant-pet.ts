export interface PetPoint {x:number;y:number}
export interface PetSize {width:number;height:number}
export interface PetSettings extends PetPoint {size:number;paused:boolean;roam:boolean}
export interface PetPress {pointerId:number;start:PetPoint;latest:PetPoint;started:number;dragging:boolean;moved:boolean}
export interface PetAnimationPools {idle:string[];turn:string[];categories:{id:string;weight:number;actions:string[]}[]}
export function clampPetPosition(point:PetPoint,viewport:PetSize,size:PetSize):PetPoint{
  const axis=(value:number,available:number,used:number)=>Math.min(Math.max(8,Number.isFinite(value)?value:8),Math.max(8,available-used-8));
  return {x:axis(point.x,viewport.width,size.width),y:axis(point.y,viewport.height,size.height)};
}
export function restorePetSettings(raw:string|null,viewport:PetSize):PetSettings{
  let value:Record<string,unknown>={};
  try{const parsed=JSON.parse(raw??'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value=parsed;}catch{/* Corrupt local preferences never hide the launcher. */}
  const size=typeof value.size==='number'&&Number.isFinite(value.size)&&value.size>=100&&value.size<=190?value.size:150;
  const x=typeof value.x==='number'&&Number.isFinite(value.x)?value.x:viewport.width-size-24;
  const y=typeof value.y==='number'&&Number.isFinite(value.y)?value.y:viewport.height-(size+36)-24;
  return {...clampPetPosition({x,y},viewport,{width:size,height:size+36}),size,paused:value.paused===true,roam:value.roam===true};
}
export function petVisualState(state:{dragging:boolean;busy:boolean;responding:boolean;error:boolean;sleeping:boolean}):string{
  return state.dragging?'drag':state.responding?'reply':state.busy?'thinking':state.error?'error':state.sleeping?'sleep':'idle';
}
export function beginPetPress(pointerId:number,start:PetPoint,started:number):PetPress{return {pointerId,start,latest:start,started,dragging:false,moved:false};}
export function movePetPress(press:PetPress,point:PetPoint,now:number):PetPress{
  return {...activatePetDrag(press,now),latest:point,moved:press.moved||Math.hypot(point.x-press.start.x,point.y-press.start.y)>5};
}
export function finishPetPress(press:PetPress,now:number,cancelled=false){return {click:!cancelled&&!press.dragging&&!press.moved&&now-press.started<300};}
export function activatePetDrag(press:PetPress,now:number):PetPress{return {...press,dragging:press.dragging||now-press.started>=300};}
export function choosePetIdle(pools:PetAnimationPools,random:number,current:string){
  const roll=Math.max(0,Math.min(.999999,random));
  if(roll<.1)return pools.idle[0]??current;
  if(roll<.15)return pools.turn[0]??pools.idle[0]??current;
  const total=pools.categories.reduce((sum,category)=>sum+category.weight,0);
  let cursor=(roll-.15)/.85*total;
  for(const category of pools.categories){
    if(cursor<category.weight){const alternatives=category.actions.filter(name=>name!==current);return alternatives[Math.floor((cursor/category.weight)*alternatives.length)]??category.actions[0]??pools.idle[0]??current;}
    cursor-=category.weight;
  }
  return pools.idle[0]??current;
}
