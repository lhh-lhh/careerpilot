import { expect, it } from "vitest";
import type {
  ApplicationStatus,
  MockSession,
} from "../../../src/types/entities";
import {
  transitionApplication,
  transitionDestination,
  transitionMock,
  type ApplicationAction,
  type DestinationAction,
  type MockAction,
} from "../../../src/domain/lifecycle/transition";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
const seed = createSeedPack();
const company = { role: "company" as const, userId: "company-owner" },
  student = { role: "student" as const, userId: "student-owner" },
  counselor = { role: "counselor" as const, userId: "counselor-owner" };
const statuses: ApplicationStatus[] = [
  "applied",
  "screening",
  "interview",
  "offered",
  "rejected",
  "withdrawn",
  "closed",
];
const allowed: Record<ApplicationAction, ApplicationStatus[]> = {
  START_SCREEN: ["applied"],
  SCHEDULE_INTERVIEW: ["applied", "screening"],
  RESCHEDULE: ["interview"],
  COMPLETE_INTERVIEW: ["interview"],
  CANCEL_INTERVIEW: ["interview"],
  CONFIRM_INTERVIEW: ["interview"],
  DECLINE_INTERVIEW: ["interview"],
  REQUEST_RESCHEDULE: ["interview"],
  ISSUE_OFFER: ["interview"],
  ISSUE_OFFER_DOCUMENT: ["interview", "offered"],
  ACCEPT_OFFER: ["offered"],
  WITHDRAW_OFFER: ["offered"],
  REJECT: ["applied", "screening", "interview"],
  WITHDRAW: ["applied", "screening", "interview", "offered"],
  DECLINE_OFFER: ["offered"],
  CREATE_AGREEMENT: ["offered"],
  CONFIRM_AGREEMENT: ["offered"],
  TERMINATE_AGREEMENT: ["closed"],
};
for (const [event, valid] of Object.entries(allowed) as [
  ApplicationAction,
  ApplicationStatus[],
][])
  for (const status of statuses) {
    it(`L01/L02 ${status} × ${event}`, () => {
      const actor = ["WITHDRAW", "ACCEPT_OFFER", "DECLINE_OFFER", "CONFIRM_INTERVIEW", "DECLINE_INTERVIEW", "REQUEST_RESCHEDULE"].includes(event)
        ? student
        : company;
      const context = {
        now: FIXED_NOW,
        studentUserId: student.userId,
        companyUserId: company.userId,
        hasSignedAgreement: event === "TERMINATE_AGREEMENT",
        hasOpenInterview: true,
        hasPassedInterview: true,
        hasActiveOffer: false,
        interviewScheduledAt: "2026-12-01T00:00:00Z",
      };
      if (["SCHEDULE_INTERVIEW", "ISSUE_OFFER_DOCUMENT"].includes(event)) context.hasOpenInterview = false;
      const call = () =>
        transitionApplication(
          { ...seed.applications[0]!, status, closedReason: null },
          event,
          actor,
          context,
          {
            scheduledAt: "2026-12-01T00:00:00Z",
            location: "教学会议室",
            result: "pass",
            feedback: "面试已完成",
            reason: "完整测试原因说明",
            bothPartiesConsent: true,
          },
        );
      if (valid.includes(status))
        expect(call().status).toBe(
          (
            {
              START_SCREEN: "screening",
              SCHEDULE_INTERVIEW: "interview",
              RESCHEDULE: "interview",
              COMPLETE_INTERVIEW: "interview",
              CANCEL_INTERVIEW: "screening",
              CONFIRM_INTERVIEW: "interview",
              DECLINE_INTERVIEW: "screening",
              REQUEST_RESCHEDULE: "interview",
              ISSUE_OFFER: "offered",
              ISSUE_OFFER_DOCUMENT: "offered",
              ACCEPT_OFFER: "offered",
              WITHDRAW_OFFER: "offered",
              REJECT: "rejected",
              WITHDRAW: "withdrawn",
              DECLINE_OFFER: "closed",
              CREATE_AGREEMENT: "offered",
              CONFIRM_AGREEMENT: "offered",
              TERMINATE_AGREEMENT: "closed",
            } as const
          )[event],
        );
      else expect(call).toThrow("INVALID_TRANSITION");
    });
  }
