import type {Resume,ResumeSections} from '../../types/entities';
export function prepareOptimizationDraft(captured:Resume,currentRevision:number):ResumeSections{
 if(captured.revision!==currentRevision)throw Error('STALE');
 return structuredClone(captured.sections);
}
import type {ResumePatch} from '../../types/ai-workbench';
export function applyPatches(source:ResumeSections,patches:ResumePatch[]):ResumeSections{
 const result=structuredClone(source),paths=new Set<string>();
 for(const patch of patches){
  if(patch.requiresUserInput)continue;
  const row=result[patch.section].find(r=>r.id===patch.rowId),path=`${patch.section}:${patch.rowId}`;
  if(!row||row.description!==patch.before||paths.has(path))throw Error('STALE_SUGGESTION');
  if(!patch.after.trim()||patch.after.length>4000)throw Error('VALIDATION_ERROR');
  paths.add(path);row.description=patch.after;
 }
 return result;
}
