import {expect,it} from 'vitest';
import { normalizeResources, officialResources } from '../../server/public-resources';
it('rejects unsafe sources, deduplicates official URLs and never fabricates unknown deadlines',()=>{
  const job={...officialResources[0]!,deadline:null};
  expect(normalizeResources([job,job])).toHaveLength(1);
  expect(normalizeResources([job])[0]?.deadline).toBeNull();
  for(const url of ['javascript:alert(1)','https://www.ncss.cn.evil.test/jobs','https://user:secret@www.ncss.cn/student/jobs/x/detail.html','http://www.ncss.cn/','https://www.ncss.cn:8443/'])expect(()=>normalizeResources([{...job,url}])).toThrow('INVALID_SOURCE');
  expect(officialResources.every(r=>r.source==='国家大学生就业服务平台'&&r.observedAt&&r.url.startsWith('https://www.ncss.cn/'))).toBe(true);
});
