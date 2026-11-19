import { expect, it } from "vitest";
import {
  transitionApplication,
  transitionDestination,
  transitionMock,
} from "../../../src/domain/lifecycle/transition";
import { createSeedPack } from "../../../src/data/seed/seed";
import { demoActors } from "../../../src/types/identity";
import { FIXED_NOW } from "../../../src/domain/clock";
it("L01/L02 exact allowed application matrix and unauthorized rejection", () => {
  const seed = createSeedPack(),
    a = seed.applications[40]!,
    company = seed.jobs.find((j) => j.id === a.jobId)!.companyId,
    owner = seed.companies.find((c) => c.id === company)!.ownerUserId;
  const context = {
    now: FIXED_NOW,
    studentUserId: `user-${a.studentId}`,
    companyUserId: owner,
    hasSignedAgreement: false,
    hasOpenInterview: false,
    hasPassedInterview: false,
    hasActiveOffer: false,
  };
  const actor = { userId: owner, role: "company" as const };
  expect(
    transitionApplication(a, "START_SCREEN", actor, context, {}).status,
  ).toBe("screening");
  expect(() =>
    transitionApplication(a, "ISSUE_OFFER", actor, context, {}),
  ).toThrow("INVALID_TRANSITION");
  expect(() =>
    transitionApplication(a, "START_SCREEN", demoActors.student, context, {}),
  ).toThrow("FORBIDDEN");
  for (const status of ["rejected", "withdrawn", "closed"] as const)
    expect(() =>
      transitionApplication(
        { ...a, status },
        "START_SCREEN",
        actor,
        context,
        {},
      ),
    ).toThrow("INVALID_TRANSITION");
  const interview = { ...a, status: "interview" as const };
  expect(() =>
    transitionApplication(interview, "ISSUE_OFFER", actor, context, {}),
  ).toThrow("VALIDATION_ERROR");
  expect(
    transitionApplication(
      interview,
      "ISSUE_OFFER",
      actor,
      { ...context, hasPassedInterview: true },
      {},
    ).status,
  ).toBe("offered");
  expect(
    transitionApplication(
      interview,
      "COMPLETE_INTERVIEW",
      actor,
      { ...context, hasOpenInterview: true },
      { result: "fail", feedback: "反馈信息" },
    ).status,
  ).toBe("rejected");
});
it("L05 independent study proof allowed, approval restricted to own counselor", () => {
  const seed = createSeedPack(),
    d = {
      ...seed.destinations[20]!,
      status: "draft" as const,
      type: "furtherStudy" as const,
    },
    student = seed.students.find((s) => s.id === d.studentId)!;
  const context = {
    now: FIXED_NOW,
    studentUserId: student.userId,
    counselorUserId: student.counselorId,
    validSignedAgreement: false,
    attachmentsValid: true,
  };
  expect(
    transitionDestination(
      d,
      "SUBMIT",
      { role: "student", userId: student.userId },
      context,
      {},
    ).status,
  ).toBe("submitted");
  expect(() =>
    transitionDestination(
      { ...d, status: "submitted" },
      "APPROVE",
      demoActors.counselor,
      context,
      {},
    ),
  ).toThrow("FORBIDDEN");
  expect(() =>
    transitionDestination(
      { ...d, status: "submitted" },
      "REJECT",
      { role: "counselor", userId: student.counselorId },
      context,
      { reason: "短" },
    ),
  ).toThrow();
});
it("L07 mock state is separate, answers index and two followups bounded; completed immutable", () => {
  let m = createSeedPack().mockSessions[0]!;
  const context = { now: FIXED_NOW, studentUserId: demoActors.student.userId };
  m = transitionMock(m, "START", demoActors.student, context, {});
  m = transitionMock(m, "SUBMIT_ANSWER", demoActors.student, context, {
    text: "项目期间负责开发",
  });
  expect(m.questionIndex).toBe(1);
  expect(m.answers).toHaveLength(1);
  m = transitionMock(m, "FOLLOW_UP", demoActors.student, context, {
    text: "交付3个页面",
  });
  m = transitionMock(m, "FOLLOW_UP", demoActors.student, context, {
    text: "完成任务",
  });
  expect(() =>
    transitionMock(m, "FOLLOW_UP", demoActors.student, context, {
      text: "多余追问",
    }),
  ).toThrow();
  m = transitionMock(m, "PAUSE", demoActors.student, context, {});
  expect(m.state).toBe("paused");
  m = transitionMock(m, "RESUME", demoActors.student, context, {});
  m = transitionMock(m, "END_EARLY", demoActors.student, context, {});
  expect(m.state).toBe("completed");
  expect(() =>
    transitionMock(m, "SUBMIT_ANSWER", demoActors.student, context, {
      text: "再次提交",
    }),
  ).toThrow();
});
