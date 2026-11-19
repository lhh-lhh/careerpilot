import { describe, it, expect } from 'vitest';
import { jobArtwork, jobArtworkBatch } from '../../src/presentation/job-artwork';

describe('semantic decorative job artwork', () => {
  it('matches familiar roles to relevant art instead of one building for all roles', () => {
    expect(jobArtwork('前端开发工程师', 'a')).toContain('/frontend-');
    expect(jobArtwork('后端开发工程师', 'b')).toContain('/backend-');
    expect(jobArtwork('数据分析助理', 'c')).toContain('/analytics-');
    expect(jobArtwork('护肤品私域运营', 'd')).toContain('/operations-');
  });
  it('keeps stable paths without URL injection or nondeterministic identity', () => {
    expect(jobArtwork('算法工程师', 'a')).toBe(jobArtwork('算法工程师', 'a'));
    expect(jobArtwork('<script>', '../../private')).toMatch(/^\/media\/career\/jobs\/[a-z]+-[123]\.webp$/);
  });
  it('keeps local opportunity identity identical to the corresponding workbench vacancy',()=>{
    expect(jobArtwork('前端开发工程师','local:job-001')).toBe(jobArtwork('前端开发工程师','job-001'));
  });
  it('keeps the same job illustration across pages, filtering and reordered lists', () => {
    const first = { id: 'a', title: '前端开发工程师' }, second = { id: 'c', title: '前端开发工程师' };
    expect(jobArtworkBatch([first, second])[1]).toBe(jobArtwork(second.title, second.id));
    expect(jobArtworkBatch([second, first])[0]).toBe(jobArtworkBatch([first, second])[1]);
  });
  it('uses both relevant variants without changing identity when a finite library is exhausted', () => {
    const batch = jobArtworkBatch(Array.from({length:10}, (_, i)=>({id:String(i),title:'技术工程师'})));
    expect(new Set(batch).size).toBe(2);
    expect(batch.every(p=>/\/engineering-/.test(p))).toBe(true);
    const finance = jobArtworkBatch(Array.from({length:6}, (_, i)=>({id:String(i),title:'会计'})));
    expect(finance.every(p=>/\/finance-/.test(p))).toBe(true);
  });
});
