import { expect, it } from "vitest";
import { createSeedPack } from "../../../src/data/seed/seed";
import {
  resumeRequestInput,
  interviewRequestInput,
} from "../../../src/services/ai-requests";
it("AI08 services retain original entity mapping locally but expose only masked field aliases", () => {
  const seed = createSeedPack(),
    resume = seed.resumes[0]!;
  resume.sections.projects[0]!.description =
    "林知夏负责页面开发，邮箱demo@example.invalid，电话13812345678。";
  const input = resumeRequestInput(resume, seed.jobs[0]!, "structure", false);
  const encoded = JSON.stringify(input.variables);
  for (const secret of [
    resume.id,
    resume.versionIds[0]!,
    resume.sections.projects[0]!.id,
    "林知夏",
    "demo@example.invalid",
    "13812345678",
  ])
    expect(encoded).not.toContain(secret);
  expect(input.local.fields["projects.item-1.description"]).toBe(
    `projects.${resume.sections.projects[0]!.id}.description`,
  );
  expect(resume.sections.projects[0]!.description).toContain("林知夏");
});
it("AI08 A2 only includes current-question answers, mapped answer IDs and no filename/whole resume", () => {
  const seed = createSeedPack(),
    session = seed.mockSessions[0]!;
  session.answers = [
    {
      id: "real-answer-a",
      questionId: "question-001",
      kind: "answer",
      text: "林知夏完成开发",
      submittedAt: session.createdAt,
      evidence: [],
    },
    {
      id: "real-answer-b",
      questionId: "question-002",
      kind: "answer",
      text: "不应外发的其他题回答",
      submittedAt: session.createdAt,
      evidence: [],
    },
  ];
  const input = interviewRequestInput(
    session,
    seed.mockQuestions[0]!,
    seed.jobs[0]!,
    ["林知夏"],
  );
  expect(input.variables.answers).toEqual([
    { id: "answer-1", kind: "answer", text: "[姓名]完成开发" },
  ]);
  expect(input.local.answers["answer-1"]).toBe("real-answer-a");
});
