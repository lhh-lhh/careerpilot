import type {MatchCandidate,MatchPreferences,VoiceSession} from '../types/ai-workbench';
export class LatestOperation{
 private revision=0;
 begin(){return ++this.revision;}
 invalidate(){this.revision++;}
 isCurrent(token:number){return token===this.revision;}
}
export function normalizeMatchPreferences(value:Omit<MatchPreferences,'salaryMin'>&{salaryMin:number|null|''}):MatchPreferences{
 return {...value,role:value.role.trim(),city:value.city.trim(),industry:value.industry.trim(),salaryMin:value.salaryMin===''?null:value.salaryMin};
}
export function compareMatchCandidates(a:MatchCandidate,b:MatchCandidate):number{
 const category=(c:MatchCandidate)=>c.category==='excluded'?0:1;
 const intent=(c:MatchCandidate)=>c.reasons.reduce((n,r)=>n+(r==='岗位名称符合意向方向'?3:r==='行业符合意愿'?2:r==='工作地点符合意愿'?1:0),0);
 return category(b)-category(a)||intent(b)-intent(a)||(b.score??-1)-(a.score??-1)||b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id);
}
export function shouldConfirmVoiceLeave(state:VoiceSession['state']|undefined,recording:boolean,busy:boolean,transcript:string):boolean{
 return state!=='completed'&&(recording||busy||!!transcript.trim());
}
