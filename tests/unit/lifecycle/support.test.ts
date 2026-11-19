import { expect, it } from "vitest";
import {
  transitionJob,
  transitionAssistance,
  transitionAppointment,
} from "../../../src/domain/lifecycle/support";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
it("job publication validates fields, ownership and future deadline; closed can reopen", () => {
  const s = createSeedPack(),
    j = { ...s.jobs[0]!, status: "draft" as const },
    actor = { role: "company" as const, userId: "owner" };
  expect(transitionJob(j, "PUBLISH", actor, "owner", FIXED_NOW).status).toBe(
    "published",
  );
  const closed = transitionJob(
    { ...j, status: "published" },
    "CLOSE",
    actor,
    "owner",
    FIXED_NOW,
  );
  expect(
    transitionJob(closed, "PUBLISH", actor, "owner", FIXED_NOW).status,
  ).toBe("published");
  expect(() =>
    transitionJob(
      { ...j, deadline: "2020-01-01T00:00:00Z" },
      "PUBLISH",
      actor,
      "owner",
      FIXED_NOW,
    ),
  ).toThrow();
  expect(() =>
    transitionJob(
      j,
      "PUBLISH",
      { role: "student", userId: "owner" },
      "owner",
      FIXED_NOW,
    ),
  ).toThrow("FORBIDDEN");
  expect(() => transitionJob(j, "CLOSE", actor, "owner", FIXED_NOW)).toThrow(
    "INVALID_TRANSITION",
  );
});
it("assistance closes only after recorded review and explicit confirmation; no risk-state mutation", () => {
  const a = {
      id: "a",
      revision: 1,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      studentId: "s",
      counselorId: "c",
      alertRuleIds: ["resumeIncomplete"],
      note: "联系同学并安排完善简历的教学辅导",
      nextReviewAt: "2026-11-15T00:00:00Z",
      status: "open" as const,
      reviewNote: null,
      closedAt: null,
    },
    actor = { role: "counselor" as const, userId: "c" };
  expect(() =>
    transitionAssistance(a, "CLOSE", actor, FIXED_NOW, { confirmed: true }),
  ).toThrow("INVALID_TRANSITION");
  const reviewed = transitionAssistance(a, "REVIEW", actor, FIXED_NOW, {
    reviewNote: "已联系学生核对进展",
  });
  expect(() =>
    transitionAssistance(reviewed, "CLOSE", actor, FIXED_NOW, {
      confirmed: false,
    }),
  ).toThrow();
  const closed = transitionAssistance(reviewed, "CLOSE", actor, FIXED_NOW, {
    confirmed: true,
  });
  expect(closed.status).toBe("closed");
  expect(closed.alertRuleIds).toEqual(a.alertRuleIds);
  expect(() =>
    transitionAssistance(closed, "REVIEW", actor, FIXED_NOW, {
      reviewNote: "再次修改",
    }),
  ).toThrow();
});
it("appointment confirms only within own scope and no overlap; student may cancel own only", () => {
  const a = {
    id: "a",
    revision: 1,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    studentId: "s",
    counselorId: "c",
    startsAt: "2026-11-15T01:00:00Z",
    endsAt: "2026-11-15T02:00:00Z",
    status: "pending" as const,
  };
  expect(
    transitionAppointment(
      a,
      "CONFIRM",
      { role: "counselor", userId: "c" },
      { studentUserId: "u", overlaps: false, now: FIXED_NOW },
      {},
    ).status,
  ).toBe("confirmed");
  expect(() =>
    transitionAppointment(
      a,
      "CONFIRM",
      { role: "counselor", userId: "c" },
      { studentUserId: "u", overlaps: true, now: FIXED_NOW },
      {},
    ),
  ).toThrow();
  expect(
    transitionAppointment(
      a,
      "CANCEL",
      { role: "student", userId: "u" },
      { studentUserId: "u", overlaps: false, now: FIXED_NOW },
      { reason: "时间冲突" },
    ).status,
  ).toBe("cancelled");
});
