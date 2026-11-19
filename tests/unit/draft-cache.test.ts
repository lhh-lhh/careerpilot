import { expect, it } from "vitest";
import { isResumeDraft, isDestinationDraft } from '../../src/services/draft-cache';
import { createSeedPack } from '../../src/data/seed/seed';

it('malformed nested drafts cannot replace renderable resume or destination data', () => {
  const resume = createSeedPack().resumes[0]!.sections;
  expect(isResumeDraft(resume)).toBe(true);
  for (const patch of [{ skills: null }, { education: [null] }, { projects: [{id:'x'}] }, { intent: null }, { basic: { ...resume.basic, name: {} } }]) expect(isResumeDraft({ ...resume, ...patch })).toBe(false);
  const destination = { type: 'furtherStudy', source: 'independent', applicationId: null, agreementId: null, organizationName: '未保存学校', industryId: null, attachmentIds: [] };
  expect(isDestinationDraft(destination)).toBe(true);
  for (const patch of [{ organizationName: {} }, { attachmentIds: [null] }, { source: 'forged' }, { __proto__: null, injected: true }]) expect(isDestinationDraft({ ...destination, ...patch })).toBe(false);
});

it("refresh recovery keeps the original revision and never exposes another account draft", async () => {
  const { createDraftCache } = await import("../../src/services/draft-cache");
  const map = new Map<string, string>();
  const storage = { get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
  const first = createDraftCache(storage);
  expect(first.save('user-a', 'resume', { entityId: 'resume-a', revision: 7, value: { text: '未保存的输入' } })).toBe(true);
  const refreshed = createDraftCache(storage);
  expect(refreshed.read('user-a', 'resume')).toEqual({ entityId: 'resume-a', revision: 7, value: { text: '未保存的输入' } });
  expect(refreshed.read('user-b', 'resume')).toBeNull();
  expect(refreshed.read('user-a', 'destination')).toBeNull();
  storage.setItem('unrelated-preference', 'keep');
  refreshed.clear();
  expect(first.read('user-a', 'resume')).toBeNull();
  expect(storage.getItem('unrelated-preference')).toBe('keep');
});
it("blocked storage and malformed values fail safely, without claiming a saved draft", async () => {
  const { createDraftCache } = await import("../../src/services/draft-cache");
  const blocked = createDraftCache({ get length() { return 0; }, key: () => null, getItem: () => '{bad', setItem: () => { throw Error('QuotaExceeded'); }, removeItem: () => { throw Error('blocked'); } });
  expect(blocked.read('a', 'resume')).toBeNull();
  expect(blocked.save('a', 'resume', { entityId: 'a', revision: 1, value: {} })).toBe(false);
  expect(() => blocked.clear()).not.toThrow();
});
