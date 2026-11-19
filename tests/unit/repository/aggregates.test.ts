import { expect, it } from "vitest";
import expected from "../../../src/data/seed/expected-aggregates.json";
import { createSeedPack, validateSeedPack } from "../../../src/data/seed/seed";
it("D01 counselor and major partitions match independent aggregate fixtures and recombine globally", () => {
  const s = createSeedPack();
  expect(validateSeedPack(s)).toEqual([]);
  for (const [kind, groups] of Object.entries({
    counselors: expected.counselors,
    majors: expected.majors,
  }))
    for (const group of groups) {
      const students = s.students.filter((student) =>
          kind === "counselors"
            ? student.counselorId === group.id
            : student.majorId === group.id,
        ),
        ids = new Set(students.map((x) => x.id));
      const apps = s.applications.filter((a) => ids.has(a.studentId)),
        appIds = new Set(apps.map((a) => a.id));
      const interviews = s.interviews.filter((i) =>
        appIds.has(i.applicationId),
      );
      expect({
        id: group.id,
        students: students.length,
        applications: apps.length,
        approved: s.destinations.filter(
          (d) => ids.has(d.studentId) && d.status === "approved",
        ).length,
        pass: interviews.filter((i) => i.result === "pass").length,
        fail: interviews.filter((i) => i.result === "fail").length,
        pending: interviews.filter((i) => i.result === "pending").length,
        signed: s.agreements.filter(
          (a) => ids.has(a.studentId) && a.status === "signed",
        ).length,
      }).toEqual(group);
    }
  expect(expected.counselors.reduce((sum, c) => sum + c.students, 0)).toBe(40);
  expect(expected.majors.reduce((sum, c) => sum + c.approved, 0)).toBe(20);
});
