import {expect,it} from 'vitest';
import {normalizeMatchPreferences,shouldConfirmVoiceLeave,LatestOperation} from '../../src/services/workbench-state';
import {prepareOptimizationDraft} from '../../src/domain/resume/optimization-draft';
import type {Resume} from '../../src/types/entities';
it('cleared optional salary means no salary constraint, not an invalid API payload',()=>{
 expect(normalizeMatchPreferences({role:' 前端 ',city:' 上海 ',industry:'',salaryMin:'',strictCity:true})).toEqual({role:'前端',city:'上海',industry:'',salaryMin:null,strictCity:true});
 expect(normalizeMatchPreferences({role:'',city:'',industry:'',salaryMin:12000,strictCity:false}).salaryMin).toBe(12000);
});
it('completed interview can navigate to its report without a second leave confirmation',()=>{
 expect(shouldConfirmVoiceLeave('completed',false,true,'未提交')).toBe(false);
 expect(shouldConfirmVoiceLeave('active',false,true,'')).toBe(true);
 expect(shouldConfirmVoiceLeave('active',false,false,'草稿')).toBe(true);
 expect(shouldConfirmVoiceLeave('active',false,false,'')).toBe(false);
});
it('optimization binds its draft to the source captured before generation and rejects concurrent resume updates',()=>{
 const captured={revision:2,sections:{projects:[{id:'a',description:'生成前原文'}],experience:[]}} as unknown as Resume;
 const draft=prepareOptimizationDraft(captured,2);draft.projects[0]!.description='手改';
 expect(captured.sections.projects[0]!.description).toBe('生成前原文');
 expect(()=>prepareOptimizationDraft(captured,3)).toThrow('STALE');
});
it('a late history response cannot overwrite a newer conversation or a reset view',async()=>{
 const latest=new LatestOperation();let resolveFirst:(value:string)=>void=()=>{};let visible='';
 const first=new Promise<string>(resolve=>{resolveFirst=resolve;});
 const token=latest.begin(),pending=first.then(value=>{if(latest.isCurrent(token))visible=value;});
 const second=latest.begin();if(latest.isCurrent(second))visible='new conversation';
 resolveFirst('old conversation');await pending;expect(visible).toBe('new conversation');
 latest.invalidate();expect(latest.isCurrent(second)).toBe(false);
});
