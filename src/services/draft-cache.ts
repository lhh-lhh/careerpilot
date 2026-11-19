import type { Destination, ResumeSections } from '../types/entities';
export interface CachedDraft<T = unknown> { entityId: string; revision: number; value: T }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nullable = (value: unknown) => value === null || string(value);
const list = (value: unknown, check: (row: Record<string, unknown>) => boolean): boolean => Array.isArray(value) && value.length <= 500 && value.every(row => object(row) && check(row));
export function isResumeDraft(value: unknown): value is ResumeSections {
  if (!object(value) || !object(value.basic) || !object(value.intent)) return false;
  const basic = value.basic, intent = value.intent;
  const range = (row: Record<string, unknown>) => string(row.id) && string(row.startDate) && nullable(row.endDate);
  return string(basic.name) && string(basic.email) && nullable(basic.majorId) && nullable(basic.degree) &&
    list(value.education, row => range(row) && string(row.school) && string(row.majorId) && string(row.degree)) &&
    list(value.experience, row => range(row) && string(row.company) && string(row.title) && string(row.description)) &&
    list(value.projects, row => range(row) && string(row.name) && string(row.role) && string(row.description)) &&
    list(value.skills, row => string(row.id) && string(row.skillId)) &&
    list(value.certificates, row => string(row.id) && string(row.name) && string(row.issuer) && string(row.awardedAt) &&
      (row.description===undefined||string(row.description)&&row.description.length<=2000)&&
      (row.attachmentIds===undefined||Array.isArray(row.attachmentIds)&&row.attachmentIds.length<=5&&row.attachmentIds.every(string))) &&
    Array.isArray(intent.cityIds) && intent.cityIds.every(string) &&
    (intent.expectedSalary === null || (object(intent.expectedSalary) && typeof intent.expectedSalary.min === 'number' && Number.isFinite(intent.expectedSalary.min) && typeof intent.expectedSalary.max === 'number' && Number.isFinite(intent.expectedSalary.max)));
}
type DestinationDraft = Pick<Destination, 'type' | 'source' | 'applicationId' | 'agreementId' | 'industryId' | 'attachmentIds'> & { organizationName: string };
export function isDestinationDraft(value: unknown): value is DestinationDraft {
  return object(value) && Object.keys(value).every(k => ['type','source','applicationId','agreementId','organizationName','industryId','attachmentIds'].includes(k)) &&
    ['employment','furtherStudy','entrepreneurship','flexible','unemployed'].includes(String(value.type)) && ['external','independent','internal'].includes(String(value.source)) &&
    nullable(value.applicationId) && nullable(value.agreementId) && nullable(value.industryId) && string(value.organizationName) &&
    Array.isArray(value.attachmentIds) && value.attachmentIds.length <= 5 && value.attachmentIds.every(string);
}
const prefix = "careerpilot-draft-v1:";
export function createDraftCache(storage: Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">) {
  const key = (user: string, module: string) => prefix + JSON.stringify([user, module]);
  return {
    read<T = unknown>(user: string, module: string): CachedDraft<T> | null {
      try {
        const raw = storage.getItem(key(user, module));
        if (!raw || raw.length > 1024 * 1024) return null;
        const result = JSON.parse(raw);
        return typeof result.entityId === "string" && Number.isInteger(result.revision) && result.revision >= 0 && result.value && typeof result.value === "object" ? result : null;
      } catch { return null; }
    },
    save(user: string, module: string, draft: CachedDraft) {
      try { const raw = JSON.stringify(draft); if (raw.length > 1024 * 1024) return false; storage.setItem(key(user, module), raw); return true; } catch { return false; }
    },
    remove(user: string, module: string) { try { storage.removeItem(key(user, module)); } catch { /* No success claim is shown. */ } },
    clear() {
      try { for (let i = storage.length - 1; i >= 0; i--) { const k = storage.key(i); if (k?.startsWith(prefix)) storage.removeItem(k); } } catch { /* Storage can be disabled by the browser. */ }
    },
  };
}
export function browserDraftCache() {
  try { return createDraftCache(window.sessionStorage); } catch { return null; }
}
export function clearBrowserDrafts() { browserDraftCache()?.clear(); }
