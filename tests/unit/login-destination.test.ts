import { describe, it, expect } from "vitest";
import { loginDestination } from "../../src/domain/policy/routes";
describe("login return target stays in the actual role or public opportunities", () => {
  it.each([
    ["/student/resume", "/company"],
    ["/admin", "/company"],
    ["/company", "/company"],
    ["/company/jobs?status=open", "/company/jobs?status=open"],
    ["/companyish", "/company"],
    ["/company/../student", "/company"],
    ["/opportunities/job-1?source=home", "/opportunities/job-1?source=home"],
    ["/opportunities-fake", "/company"],
    ["https://evil.example/company", "/company"],
    ["//careerpilot.invalid/company/jobs", "/company"],
    ["//evil.example/company", "/company"],
    ["/\\evil.example/company", "/company"],
    ["/company/%", "/company"],
    [undefined, "/company"],
    [["/company/jobs"], "/company"],
  ])("resolves %j safely", (target, want) =>
    expect(loginDestination("company", target)).toBe(want),
  );
  it("retains a same-role deep link for students", () =>
    expect(loginDestination("student", "/student/mock/voice?title=Vue")).toBe(
      "/student/mock/voice?title=Vue",
    ));
});
