import type { Job } from '../../types/entities';
export interface JobFilters {query?:string;cityId?:string;salaryMin?:number;salaryMax?:number;negotiableOnly?:boolean}
export function salaryError(f:JobFilters):string {
  if([f.salaryMin,f.salaryMax].some(v=>v!==undefined&&(!Number.isFinite(v)||v<0)))return '薪资请输入不小于0的有效金额（元/月）。';
  return f.salaryMin!==undefined&&f.salaryMax!==undefined&&f.salaryMin>f.salaryMax?'最低薪资不能高于最高薪资。':'';
}
export function filterJobs(jobs:Job[],f:JobFilters,companyLabel:(id:string)=>string):Job[]{
  if(salaryError(f))return [];
  const query=f.query?.trim().toLocaleLowerCase();
  return jobs.filter(j=>(!query||`${j.title} ${companyLabel(j.companyId)} ${j.jdText}`.toLocaleLowerCase().includes(query))&&
    (!f.cityId||j.cityId===f.cityId)&&(!f.negotiableOnly||j.salaryRange===null)&&
    (f.salaryMin===undefined&&f.salaryMax===undefined||!!j.salaryRange&&(f.salaryMin===undefined||j.salaryRange.max>=f.salaryMin)&&(f.salaryMax===undefined||j.salaryRange.min<=f.salaryMax)));
}
