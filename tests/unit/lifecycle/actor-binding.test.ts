import { expect, it } from "vitest";
import { transitionMock } from "../../../src/domain/lifecycle/transition";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";

it("L07 mock authorization uses the supplied User binding, not a seed ID naming convention", () => {
  const session = {
    ...createSeedPack().mockSessions[0]!,
    studentId: "student-independent-uuid",
  };
  const context = { now: FIXED_NOW, studentUserId: "account-unrelated-uuid" };
  expect(
    transitionMock(
      session,
      "START",
      { role: "student", userId: "account-unrelated-uuid" },
      context,
      {},
    ).state,
  ).toBe("inProgress");
  expect(() =>
    transitionMock(
      session,
      "START",
      { role: "student", userId: "user-student-independent-uuid" },
      context,
      {},
    ),
  ).toThrow("FORBIDDEN");
  expect(session.state).toBe("ready");
});
