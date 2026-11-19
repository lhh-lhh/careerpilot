import { expect, it } from "vitest";
import {
  transitionJob,
  transitionAssistance,
  transitionAppointment,
} from "../../../src/domain/lifecycle/support";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
const company = { role: "company" as const, userId: "owner" },
  counselor = { role: "counselor" as const, userId: "c" };
for (const status of ["draft", "published", "closed"] as const)
  for (const action of ["PUBLISH", "CLOSE"] as const)
    it(`L02 job ${status} × ${action}`, () => {
      const run = () =>
        transitionJob(
          { ...createSeedPack().jobs[0]!, status },
          action,
          company,
          company.userId,
          FIXED_NOW,
        );
      const valid =
        action === "PUBLISH" ? status !== "published" : status === "published";
      if (valid)
        expect(run().status).toBe(
          action === "PUBLISH" ? "published" : "closed",
        );
      else expect(run).toThrow("INVALID_TRANSITION");
    });
for (const status of ["open", "reviewed", "closed"] as const)
  for (const action of ["REVIEW", "CLOSE"] as const)
    it(`L06 assistance ${status} × ${action}`, () => {
      const record = {
        id: "a",
        revision: 1,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        studentId: "s",
        counselorId: "c",
        alertRuleIds: ["resumeIncomplete"],
        note: "联系学生完善简历并复核材料",
        nextReviewAt: FIXED_NOW,
        status,
        reviewNote: "已完成辅导复查",
        closedAt: null,
      };
      const run = () =>
        transitionAssistance(record, action, counselor, FIXED_NOW, {
          reviewNote: "已完成复查",
          confirmed: true,
        });
      if (action === "REVIEW" ? status === "open" : status === "reviewed")
        expect(run().status).toBe(action === "REVIEW" ? "reviewed" : "closed");
      else expect(run).toThrow("INVALID_TRANSITION");
      expect(() =>
        transitionAssistance(
          record,
          action,
          { role: "counselor", userId: "other" },
          FIXED_NOW,
          {},
        ),
      ).toThrow("FORBIDDEN");
    });
for (const status of [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
] as const)
  for (const action of ["CONFIRM", "COMPLETE", "CANCEL"] as const)
    it(`L02 appointment ${status} × ${action}`, () => {
      const record = {
        id: "a",
        revision: 1,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        studentId: "s",
        counselorId: "c",
        startsAt: "2026-11-15T01:00:00.000Z",
        endsAt: "2026-11-15T02:00:00.000Z",
        status,
      };
      const context = { studentUserId: "u", overlaps: false, now: FIXED_NOW };
      const run = () =>
        transitionAppointment(record, action, counselor, context, {
          reason: "学生时间冲突",
        });
      const valid =
        action === "CONFIRM"
          ? status === "pending"
          : action === "COMPLETE"
            ? status === "confirmed"
            : status === "pending" || status === "confirmed";
      if (valid)
        expect(run().status).toBe(
          (
            {
              CONFIRM: "confirmed",
              COMPLETE: "completed",
              CANCEL: "cancelled",
            } as const
          )[action],
        );
      else expect(run).toThrow("INVALID_TRANSITION");
      expect(() =>
        transitionAppointment(
          record,
          action,
          { role: "student", userId: "other" },
          context,
          { reason: "测试取消" },
        ),
      ).toThrow("FORBIDDEN");
    });