const destinationAllowed: Record<DestinationAction, string[]> = {
  EDIT: ["draft", "rejected"],
  SUBMIT: ["draft", "rejected"],
  APPROVE: ["submitted"],
  REJECT: ["submitted"],
  WITHDRAW: ["submitted"],
  REVOKE_APPROVAL: ["approved"],
};
for (const [event, valid] of Object.entries(destinationAllowed) as [
  DestinationAction,
  string[],
][])
  for (const status of [
    "draft",
    "submitted",
    "approved",
    "rejected",
  ] as const) {
    it(`L05 ${status} × ${event}`, () => {
      const actor = ["APPROVE", "REJECT", "REVOKE_APPROVAL"].includes(event)
        ? counselor
        : student;
      const call = () =>
        transitionDestination(
          { ...seed.destinations[0]!, status },
          event,
          actor,
          {
            now: FIXED_NOW,
            studentUserId: student.userId,
            counselorUserId: counselor.userId,
            validSignedAgreement: true,
            attachmentsValid: true,
          },
          { reason: "核实材料后重新处理" },
        );
      if (valid.includes(status)) expect(call().revision).toBe(2);
      else expect(call).toThrow("INVALID_TRANSITION");
    });
  }
it("destination conditional validation, all sources and invalid associations", () => {
  const original = { ...seed.destinations[0]!, status: "draft" as const };
  const context = {
    now: FIXED_NOW,
    studentUserId: student.userId,
    counselorUserId: counselor.userId,
    validSignedAgreement: true,
    attachmentsValid: true,
  };
  const submit = (overrides: Partial<typeof original>, ctx = context) =>
    transitionDestination(
      { ...original, ...overrides },
      "SUBMIT",
      student,
      ctx,
      {},
    );
  expect(
    submit({
      type: "employment",
      source: "external",
      applicationId: null,
      agreementId: null,
    }).status,
  ).toBe("submitted");
  for (const type of ["entrepreneurship", "flexible", "unemployed"] as const)
    expect(
      submit({
        type,
        source: "independent",
        applicationId: null,
        agreementId: null,
      }).status,
    ).toBe("submitted");
  expect(() =>
    submit({}, { ...context, validSignedAgreement: false }),
  ).toThrow();
  expect(() => submit({}, { ...context, attachmentsValid: false })).toThrow();
  expect(() => submit({ attachmentIds: Array(6).fill("a") })).toThrow();
  expect(() => submit({ source: "external" })).toThrow();
  expect(() => submit({ organizationName: "" })).toThrow();
  expect(() =>
    submit({
      type: "furtherStudy",
      source: "independent",
      applicationId: null,
      agreementId: null,
      industryId: "industry-1",
    }),
  ).toThrow();
});
const mockAllowed: Record<MockAction, MockSession["state"][]> = {
  START: ["ready"],
  PAUSE: ["inProgress"],
  RESUME: ["paused"],
  SUBMIT_ANSWER: ["inProgress"],
  SKIP: ["inProgress"],
  FOLLOW_UP: ["inProgress"],
  END_EARLY: ["inProgress"],
  ABANDON: ["ready", "inProgress", "paused"],
};
for (const [event, valid] of Object.entries(mockAllowed) as [
  MockAction,
  MockSession["state"][],
][])
  for (const state of [
    "ready",
    "inProgress",
    "paused",
    "completed",
    "abandoned",
  ] as const) {
    it(`L07 ${state} × ${event}`, () => {
      const m = {
        ...seed.mockSessions[0]!,
        state,
        questionIndex: event === "FOLLOW_UP" ? 1 : 0,
      };
      const call = () =>
        transitionMock(
          m,
          event,
          { role: "student", userId: "user-student-001" },
          { now: FIXED_NOW, studentUserId: "user-student-001" },
          { text: "项目经历的完整回答" },
        );
      if (valid.includes(state)) expect(call().revision).toBe(2);
      else expect(call).toThrow("INVALID_TRANSITION");
    });
  }
it("mock final question completes, skips zero and unauthorized never mutates", () => {
  const m = {
    ...seed.mockSessions[0]!,
    state: "inProgress" as const,
    questionIndex: 2,
  };
  expect(
    transitionMock(
      m,
      "SKIP",
      { role: "student", userId: "user-student-001" },
      { now: FIXED_NOW, studentUserId: "user-student-001" },
      {},
    ),
  ).toMatchObject({ state: "completed", questionIndex: 3 });
  expect(() =>
    transitionMock(
      m,
      "SKIP",
      company,
      { now: FIXED_NOW, studentUserId: "user-student-001" },
      {},
    ),
  ).toThrow("FORBIDDEN");
  expect(() =>
    transitionMock(
      m,
      "SUBMIT_ANSWER",
      { role: "student", userId: "user-student-001" },
      { now: FIXED_NOW, studentUserId: "user-student-001" },
      { text: "" },
    ),
  ).toThrow();
  expect(() =>
    transitionMock(
      m,
      "SUBMIT_ANSWER",
      { role: "student", userId: "user-student-001" },
      { now: FIXED_NOW, studentUserId: "user-student-001" },
      { text: "字".repeat(4001) },
    ),
  ).toThrow();
});
