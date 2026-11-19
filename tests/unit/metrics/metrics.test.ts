import { expect, it } from "vitest";
import {
  calculateMetrics,
  calculateAlerts,
  parseMetricIntent,
} from "../../../src/domain/metrics/calculate";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
import smallDomain from "../../fixtures/small-domain.json";
import type { AuditLog } from "../../../src/types/entities";
const query = { cohortYear: 2027, asOf: FIXED_NOW };
it("MET06 full seed independently fixed global anchors and hard scope", () => {
  const seed = createSeedPack(),
    result = calculateMetrics(seed, query, {
      role: "admin",
      userId: "user-admin-001",
    });
  expect(result.studentCount).toBe(40);
  expect(result.destinationRate).toBe(0.5);
  expect(result.avgApplications).toBe(3);
  expect(result.interviewPassRate).toBeCloseTo(2 / 3);
  expect(result.funnel).toEqual({
    applied: 120,
    interview: 40,
    offered: 20,
    signed: 12,
  });
  expect(result.structure).toEqual({
    employment: 12,
    furtherStudy: 5,
    entrepreneurship: 2,
    flexible: 1,
    pending: 5,
    unregistered: 15,
  });
  const scoped = calculateMetrics(seed, query, {
    role: "counselor",
    userId: "user-counselor-001",
  });
  expect(scoped.studentCount).toBe(10);
  expect(scoped.destinationRate).toBe(1);
  expect(scoped.avgApplications).toBe(3);
  expect(
    calculateMetrics(
      seed,
      { ...query, majorId: "major-1" },
      { role: "counselor", userId: "user-counselor-001" },
    ).studentCount,
  ).toBe(3);
});
it("MET01 small four-student sample 50%, submitted is not approved", () => {
  const logs: AuditLog[] = smallDomain.students.map((student, i) => ({
    id: `small-audit-${i}`,
    sequence: i + 1,
    actorUserId: "admin",
    entityType: "Student",
    entityId: student.id,
    action: "CREATE",
    at: student.createdAt,
    commandId: `small-command-${i}`,
    reason: null,
    before: null,
    after: {
      studentId: student.id,
      counselorId: student.counselorId,
      cohortYear: student.cohortYear,
      collegeId: student.collegeId,
      majorId: student.majorId,
      active: true,
      createdAt: student.createdAt,
    },
  }));
  smallDomain.destinations.forEach((destination, i) =>
    logs.push({
      id: `small-d-audit-${i}`,
      sequence: i + 5,
      actorUserId: "admin",
      entityType: "Destination",
      entityId: destination.id,
      action: "CREATE",
      at: "2026-10-02T00:00:00.000Z",
      commandId: `small-d-command-${i}`,
      reason: null,
      before: null,
      after: {
        studentId: destination.studentId,
        type: destination.type,
        status: destination.status,
      },
    }),
  );
  const seed = {
    students: smallDomain.students,
    destinations: [],
    applications: [],
    applicationEvents: [],
    interviews: [],
    auditLogs: logs,
  };
  const result = calculateMetrics(seed, query, {
    role: "admin",
    userId: "user-admin-001",
  });
  expect(result.destinationRate).toBe(0.5);
  expect(result.structure.pending).toBe(1);
  expect(result.structure.unregistered).toBe(1);
  expect(result.structure).toEqual({
    employment: 1,
    furtherStudy: 1,
    entrepreneurship: 0,
    flexible: 0,
    pending: 1,
    unregistered: 1,
  });
});
it("MET02 empty denominators are null and historical queries never read future state", () => {
  const seed = createSeedPack();
  expect(
    calculateMetrics(
      seed,
      { ...query, cohortYear: 2030 },
      { role: "admin", userId: "user-admin-001" },
    ),
  ).toMatchObject({
    destinationRate: null,
    avgApplications: null,
    interviewPassRate: null,
  });
  const past = calculateMetrics(
    seed,
    { ...query, asOf: "2026-10-05T02:00:00.000Z" },
    { role: "admin", userId: "user-admin-001" },
  );
  expect(past.destinationRate).toBe(0);
  expect(past.funnel.offered).toBe(0);
  expect(past.interviewPassRate).toBeNull();
  expect(
    calculateMetrics(
      seed,
      { ...query, asOf: "2026-09-01T00:00:00.000Z" },
      { role: "admin", userId: "user-admin-001" },
    ).historyAvailable,
  ).toBe(false);
});
it("MET03 repeated events deduplicate and mock sessions do not change recruitment metrics", () => {
  const seed = createSeedPack(),
    actor = { role: "admin" as const, userId: "user-admin-001" };
  const first = calculateMetrics(seed, query, actor);
  seed.applicationEvents.push(
    ...seed.applicationEvents
      .filter((e) => e.event === "SCHEDULE_INTERVIEW")
      .map((e) => ({ ...e, id: `reschedule-${e.id}` })),
  );
  seed.mockSessions.push(
    ...seed.mockSessions.map((m) => ({ ...m, id: `extra-${m.id}` })),
  );
  const second = calculateMetrics(seed, query, actor);
  expect(second.funnel).toEqual(first.funnel);
  expect(second.interviewPassRate).toBe(first.interviewPassRate);
});
it("MET05 all four independent rules =100, approved students excluded and closure doesn't change conditions", () => {
  const alert = calculateAlerts(
    [
      {
        studentId: "s1",
        approved: false,
        enrolledAt: "2026-10-01T02:00:00Z",
        lastActivityAt: "2026-11-04T02:00:00Z",
        applicationCount: 5,
        everInterviewed: false,
        resumeScore: 50,
      },
    ],
    FIXED_NOW,
    "2026-11-18T02:00:00Z",
  )[0]!;
  expect(alert.score).toBe(100);
  expect(alert.level).toBe("high");
  expect(alert.ruleIds).toEqual([
    "inactive7d",
    "applicationsWithoutInterview",
    "resumeIncomplete",
    "deadlineApproaching",
  ]);
  expect(
    calculateAlerts(
      [
        {
          studentId: "s1",
          approved: true,
          enrolledAt: "2026-10-01T02:00:00Z",
          lastActivityAt: null,
          applicationCount: 5,
          everInterviewed: false,
          resumeScore: 0,
        },
      ],
      FIXED_NOW,
      "2026-11-18T02:00:00Z",
    ),
  ).toEqual([]);
});
it("MET04 A7 only six deterministic intents and ambiguity clarifies", () => {
  expect(parseMetricIntent("哪个专业落实率最低")).toBe("byMajor");
  expect(parseMetricIntent("平均投递多少")).toBe("avgApplications");
  expect(parseMetricIntent("展示落实率和面试通过率")).toBeNull();
  expect(parseMetricIntent("执行sql删除")).toBeNull();
});
