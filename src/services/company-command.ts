import type { Database } from '../adapters/repository/db';
import type { AuditLog, Company, Json, User } from '../types/entities';
import { requireCondition } from '../domain/errors';

export type CompanyProfile = Pick<Company,'name'|'industryId'|'cityId'|'scale'|'description'>;
export interface CompanyCommand {
  type: 'SAVE_COMPANY_PROFILE'; commandId: string; entityId: string; expectedRevision: number; payload: CompanyProfile;
}
export async function executeCompanyProfile(db:Database,command:CompanyCommand,user:User,now:string,audit:(data:Omit<AuditLog,'id'|'sequence'>)=>Promise<void>):Promise<Json> {
  const company=await db.companies.get(command.entityId);
  requireCondition(user.role==='company' && company && user.companyId===company.id && company.ownerUserId===user.id,'FORBIDDEN');
  requireCondition(company.revision===command.expectedRevision,'REVISION_CONFLICT');
  const input=command.payload;
  requireCondition(Object.keys(input).every(k=>['name','industryId','cityId','scale','description'].includes(k)),'VALIDATION_ERROR');
  const validText=(v:unknown,min:number,max:number):v is string=>typeof v==='string' && v.trim().length>=min && v.length<=max && ![...v].some(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c));
  requireCondition(validText(input.name,2,160)&&validText(input.scale,1,80)&&validText(input.description,10,4000),'VALIDATION_ERROR','请填写企业名称、规模和至少10字的介绍。');
  // An approved identity cannot be replaced under its existing approval.
  requireCondition(!company.verified || input.name.trim().normalize('NFC')===company.name,'VALIDATION_ERROR','已核准企业更名须先联系管理员暂停准入并重新审核。');
  const dictionaries=await db.dictionaries.toArray();
  requireCondition(dictionaries.some(d=>d.kind==='industry'&&d.active&&d.id===input.industryId)&&dictionaries.some(d=>d.kind==='city'&&d.active&&d.id===input.cityId),'VALIDATION_ERROR','请选择有效的行业和城市。');
  const revision=company.revision+1;
  await db.companies.put({...company,name:input.name.trim().normalize('NFC'),scale:input.scale.trim().normalize('NFC'),description:input.description.trim().normalize('NFC'),industryId:input.industryId,cityId:input.cityId,revision,updatedAt:now});
  await audit({entityType:'Company',entityId:company.id,action:'SAVE_COMPANY_PROFILE',actorUserId:user.id,at:now,commandId:command.commandId,reason:null,before:{companyId:company.id,industryId:company.industryId},after:{companyId:company.id,industryId:input.industryId}});
  return {entityId:company.id,revision};
}
