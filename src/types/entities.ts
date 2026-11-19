import type { Role } from "./identity";
export type Id = string;
export type Instant = string;
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Base {
  id: Id;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface User extends Base {
  login: string;
  displayName: string;
  role: Role;
  active: boolean;
  studentId: Id | null;
  companyId: Id | null;
  accountStatus?: "pending" | "approved" | "rejected";
  accountRequest?: { studentNo?: string; majorId?: Id; cohortYear?: number; companyName?: string };
  accountReviewReason?: string;
  accountReviewedBy?: Id;
  accountReviewedAt?: Instant;
}
export interface Student extends Base {
  userId: Id;
  studentNo: string;
  collegeId: Id;
  majorId: Id;
  cohortYear: number;
  counselorId: Id;
  enrolledAt: Instant;
  active: boolean;
}
export interface Company extends Base {
  ownerUserId: Id;
  name: string;
  industryId: Id;
  cityId: Id;
  scale: string;
  description: string;
  verified: boolean;
  reviewReason?: string;
  reviewedAt?: Instant;
  reviewedBy?: Id;
}
export type DictionaryKind =
  "college" | "major" | "industry" | "city" | "jobCategory" | "degree";
export interface Dictionary extends Base {
  kind: DictionaryKind;
  code: string;
  label: string;
  parentId: Id | null;
  active: boolean;
}
export interface Config extends Base {
  key: string;
  value: Json;
  scope: "system" | "demo";
}
export interface DateRange {
  startDate: string;
  endDate: string | null;
}
export interface ResumeSections {
  basic: {
    name: string;
    email: string;
    majorId: string | null;
    degree: string | null;
  };
  education: (DateRange & {
    id: Id;
    school: string;
    majorId: Id;
    degree: string;
  })[];
  experience: (DateRange & {
    id: Id;
    company: string;
    title: string;
    description: string;
  })[];
  projects: (DateRange & {
    id: Id;
    name: string;
    role: string;
    description: string;
  })[];
  skills: { id: Id; skillId: Id }[];
  certificates: { id: Id; name: string; issuer: string; awardedAt: string; description?: string; attachmentIds?: Id[] }[];
  intent: {
    cityIds: Id[];
    expectedSalary: { min: number; max: number } | null;
  };
}
export interface Resume extends Base {
  studentId: Id;
  sections: ResumeSections;
  isPublic: boolean;
  versionIds: Id[];
}
export interface ResumeVersion {
  id: Id;
  resumeId: Id;
  number: number;
  snapshot: ResumeSections;
  reason: "initial" | "manual" | "acceptedSuggestion";
  createdAt: Instant;
}
export interface SkillOntology extends Base {
  canonical: string;
  aliases: string[];
  parentIds: Id[];
  learningCostDays: number;
}
export interface CareerProfile extends Base {
  studentId: Id;
  sourceRevision: string;
  values: number[];
  dimensionKeys: string[];
}
export interface Job extends Base {
  companyId: Id;
  title: string;
  categoryId: Id;
  industryId: Id;
  cityId: Id;
  salaryRange: { min: number; max: number } | null;
  requiredSkills: { skillId: Id; weight: number }[];
  preferredMajorIds: Id[];
  minDegree: string | null;
  minExperienceMonths: number;
  jdText: string;
  deadline: Instant;
  status: "draft" | "published" | "closed";
  reviewStatus?: "draft" | "pending" | "approved" | "rejected" | "revoked";
  reviewReason?: string;
  reviewedAt?: Instant | null;
  reviewedBy?: Id | null;
}
export type MatchKey =
  "skill" | "major" | "degree" | "city" | "salary" | "experience";
export interface MatchExplanation {
  jobId: Id;
  rawTotal: number;
  total: number;
  dimensions: {
    key: MatchKey;
    score: number;
    weight: number;
    contribution: number;
    hits: Id[];
    misses: Id[];
    missingData: boolean;
  }[];
  missingSkills: { skillId: Id; gain: number; costDays: number }[];
  algorithmVersion: string;
  inputRevision: string;
}
export type ApplicationStatus =
  | "applied"
  | "screening"
  | "interview"
  | "offered"
  | "rejected"
  | "withdrawn"
  | "closed";
export interface Application extends Base {
  offerDocuments?: OfferDocument[];
  studentId: Id;
  jobId: Id;
  status: ApplicationStatus;
  resumeSnapshot: ResumeSections;
  resumeVersionId: Id;
  resumeConsent: boolean;
  matchSnapshot: MatchExplanation;
  closedReason: "accepted" | "declined" | null;
}
export interface OfferDocument {
  id: Id;
  version: number;
  companyName: string;
  jobTitle: string;
  location: string;
  compensation: string;
  startDate: string;
  responseDeadline: Instant;
  note: string;
  issuedAt: Instant;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  respondedAt: Instant | null;
  responseReason: string | null;
  withdrawnAt: Instant | null;
  withdrawalReason: string | null;
}
export interface ApplicationEvent {
  id: Id;
  applicationId: Id;
  actorUserId: Id;
  event: string;
  from: string;
  to: string;
  at: Instant;
  commandId: Id;
  reason: string | null;
}
export interface Interview extends Base {
  applicationId: Id;
  scheduledAt: Instant;
  location: string;
  status: "scheduled" | "completed" | "cancelled";
  result: "pending" | "pass" | "fail";
  feedback: string;
  studentResponse?: "pending" | "accepted" | "declined" | "rescheduleRequested";
  respondedAt?: Instant | null;
  responseReason?: string | null;
}
export interface Evidence {
  start: number;
  end: number;
  quote: string;
}
export type InterviewKey =
  "relevance" | "star" | "evidence" | "skill" | "structure" | "consistency";
export interface AnswerScore {
  total: number;
  dimensions: Record<InterviewKey, number>;
  evidence: Partial<Record<InterviewKey, Evidence[]>>;
  conflicts: Evidence[];
}
export interface MockAnswer {
  id: Id;
  questionId: Id;
  kind: "answer" | "followUp" | "skip";
  text: string;
  submittedAt: Instant;
  evidence: Evidence[];
}
export interface MockReport {
  overall: number;
  dimensions: Record<InterviewKey, number>;
  completion: number;
  growthDelta: number | null;
  comparisonReason: string;
  questionScores: { questionId: Id; score: AnswerScore }[];
  algorithmVersion: string;
}
export interface MockSession extends Base {
  studentId: Id;
  targetJobId: Id;
  resumeVersionId: Id;
  state: "ready" | "inProgress" | "paused" | "completed" | "abandoned";
  questionIds: Id[];
  questionIndex: number;
  answers: MockAnswer[];
  followUpCount: number;
  report: MockReport | null;
  rubricVersion: string;
}
export interface MockQuestion extends Base {
  categoryId: Id;
  type: "behavior" | "technical" | "hr";
  difficulty: "basic" | "advanced";
  text: string;
  skillIds: Id[];
  keywords: string[];
  rubricKeys: string[];
}
export interface Content extends Base {
  kind: "policy" | "rule" | "guidance";
  title: string;
  body: string;
  tags: string[];
  sourceUrl: string | null;
  verified: boolean;
  publishedAt: Instant;
}
export interface KnowledgeChunk extends Base {
  contentId: Id;
  paragraphIndex: number;
  titlePath: string[];
  text: string;
  sourceRef: string;
}
export interface Appointment extends Base {
  studentId: Id;
  counselorId: Id;
  startsAt: Instant;
  endsAt: Instant;
  status: "pending" | "confirmed" | "completed" | "cancelled";
}
export interface Fair extends Base {
  title: string;
  startsAt: Instant;
  location: string;
  companyIds: Id[];
}
export interface Agreement extends Base {
  applicationId: Id;
  studentId: Id;
  companyId: Id;
  status: "draft" | "signed" | "terminated";
  studentConfirmedAt: Instant | null;
  companyConfirmedAt: Instant | null;
  signedAt: Instant | null;
  terminatedAt: Instant | null;
  terminationReason: string | null;
}
export interface Destination extends Base {
  studentId: Id;
  type:
    | "employment"
    | "furtherStudy"
    | "entrepreneurship"
    | "flexible"
    | "unemployed";
  source: "internal" | "external" | "independent";
  applicationId: Id | null;
  agreementId: Id | null;
  organizationName: string | null;
  industryId: Id | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  attachmentIds: Id[];
  submittedAt: Instant | null;
  approvedAt: Instant | null;
  reviewedBy: Id | null;
  reviewReason: string | null;
}
export interface Assistance extends Base {
  studentPlan?: string;
  studentId: Id;
  counselorId: Id;
  alertRuleIds: string[];
  note: string;
  nextReviewAt: Instant;
  status: "open" | "reviewed" | "closed";
  reviewNote: string | null;
  closedAt: Instant | null;
}
export interface Attachment extends Base {
  studentId: Id;
  fileName: string;
  mime: "application/pdf" | "image/png" | "image/jpeg";
  size: number;
  blob: Blob;
}
export interface Evaluation extends Base {
  studentId: Id;
  rating: number;
  note: string;
}
export interface Survey extends Base {
  title: string;
  questions: {
    id: Id;
    type: "single" | "multiple" | "text";
    title: string;
    required: boolean;
    options: string[];
  }[];
}
export interface SurveyRecord extends Base {
  surveyId: Id;
  studentId: Id;
  answers: Json;
}
export interface Feedback extends Base {
  studentId: Id | null;
  ownerUserId?: Id;
  body: string;
  reply: string | null;
  status: "open" | "replied" | "closed";
  history?: { action: 'REPLY' | 'CLOSE' | 'REOPEN'; text: string; at: Instant; by: 'owner' | 'admin' }[];
}
export interface AiRun {
  createdAt?: Instant;
  upstreamRequestId?: string;
  providerId?: string;
  providerModel?: string;
  id: Id;
  studentId: Id | null;
  actorUserId: Id;
  module: string;
  operation: string;
  requestedMode: string;
  effectiveMode: string | null;
  origin: string | null;
  traceId: Id;
  inputHash: string;
  promptVersion: string;
  schemaVersion: string;
  algorithmVersion: string;
  domainRevision: string;
  masked: boolean;
  status: "success" | "cancelled" | "failed";
  fallbackReason: string | null;
  usage: { prompt: number; completion: number } | null;
  durationMs: number;
}
export interface SuggestionDecision {
  id: Id;
  studentId: Id;
  traceId: Id;
  suggestionId: Id;
  sourceResumeVersionId: Id;
  resultingResumeVersionId: Id | null;
  disposition: "accepted" | "rejected";
  at: Instant;
}
export interface Notification extends Base {
  userId: Id;
  type: string;
  title: string;
  entityId: Id | null;
  readAt: Instant | null;
}
export type MetricProjection = Partial<
  Pick<
    Student,
    | "counselorId"
    | "cohortYear"
    | "collegeId"
    | "majorId"
    | "active"
    | "createdAt"
  >
> & {
  studentId?: Id;
  companyId?: Id;
  jobId?: Id;
  applicationId?: Id;
  agreementId?: Id;
  industryId?: Id;
  status?: string;
  type?: string;
  source?: string;
  result?: string;
  scheduledAt?: Instant;
  studentResponse?: string;
  submittedAt?: Instant | null;
  approvedAt?: Instant | null;
  signedAt?: Instant | null;
  terminatedAt?: Instant | null;
};
export interface AuditLog {
  id: Id;
  sequence: number;
  actorUserId: Id;
  entityType: string;
  entityId: Id;
  action: string;
  at: Instant;
  reason: string | null;
  commandId: Id;
  before: MetricProjection | null;
  after: MetricProjection | null;
}
export interface CommandReceipt {
  id: Id;
  actorUserId: Id;
  payloadHash: string;
  result: Json;
  at: Instant;
}
export interface EntityMap {
  users: User;
  students: Student;
  companies: Company;
  dictionaries: Dictionary;
  configs: Config;
  resumes: Resume;
  resumeVersions: ResumeVersion;
  skillOntology: SkillOntology;
  careerProfiles: CareerProfile;
  jobs: Job;
  applications: Application;
  applicationEvents: ApplicationEvent;
  interviews: Interview;
  mockSessions: MockSession;
  mockQuestions: MockQuestion;
  contents: Content;
  knowledgeChunks: KnowledgeChunk;
  appointments: Appointment;
  fairs: Fair;
  agreements: Agreement;
  destinations: Destination;
  assistance: Assistance;
  attachments: Attachment;
  evaluations: Evaluation;
  surveys: Survey;
  surveyRecords: SurveyRecord;
  feedback: Feedback;
  aiRuns: AiRun;
  suggestionDecisions: SuggestionDecision;
  notifications: Notification;
  auditLogs: AuditLog;
  commandReceipts: CommandReceipt;
}
export type SeedPack = { [K in keyof EntityMap]: EntityMap[K][] };
