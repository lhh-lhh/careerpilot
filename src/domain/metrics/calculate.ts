import type { Actor } from "../../types/identity";
import type {
  Application,
  ApplicationEvent,
  AuditLog,
  Destination,
  Interview,
  MetricProjection,
  Student,
} from "../../types/entities";
import { requireCondition } from "../errors";
export interface MetricQuery {
  cohortYear: number;
  collegeId?: string;
  majorId?: string;
  from?: string;
  to?: string;
  asOf: string;
}
export interface MetricSnapshot {
  students: Student[];
  applications: Application[];
  applicationEvents: ApplicationEvent[];
  interviews: Interview[];
  destinations: Destination[];
  auditLogs: AuditLog[];
}
interface Replayed {
  id: string;
  projection: MetricProjection;
}
export function replayProjections(
  logs: AuditLog[],
  asOf: string,
): Map<string, Replayed[]> {
  const entities = new Map<string, Map<string, MetricProjection>>();
  for (const log of [...logs]
    .filter((a) => a.at <= asOf)
    .sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence)) {
    if (!log.after) continue;
    const table =
      entities.get(log.entityType) ?? new Map<string, MetricProjection>();
    table.set(log.entityId, { ...table.get(log.entityId), ...log.after });
    entities.set(log.entityType, table);
  }
  return new Map(
    [...entities].map(([type, table]) => [
      type,
      [...table].map(([id, projection]) => ({ id, projection })),
    ]),
  );
}
function inScope(student: Student, actor: Actor): boolean {
  return (
    actor.role === "admin" ||
    (actor.role === "counselor" && student.counselorId === actor.userId) ||
    (actor.role === "student" && student.userId === actor.userId)
  );
}
export function calculateMetrics(
  snapshot: MetricSnapshot,
  query: MetricQuery,
  actor: Actor,
) {
  requireCondition(actor.role !== "company", "FORBIDDEN");
  const asOf = Date.parse(query.asOf),
    from = query.from ? Date.parse(query.from) : null,
    to = query.to ? Date.parse(query.to) : asOf;
  requireCondition(
    Number.isInteger(query.cohortYear) &&
      Number.isFinite(asOf) &&
      Number.isFinite(to) &&
      to <= asOf &&
      (from === null || (Number.isFinite(from) && from < to)),
  );
  const replay = replayProjections(snapshot.auditLogs, query.asOf),
    existingIds = new Set(snapshot.students.map((s) => s.id));
  const students = (replay.get("Student") ?? [])
    .filter((row) => existingIds.has(row.id))
    .map(
      (row) =>
        ({
          ...snapshot.students.find((s) => s.id === row.id)!,
          ...row.projection,
        }) as Student,
    )
    .filter(
      (s) =>
        s.active &&
        s.cohortYear === query.cohortYear &&
        (!query.collegeId || s.collegeId === query.collegeId) &&
        (!query.majorId || s.majorId === query.majorId) &&
        inScope(s, actor),
    );
  const ids = new Set(students.map((s) => s.id));
  const select = (type: string) =>
    (replay.get(type) ?? []).filter((row) =>
      ids.has(row.projection.studentId ?? ""),
    );
  const destinations = select("Destination"),
    applications = select("Application"),
    interviews = select("Interview"),
    agreements = select("Agreement");
  const approved = destinations.filter(
    (d) =>
      d.projection.status === "approved" && d.projection.type !== "unemployed",
  );
  const structure = {
    employment: 0,
    furtherStudy: 0,
    entrepreneurship: 0,
    flexible: 0,
    pending: 0,
    unregistered: 0,
  };
  for (const student of students) {
    const d = destinations.find(
      (row) => row.projection.studentId === student.id,
    )?.projection;
    if (
      d?.status === "approved" &&
      d.type &&
      d.type in structure &&
      d.type !== "unemployed"
    )
      structure[
        d.type as
          "employment" | "furtherStudy" | "entrepreneurship" | "flexible"
      ]++;
    else if (d?.status === "submitted") structure.pending++;
    else structure.unregistered++;
  }
  const applicationIds = new Set(applications.map((a) => a.id));
  const events = snapshot.applicationEvents.filter(
    (e) => e.at <= query.asOf && applicationIds.has(e.applicationId),
  );
  const eventCount = (event: string) =>
    new Set(events.filter((e) => e.event === event).map((e) => e.applicationId))
      .size;
  const completed = interviews.filter(
    (i) =>
      i.projection.status === "completed" &&
      (i.projection.result === "pass" || i.projection.result === "fail"),
  );
  const passed = completed.filter((i) => i.projection.result === "pass").length;
  const funnel = {
    applied: applications.length,
    interview: eventCount("SCHEDULE_INTERVIEW"),
    offered: eventCount("ISSUE_OFFER"),
    signed: new Set(
      agreements
        .filter((a) => a.projection.status === "signed")
        .map((a) => a.projection.applicationId),
    ).size,
  };
  const denominator = students.length;
  const byMajor = [...new Set(students.map((s) => s.majorId))]
    .sort()
    .map((majorId) => {
      const group = students.filter((s) => s.majorId === majorId),
        set = new Set(group.map((s) => s.id)),
        count = approved.filter((d) => set.has(d.projection.studentId!)).length;
      return {
        majorId,
        students: group.length,
        approved: count,
        rate: count / group.length,
      };
    });
  const majorIndustry = approved
    .filter((d) => d.projection.type === "employment")
    .reduce(
      (result, d) => {
        const majorId = students.find(
            (s) => s.id === d.projection.studentId,
          )!.majorId,
          industryId = d.projection.industryId;
        if (industryId) {
          const row = result.find(
            (x) => x.majorId === majorId && x.industryId === industryId,
          );
          if (row) row.count++;
          else result.push({ majorId, industryId, count: 1 });
        }
        return result;
      },
      [] as { majorId: string; industryId: string; count: number }[],
    );
  const nowMs = Date.parse(query.asOf),
    firstLog = snapshot.auditLogs.reduce(
      (min, a) => (a.at < min ? a.at : min),
      "9999",
    );
  const shanghai = new Date(nowMs + 8 * 3600_000),
    weekDay = (shanghai.getUTCDay() + 6) % 7;
  const monday =
    Date.UTC(
      shanghai.getUTCFullYear(),
      shanghai.getUTCMonth(),
      shanghai.getUTCDate() - weekDay,
    ) -
    8 * 3600_000;
  const weeklyTrend = Array.from({ length: 8 }, (_, i) => {
    const start = monday - (7 - i) * 7 * 86400_000,
      end = Math.min(start + 7 * 86400_000, nowMs),
      endIso = new Date(end).toISOString(),
      point = replayProjections(
        snapshot.auditLogs,
        new Date(end === nowMs ? end : end - 1).toISOString(),
      );
    const historicStudents = (point.get("Student") ?? []).filter(
      (s) =>
        existingIds.has(s.id) &&
        s.projection.active &&
        s.projection.cohortYear === query.cohortYear &&
        (!query.collegeId || s.projection.collegeId === query.collegeId) &&
        (!query.majorId || s.projection.majorId === query.majorId) &&
        inScope(
          {
            ...snapshot.students.find((x) => x.id === s.id)!,
            ...s.projection,
          } as Student,
          actor,
        ),
    );
    const historicIds = new Set(historicStudents.map((s) => s.id)),
      count = (point.get("Destination") ?? []).filter(
        (d) =>
          historicIds.has(d.projection.studentId ?? "") &&
          d.projection.status === "approved" &&
          d.projection.type !== "unemployed",
      ).length;
    const from = Math.max(start, query.from ? Date.parse(query.from) : start),
      to = Math.min(end, query.to ? Date.parse(query.to) : end);
    const newlyApproved = snapshot.auditLogs.filter(
      (a) =>
        a.entityType === "Destination" &&
        a.action === "APPROVE" &&
        ids.has(a.after?.studentId ?? "") &&
        Date.parse(a.at) >= from &&
        Date.parse(a.at) < to,
    ).length;
    return {
      weekStart: new Date(start).toISOString(),
      asOf: endIso,
      rate:
        endIso < firstLog || !historicStudents.length
          ? null
          : count / historicStudents.length,
      newlyApproved,
    };
  });
  const activityIds = new Set(
    snapshot.auditLogs
      .filter(
        (a) =>
          a.at <= query.asOf &&
          Date.parse(a.at) >= nowMs - 14 * 86400_000 &&
          ["APPLY", "COMPLETE_INTERVIEW", "SUBMIT_MOCK_ANSWER"].includes(
            a.action,
          ) &&
          ids.has(a.after?.studentId ?? ""),
      )
      .map((a) => a.after!.studentId!),
  );
  return {
    historyAvailable: firstLog <= query.asOf,
    studentCount: denominator,
    destinationRate: denominator ? approved.length / denominator : null,
    avgApplications: denominator ? applications.length / denominator : null,
    interviewPassRate: completed.length ? passed / completed.length : null,
    structure,
    funnel,
    byMajor,
    majorIndustry,
    weeklyTrend,
    activeSeekers: [...activityIds].filter(
      (id) => !approved.some((d) => d.projection.studentId === id),
    ).length,
    asOf: query.asOf,
    algorithmVersion: "1.0",
    scope: actor.role,
  };
}
export interface AlertInput {
  studentId: string;
  approved: boolean;
  enrolledAt: string;
  lastActivityAt: string | null;
  applicationCount: number;
  everInterviewed: boolean;
  resumeScore: number;
}
export function calculateAlerts(
  students: AlertInput[],
  now: string,
  deadline: string,
) {
  const daysRemaining = (Date.parse(deadline) - Date.parse(now)) / 86400_000;
  return students
    .filter((s) => !s.approved)
    .map((student) => {
      const lastActivityAt =
        student.lastActivityAt && student.lastActivityAt > student.enrolledAt
          ? student.lastActivityAt
          : student.enrolledAt;
      const idleDays =
        (Date.parse(now) - Date.parse(lastActivityAt)) / 86400_000;
      const rules = [
        {
          ruleId: "inactive7d",
          triggered: idleDays >= 7,
          points: 30,
          value: idleDays,
          threshold: 7,
          action: "联系学生了解近期进展",
        },
        {
          ruleId: "applicationsWithoutInterview",
          triggered: student.applicationCount >= 5 && !student.everInterviewed,
          points: 25,
          value: student.applicationCount,
          threshold: 5,
          action: "复核岗位匹配与投递策略",
        },
        {
          ruleId: "resumeIncomplete",
          triggered: student.resumeScore < 60,
          points: 20,
          value: student.resumeScore,
          threshold: 60,
          action: "邀请完善简历信息",
        },
        {
          ruleId: "deadlineApproaching",
          triggered: daysRemaining >= 0 && daysRemaining <= 7,
          points: 25,
          value: daysRemaining,
          threshold: 7,
          action: "确认当前去向及证明材料",
        },
      ].filter((r) => r.triggered);
      const score = rules.reduce((n, r) => n + r.points, 0);
      return {
        studentId: student.studentId,
        score,
        level: score >= 60 ? "high" : score >= 30 ? "medium" : "low",
        ruleIds: rules.map((r) => r.ruleId),
        rules,
        lastActivityAt,
        asOf: now,
        overdue: daysRemaining < 0,
      };
    })
    .filter((a) => a.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.studentId.localeCompare(b.studentId),
    );
}
export type MetricIntent =
  | "destinationRate"
  | "byMajor"
  | "funnel"
  | "alerts"
  | "avgApplications"
  | "interviewPassRate";
export function parseMetricIntent(text: string): MetricIntent | null {
  const intents: MetricIntent[] = [];
  if (/哪个专业|各专业|专业.*最低/.test(text)) intents.push("byMajor");
  else if (/落实率/.test(text)) intents.push("destinationRate");
  if (/漏斗|转化/.test(text)) intents.push("funnel");
  if (/预警|风险/.test(text)) intents.push("alerts");
  if (/平均投递/.test(text)) intents.push("avgApplications");
  if (/面试通过/.test(text)) intents.push("interviewPassRate");
  return intents.length === 1 ? intents[0]! : null;
}
