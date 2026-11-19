import Dexie, { type Table } from "dexie";
import type { EntityMap } from "../../types/entities";
export const stores: Record<keyof EntityMap, string> = {
  users: "id,&login,role,&studentId,&companyId",
  students:
    "id,&userId,&studentNo,[counselorId+cohortYear],counselorId,majorId",
  companies: "id,&ownerUserId",
  dictionaries: "id,&[kind+code],kind",
  configs: "id,&key",
  resumes: "id,&studentId",
  resumeVersions: "id,&[resumeId+number],resumeId",
  skillOntology: "id,&canonical",
  careerProfiles: "id,&studentId",
  jobs: "id,companyId,status,[companyId+status]",
  applications: "id,&[studentId+jobId],studentId,jobId",
  applicationEvents: "id,applicationId,at,commandId",
  interviews: "id,applicationId",
  mockSessions: "id,studentId,[studentId+createdAt]",
  mockQuestions: "id,type",
  contents: "id,kind",
  knowledgeChunks: "id,contentId",
  appointments: "id,studentId,counselorId",
  fairs: "id",
  agreements: "id,studentId,applicationId,companyId",
  destinations: "id,&studentId,status",
  assistance: "id,studentId,counselorId",
  attachments: "id,studentId",
  evaluations: "id,studentId",
  surveys: "id",
  surveyRecords: "id,&[surveyId+studentId],studentId",
  feedback: "id,studentId",
  aiRuns: "id,&traceId,studentId,actorUserId",
  suggestionDecisions: "id,&[traceId+suggestionId],studentId",
  notifications: "id,userId",
  auditLogs: "id,&sequence,entityId,at",
  commandReceipts: "id,actorUserId",
};
export type Database = Dexie & {
  [K in keyof EntityMap]: Table<EntityMap[K], string>;
};
export function createDatabase(name = "careerpilot-demo"): Database {
  const db = new Dexie(name) as Database;
  db.version(1).stores(stores);
  db.version(2).stores(stores);
  return db;
}
