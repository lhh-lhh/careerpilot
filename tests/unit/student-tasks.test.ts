import { expect, it } from "vitest";
import { studentTasks } from "../../src/domain/student-tasks";
import { createSeedPack } from "../../src/data/seed/seed";
import type { OfferDocument } from '../../src/types/entities';

it('empty existing resume produces a truthful completion task instead of claiming no next steps',()=>{
  const seed=createSeedPack(),resume={...seed.resumes[0]!,sections:{...seed.resumes[0]!.sections,education:[]}};
  const input={interviews:[],agreements:[],destinations:[],applications:[],mockSessions:[],resumes:[resume]};
  expect(studentTasks(input,'2026-11-15T00:00:00Z')).toMatchObject([{kind:'resume',title:'完善真实教育经历',to:'/student/resume'}]);
  expect(studentTasks({...input,resumes:[seed.resumes[0]!]},'2026-11-15T00:00:00Z')).toEqual([]);
});

it('offers ask for a decision only while the latest document is pending and before its deadline', () => {
  const seed = createSeedPack();
  const document: OfferDocument = { id: 'offer-v1', version: 1, companyName: '测试企业', jobTitle: '测试岗位', location: '上海', compensation: '税前月薪12000元', startDate: '2027-07-01', responseDeadline: '2026-11-14T12:00:00Z', note: '', issuedAt: '2026-11-13T10:00:00Z', status: 'pending', respondedAt: null, responseReason: null, withdrawnAt: null, withdrawalReason: null };
  const input = { interviews: [], agreements: [], destinations: [], applications: [{ ...seed.applications[0]!, status: 'offered' as const, offerDocuments: [document] }], mockSessions: [] };
  expect(studentTasks(input, '2026-11-13T12:00:00Z')).toMatchObject([{ kind: 'offer', title: '响应录用意向' }]);
  for (const status of ['accepted','declined','withdrawn'] as const) expect(studentTasks({ ...input, applications: [{ ...input.applications[0]!, offerDocuments: [{ ...document, status }] }] }, '2026-11-13T12:00:00Z')).toEqual([]);
  expect(studentTasks(input, '2026-11-14T12:00:00Z')).toEqual([]);
});

it("derives only actionable personal tasks and removes resolved interview and review work", () => {
  const seed = createSeedPack();
  const interview = { ...seed.interviews[0]!, id: 'upcoming', scheduledAt: '2026-11-14T10:00:00Z', status: 'scheduled' as const };
  const agreement = { ...seed.agreements[0]!, status: 'draft' as const, studentConfirmedAt: null, companyConfirmedAt: '2026-11-13T10:00:00Z' };
  const destination = { ...seed.destinations[0]!, status: 'rejected' as const, reviewReason: '补充证明' };
  const input = { interviews: [interview], agreements: [agreement], destinations: [destination], applications: [], mockSessions: [] };
  expect(studentTasks(input, '2026-11-13T12:00:00Z').map(t => t.kind)).toEqual(['destination', 'agreement', 'interview']);
  expect(studentTasks({ ...input, interviews: [{ ...interview, status: 'completed' }], agreements: [{ ...agreement, studentConfirmedAt: '2026-11-13T12:00:00Z' }], destinations: [{ ...destination, status: 'approved' }] }, '2026-11-13T12:00:00Z')).toEqual([]);
});
