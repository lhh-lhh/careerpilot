import { expect, it } from 'vitest';
import { createSeedPack } from '../../src/data/seed/seed';
import { filterJobs, salaryError } from '../../src/domain/jobs/filtering';
import { createSqlDatabase } from '../../server/database';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeService } from '../../server/bootstrap';
const base={...createSeedPack().jobs[0]!,jdText:'测试岗位职责'};
const jobs=[{...base,id:'sh',cityId:'city-1',salaryRange:{min:8000,max:12000},title:'前端开发'},{...base,id:'bj',cityId:'city-beijing',salaryRange:{min:15000,max:25000},title:'数据分析'},{...base,id:'negotiable',cityId:'city-2',salaryRange:null,title:'运营助理'}];
it('all jobs remain browseable without match results; keyword and city intersect',()=>{
  expect(filterJobs(jobs,{},()=> '测试企业').map(j=>j.id)).toEqual(['sh','bj','negotiable']);
  expect(filterJobs(jobs,{query:'测试企业',cityId:'city-beijing'},()=> '测试企业').map(j=>j.id)).toEqual(['bj']);
  expect(filterJobs(jobs,{query:'前端'},()=> '测试企业').map(j=>j.id)).toEqual(['sh']);
});
it('salary intersection excludes unknown ranges and supports one-sided or negotiable-only filters',()=>{
  expect(filterJobs(jobs,{salaryMin:11000,salaryMax:16000},()=> '').map(j=>j.id)).toEqual(['sh','bj']);
  expect(filterJobs(jobs,{salaryMin:13000},()=> '').map(j=>j.id)).toEqual(['bj']);
  expect(filterJobs(jobs,{salaryMax:9000},()=> '').map(j=>j.id)).toEqual(['sh']);
  expect(filterJobs(jobs,{negotiableOnly:true},()=> '').map(j=>j.id)).toEqual(['negotiable']);
});
it('invalid amounts never broaden the search silently',()=>{
  for(const f of [{salaryMin:-1},{salaryMax:NaN},{salaryMin:12000,salaryMax:8000}]){expect(salaryError(f)).not.toBe('');expect(filterJobs(jobs,f,()=> '')).toEqual([]);}
  expect(salaryError({salaryMin:0})).toBe('');
});
it('existing SQLite catalog gains nationwide cities idempotently without replacing legacy ids',async()=>{
  const root=await mkdtemp(join(tmpdir(),'careerpilot-city-catalog-'));const path=join(root,'service.sqlite');await initializeService(path);let db=createSqlDatabase(path);
  try{expect((await db.db.dictionaries.where('kind').equals('city').toArray()).some(d=>d.label==='北京')).toBe(true);expect((await db.db.dictionaries.get('city-1'))?.label).toBe('上海');const count=await db.db.dictionaries.count();await db.close();db=createSqlDatabase(path);expect(await db.db.dictionaries.count()).toBe(count);}finally{await db.close();await rm(root,{recursive:true,force:true});}
});
