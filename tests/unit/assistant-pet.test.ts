import { describe, expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import { clampPetPosition, restorePetSettings, petVisualState, beginPetPress, movePetPress, finishPetPress, activatePetDrag, choosePetIdle } from '../../src/services/assistant-pet';

describe('assistant pet viewport and preferences', () => {
  it('keeps the complete interactive character inside each viewport edge', () => {
    expect(clampPetPosition({x:-20,y:900},{width:390,height:700},{width:120,height:180})).toEqual({x:8,y:512});
    expect(clampPetPosition({x:900,y:-20},{width:390,height:700},{width:120,height:180})).toEqual({x:262,y:8});
  });
  it('rejects corrupt and nonfinite stored positions and bounds resized ones', () => {
    expect(restorePetSettings('{broken',{width:390,height:700}).size).toBe(150);
    expect(restorePetSettings('{"x":"50","y":null,"size":9999}',{width:390,height:700})).toMatchObject({size:150,roam:false,paused:false});
    expect(restorePetSettings('{"x":2000,"y":-100,"size":120,"roam":true}',{width:390,height:700})).toMatchObject({x:262,y:8,size:120,roam:true});
  });
});
describe('assistant pet pointer interaction', () => {
  it('does not activate drag before300ms and does at300ms', () => {
    const press=beginPetPress(7,{x:90,y:80},100);
    expect(activatePetDrag(press,399).dragging).toBe(false);
    expect(activatePetDrag(press,400).dragging).toBe(true);
  });
  it('a quick stationary press opens chat but movement or long press never does', () => {
    const press=beginPetPress(7,{x:90,y:80},100);
    expect(finishPetPress(press,200).click).toBe(true);
    expect(finishPetPress(movePetPress(press,{x:101,y:80},200),220).click).toBe(false);
    expect(finishPetPress(press,401).click).toBe(false);
    expect(finishPetPress(activatePetDrag(press,400),430).click).toBe(false);
  });
  it('cancelled pointer never toggles chat', () => {
    expect(finishPetPress(beginPetPress(1,{x:10,y:20},0),30,true).click).toBe(false);
  });
});
describe('assistant pet animation priority', () => {
  it('drag overrides all request states and streaming overrides waiting', () => {
    expect(petVisualState({dragging:true,busy:true,responding:true,error:true,sleeping:true})).toBe('drag');
    expect(petVisualState({dragging:false,busy:true,responding:true,error:false,sleeping:false})).toBe('reply');
    expect(petVisualState({dragging:false,busy:true,responding:false,error:false,sleeping:true})).toBe('thinking');
  });
  it('does not schedule event animations as random idle actions', () => {
    const animations={idle:['breath'],turn:['turn'],categories:[{id:'play',weight:20,actions:['puzzle']}],events:{workStatus:['thinking']}};
    expect(choosePetIdle(animations,0,'breath')).toBe('breath');
    expect(choosePetIdle(animations,.99,'breath')).toBe('puzzle');
  });
});

it('bundles every pinned animation with categories, hashes and both license texts',()=>{
  const root=new URL('../../public/vendor/dsh-pet/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8')) as {commit:string;animationCount:number;files:{path:string;bytes:number;sha256:string;categories?:string[]}[]};
  expect(manifest.commit).toBe('572cf0ff68e7ffbe76afe4ba5fd8ae99ec7e0733');
  const animations=manifest.files.filter(row=>row.path.endsWith('.webm'));
  expect(animations).toHaveLength(manifest.animationCount);
  expect(animations).toHaveLength(114);
  expect(animations.every(row=>row.categories?.length)).toBe(true);
  expect(manifest.files.map(row=>row.path)).toEqual(expect.arrayContaining(['LICENSE-MIT.txt','LICENSE-CC-BY-NC-SA-4.0.txt','upstream-config.jsonc','animations.json','ATTRIBUTION.txt']));
  for(const row of manifest.files){
    const bytes=readFileSync(new URL(row.path,root));
    expect(bytes.length,row.path).toBe(row.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'),row.path).toBe(row.sha256);
  }
});
