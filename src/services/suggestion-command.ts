import type { Database } from "../adapters/repository/db";
import type { AuditLog, Evidence, Json, User } from "../types/entities";
import { requireCondition } from "../domain/errors";
import { assertSuggestion } from "../domain/resume/diagnose";
import { guardPayload } from "../domain/ai-guard/semantic";
export interface SuggestionCommand {
  type: "DECIDE_SUGGESTION";
  commandId: string;
  entityId: string;
  expectedRevision: number;
  payload: {
    traceId: string;
    suggestionId: string;
    sourceResumeVersionId: string;
    disposition: "accepted" | "rejected";
    fieldPath: string;
    before: string;
    after: string;
    requiresUserInput: boolean;
    evidence: Evidence[];
  };
}
export async function executeSuggestion(
  db: Database,
  command: SuggestionCommand,
  user: User,
  now: string,
  audit: (row: Omit<AuditLog, "id" | "sequence">) => Promise<void>,
): Promise<Json> {
  const resume = await db.resumes.get(command.entityId),
    p = command.payload;
  requireCondition(
    resume && user.role === "student" && user.studentId === resume.studentId,
    "FORBIDDEN",
  );
  requireCondition(
    !(await db.suggestionDecisions
      .where("[traceId+suggestionId]")
      .equals([p.traceId, p.suggestionId])
      .count()),
    "ALREADY_DECIDED",
  );
  requireCondition(
    resume.revision === command.expectedRevision,
    "REVISION_CONFLICT",
  );
  requireCondition(
    ["accepted", "rejected"].includes(p.disposition),
    "VALIDATION_ERROR",
  );
  const version = resume.versionIds.at(-1)!;
  requireCondition(version === p.sourceResumeVersionId, "STALE_SUGGESTION");
  let versionId: string | null = null;
  if (p.disposition === "accepted") {
    requireCondition(!p.requiresUserInput, "REQUIRES_USER_INPUT");
    const path = /^(experience|projects)\.([A-Za-z0-9_-]+)\.description$/.exec(
      p.fieldPath,
    );
    requireCondition(
      path && !/__proto__|constructor|prototype/.test(p.fieldPath),
      "VALIDATION_ERROR",
    );
    const section = path[1] as "experience" | "projects",
      row = resume.sections[section].find((r) => r.id === path[2]);
    requireCondition(row, "STALE_SUGGESTION");
    requireCondition(
      p.after.trim().length > 0 && p.after.length <= 4000,
      "VALIDATION_ERROR",
    );
    assertSuggestion(version, row.description, {
      resumeVersionId: p.sourceResumeVersionId,
      fieldPath: p.fieldPath,
      before: p.before,
      after: p.after,
      evidence: p.evidence,
    });
    const checked = guardPayload(
      "A1",
      "rewrite",
      {
        resumeVersionId: version,
        fields: [{ fieldPath: p.fieldPath, text: row.description }],
        targetJob: null,
        strategy: "structure",
        keepMyTone: false,
      },
      {
        module: "A1",
        operation: "rewrite",
        summary: "人工确认采纳",
        suggestions: [
          {
            id: p.suggestionId,
            resumeVersionId: version,
            fieldPath: p.fieldPath,
            before: p.before,
            after: p.after,
            reason: "人工确认采纳",
            evidence: p.evidence.map((e) => ({ ...e, fieldPath: p.fieldPath })),
            requiresUserInput: false,
            disposition: "pending",
          },
        ],
      },
    );
    requireCondition(
      checked.module === "A1" && !checked.suggestions[0]!.requiresUserInput,
      "REQUIRES_USER_INPUT",
    );
    const sections = structuredClone(resume.sections);
    sections[section].find((r) => r.id === row.id)!.description = p.after
      .trim()
      .normalize("NFC");
    versionId = crypto.randomUUID();
    await db.resumes.put({
      ...resume,
      sections,
      revision: resume.revision + 1,
      updatedAt: now,
      versionIds: [...resume.versionIds, versionId],
    });
    await db.resumeVersions.add({
      id: versionId,
      resumeId: resume.id,
      number: resume.versionIds.length + 1,
      snapshot: sections,
      reason: "acceptedSuggestion",
      createdAt: now,
    });
  }
  await db.suggestionDecisions.add({
    id: crypto.randomUUID(),
    studentId: resume.studentId,
    traceId: p.traceId,
    suggestionId: p.suggestionId,
    sourceResumeVersionId: p.sourceResumeVersionId,
    resultingResumeVersionId: versionId,
    disposition: p.disposition,
    at: now,
  });
  await audit({
    actorUserId: user.id,
    entityType: "Resume",
    entityId: resume.id,
    action:
      p.disposition === "accepted" ? "ACCEPT_SUGGESTION" : "REJECT_SUGGESTION",
    at: now,
    reason: null,
    commandId: command.commandId,
    before: null,
    after: { studentId: resume.studentId },
  });
  return {
    entityId: resume.id,
    revision: resume.revision + (versionId ? 1 : 0),
    versionId,
    disposition: p.disposition,
  };
}
