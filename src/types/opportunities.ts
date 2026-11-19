export interface ExternalOpportunity {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  degree: string | null;
  majors: string | null;
  recruitmentType: string | null;
  salaryText: string;
  headCount: string | null;
  industry: string | null;
  companyNature: string | null;
  companySize: string | null;
  sourceName: string;
  underlyingSource: string | null;
  url: string;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
  observedAt: string;
  deadline: string | null;
  qualificationNote: string | null;
}
export interface Opportunity extends ExternalOpportunity {
  kind: "local" | "external";
  localJobId?: string;
  description?: string;
  freshness: "recent" | "needsUpdate" | "stale";
  availability: "available" | "withdrawn" | "expired" | "stale";
}
export interface OpportunityEntry {
  id: string;
  revision: number;
  candidate: ExternalOpportunity | null;
  published: ExternalOpportunity | null;
  status: "pending" | "published" | "withdrawn" | "rejected";
  reason: string;
  reviewedAt: string | null;
}
export interface OpportunityRecord {
  id: string;
  revision: number;
  saved: boolean;
  status: "following" | "applied" | "interviewing" | "offer" | "closed";
  note: string;
  activityDate: string | null;
  updatedAt: string;
  opportunity: Opportunity;
}
export interface OpportunityPage {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  facets: { locations: string[]; degrees: string[]; types: string[] };
  version: string;
}
export const recordStatusLabels = {
  following: "关注",
  applied: "已自行投递",
  interviewing: "面试中",
  offer: "收到意向",
  closed: "已结束",
} as const;
