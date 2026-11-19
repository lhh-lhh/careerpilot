import { expect, it } from "vitest";
import {
  renderResumePages,
  canExportResume,
} from "../../src/domain/resume/presentation";
import { jpegPagesPdf } from "../../src/services/resume-pdf";
import type { ResumeSections } from "../../src/types/entities";
const sections: ResumeSections = {
  basic: {
    name: "陈同学",
    email: "chen@example.com",
    majorId: "major-1",
    degree: "bachelor",
  },
  education: [
    {
      id: "e",
      school: "本人院校",
      majorId: "major-1",
      degree: "bachelor",
      startDate: "2023-09-01",
      endDate: null,
    },
  ],
  experience: [],
  projects: [
    {
      id: "p",
      name: "课程项目",
      role: "前端开发",
      startDate: "2026-01-01",
      endDate: null,
      description: "完成筛选页面，交付4个组件。",
    },
  ],
  skills: [{ id: "s", skillId: "skill-1" }],
  certificates: [],
  intent: { cityIds: ["city-1"], expectedSalary: null },
};
const label = (id: string) =>
  ({
    "major-1": "软件工程",
    bachelor: "本科",
    "city-1": "上海",
    "skill-1": "Vue",
  })[id] ?? id;
it("exports saved, apply-ready facts in a blue two-column template without inventing fields", () => {
  expect(canExportResume({ ...sections, education: [] })).toBe(false);
  expect(canExportResume(sections)).toBe(true);
  const pages = renderResumePages(sections, label);
  expect(pages).toHaveLength(1);
  for (const fact of [
    "陈同学",
    "本人院校",
    "软件工程",
    "本科",
    "课程项目",
    "4个组件",
    "Vue",
  ])
    expect(pages[0]).toContain(fact);
  expect(pages[0]).not.toMatch(/WPS|性别|年龄|示例|电话：/);
});
it("escapes user text and paginates long content without dropping the last fact", () => {
  const long = structuredClone(sections);
  long.projects[0]!.name = "<script>bad()</script>";
  long.projects[0]!.description =
    "负责需求拆解与组件实现。\n".repeat(100) + "最后一条真实成果";
  const pages = renderResumePages(long, label);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.join("")).not.toContain("<script>");
  expect(pages.join("")).toContain("&lt;script&gt;");
  expect(pages.at(-1)).toContain("最后一条真实成果");
});
it("creates a multi-page PDF with valid image references and byte-accurate cross reference", () => {
  const pdf = jpegPagesPdf([
    { bytes: new Uint8Array([255, 216, 255, 217]), width: 1588, height: 2246 },
    { bytes: new Uint8Array([255, 216, 255, 217]), width: 1588, height: 2246 },
  ]);
  const text = new TextDecoder("latin1").decode(pdf);
  expect(text).toMatch(/^%PDF-1.4/);
  expect(text).toContain("/Count 2");
  expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2);
  const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
  expect(new TextDecoder().decode(pdf.slice(xref, xref + 4))).toBe("xref");
});

it("keeps unusually long sidebar facts inside A4 and includes their complete text in a supplement", () => {
  const long = structuredClone(sections);
  long.basic.name = "长姓名".repeat(15);
  long.basic.email = "a".repeat(220) + "@example.com";
  long.intent.cityIds = Array.from({ length: 56 }, (_, i) => `city-${i}`);
  const pages = renderResumePages(
    long,
    (id) => (id.startsWith("city-") ? "测试城市" + id.slice(5) : label(id)),
    "岗位职责名称".repeat(35),
  );
  const output = pages.join("");
  expect(output).toContain("补充信息");
  expect(output).toContain("测试城市55");
  for (const match of output.matchAll(/<text x="(\d+)" y="(\d+)"/g))
    expect(Number(match[2])).toBeLessThanOrEqual(1085);
});
