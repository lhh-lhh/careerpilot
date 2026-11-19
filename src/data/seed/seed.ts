import type {
  Base,
  DictionaryKind,
  EntityMap,
  MetricProjection,
  ResumeSections,
  SeedPack,
} from "../../types/entities";
import { DESTINATION_DEADLINE, FIXED_NOW } from "../../domain/clock";
import { stores } from "../../adapters/repository/db";
import { createTeachingProof } from "./proof";
import { match, prepareOntology } from "../../domain/matching/scoring";
import { replayProjections } from "../../domain/metrics/calculate";
import { majorCities } from '../reference/cities';

const pad = (n: number) => String(n).padStart(3, "0");
const at = (day: number) =>
  `2026-10-${String(day).padStart(2, "0")}T02:00:00.000Z`;
const base = (id: string, createdAt = at(1)): Base => ({
  id,
  revision: 1,
  createdAt,
  updatedAt: createdAt,
});
export function createSeedPack(): SeedPack {
  const p = Object.fromEntries(
    Object.keys(stores).map((key) => [key, []]),
  ) as unknown as SeedPack;
  const dictionary = (
    kind: DictionaryKind,
    code: string,
    label: string,
    parentId: string | null = null,
  ) =>
    p.dictionaries.push({
      ...base(`${kind}-${code}`),
      kind,
      code,
      label,
      parentId,
      active: true,
    });
  ["数字工程学院", "商学与设计学院"].forEach((x, i) =>
    dictionary("college", String(i + 1), x),
  );
  ["软件工程", "数据科学", "市场营销", "视觉传达"].forEach((x, i) =>
    dictionary("major", String(i + 1), x, `college-${i < 2 ? 1 : 2}`),
  );
  [
    "数字科技",
    "智能制造",
    "现代服务",
    "文化创意",
    "绿色能源",
    "健康科技",
  ].forEach((x, i) => dictionary("industry", String(i + 1), x));
  majorCities.forEach(city=>dictionary('city',city.code,city.label));
  dictionary("jobCategory", "digital", "数字产品与技术");
  ["secondary", "associate", "bachelor", "master", "doctor"].forEach((x, i) =>
    dictionary("degree", x, ["中职", "专科", "本科", "硕士", "博士"][i]!),
  );
  const skills = [
    "JavaScript",
    "Vue",
    "TypeScript",
    "数据分析",
    "SQL",
    "用户研究",
    "视觉设计",
    "项目协作",
  ];
  skills.forEach((canonical, i) =>
    p.skillOntology.push({
      ...base(`skill-${i + 1}`),
      canonical,
      aliases: i === 0 ? ["js"] : i === 1 ? ["vue.js"] : [],
      parentIds: [],
      learningCostDays: 7 + i,
    }),
  );
  p.skillOntology.push({
    ...base("skill-pinia"),
    canonical: "Pinia",
    aliases: [],
    parentIds: ["skill-2"],
    learningCostDays: 5,
  });
  for (let i = 1; i <= 4; i++)
    p.users.push({
      ...base(`user-counselor-${pad(i)}`),
      login: `counselor${i}`,
      displayName: `辅导员${["青禾", "知微", "远川", "星野"][i - 1]}`,
      role: "counselor",
      active: true,
      studentId: null,
      companyId: null,
    });
  p.users.push({
    ...base("user-admin-001"),
    login: "admin",
    displayName: "演示管理员",
    role: "admin",
    active: true,
    studentId: null,
    companyId: null,
  });
  const names = [
    "林知夏",
    "陈予安",
    "周景行",
    "苏亦宁",
    "许星禾",
    "叶书言",
    "沈清越",
    "顾云舟",
  ];
  for (let i = 1; i <= 40; i++) {
    const id = `student-${pad(i)}`,
      userId = `user-${id}`,
      major = ((i - 1) % 4) + 1;
    p.users.push({
      ...base(userId),
      login: `student${pad(i)}`,
      displayName: `${names[(i - 1) % 8]}${i > 8 ? `·${Math.ceil(i / 8)}` : ""}`,
      role: "student",
      active: true,
      studentId: id,
      companyId: null,
    });
    p.students.push({
      ...base(id),
      userId,
      studentNo: `DEMO2026${pad(i)}`,
      collegeId: `college-${major <= 2 ? 1 : 2}`,
      majorId: `major-${major}`,
      cohortYear: 2027,
      counselorId: `user-counselor-${pad(Math.floor((i - 1) / 10) + 1)}`,
      enrolledAt: at(1),
      active: true,
    });
    const sections: ResumeSections = {
      basic: {
        name: p.users.at(-1)!.displayName,
        email: `student${pad(i)}@example.invalid`,
        majorId: `major-${major}`,
        degree: "bachelor",
      },
      education: [
        {
          id: `edu-${pad(i)}`,
          school: "示例城市大学",
          majorId: `major-${major}`,
          degree: "bachelor",
          startDate: "2023-09-01",
          endDate: "2027-06-30",
        },
      ],
      experience:
        i % 4 === 0
          ? []
          : [
              {
                id: `exp-${pad(i)}`,
                company: "示例校园数字服务中心",
                title: "项目助理",
                startDate: "2025-07-01",
                endDate: "2025-09-01",
                description:
                  "在校园服务项目期间，负责需求梳理，组织同学访谈并完成页面开发，交付了3个可演示模块。",
              },
            ],
      projects: [
        {
          id: `project-${pad(i)}`,
          name: "校园便民服务平台",
          role: "前端开发",
          startDate: "2025-01-01",
          endDate: "2025-06-01",
          description:
            "在课程项目期间，负责前端页面设计与开发，实现信息筛选与状态管理，完成4个核心页面的交付。",
        },
      ],
      skills: skills
        .filter((_, k) => i === 1 || k % 4 === (i - 1) % 4 || k === i % 8)
        .map((canonical) => ({
          id: `resume-skill-${i}-${skills.indexOf(canonical) + 1}`,
          skillId: `skill-${skills.indexOf(canonical) + 1}`,
        })),
      certificates: [
        {
          id: `cert-${pad(i)}`,
          name: "校内项目实践证书（教学示例）",
          issuer: "示例城市大学",
          awardedAt: "2025-12-01",
        },
      ],
      intent: {
        cityIds:
          i === 1
            ? ["city-1", "city-2", "city-3"]
            : [`city-${((i - 1) % 3) + 1}`],
        expectedSalary: { min: 8000, max: 16000 },
      },
    };
    const rid = `resume-${pad(i)}`,
      vid = `resume-version-${pad(i)}-1`;
    p.resumes.push({
      ...base(rid),
      studentId: id,
      sections,
      isPublic: false,
      versionIds: [vid],
    });
    p.resumeVersions.push({
      id: vid,
      resumeId: rid,
      number: 1,
      snapshot: structuredClone(sections),
      reason: "initial",
      createdAt: at(1),
    });
  }
  const companies = [
    "青屿数字",
    "知行智造",
    "云帆服务",
    "原野创意",
    "沐光能源",
    "澄心健康",
    "行远科技",
    "新芽设计",
  ];
  for (let i = 1; i <= 8; i++) {
    const id = `company-${pad(i)}`,
      uid = `user-${id}`;
    p.users.push({
      ...base(uid),
      login: `company${i}`,
      displayName: `${companies[i - 1]}招聘团队`,
      role: "company",
      active: true,
      studentId: null,
      companyId: id,
    });
    p.companies.push({
      ...base(id),
      ownerUserId: uid,
      name: `${companies[i - 1]}（虚构）`,
      industryId: `industry-${((i - 1) % 6) + 1}`,
      cityId: `city-${((i - 1) % 3) + 1}`,
      scale: "100–499人",
      description: "服务校园人才成长的虚构教学企业，不代表任何真实机构。",
      verified: true,
    });
  }
  const titles = [
    "前端开发工程师",
    "数据分析助理",
    "产品运营专员",
    "交互设计师",
    "软件测试工程师",
    "数字营销专员",
    "用户研究助理",
    "项目协调专员",
  ];
  for (let i = 1; i <= 100; i++) {
    const company = p.companies[(i - 1) % 8]!;
    p.jobs.push({
      ...base(`job-${pad(i)}`),
      companyId: company.id,
      title: titles[(i - 1) % 8]!,
      categoryId: "jobCategory-digital",
      industryId: company.industryId,
      cityId: `city-${((i - 1) % 3) + 1}`,
      salaryRange: { min: 8000 + (i % 4) * 1000, max: 12000 + (i % 4) * 1000 },
      requiredSkills: [{ skillId: `skill-${((i - 1) % 8) + 1}`, weight: 1 }],
      preferredMajorIds: [],
      minDegree: "bachelor",
      minExperienceMonths: 0,
      jdText: `参与${titles[(i - 1) % 8]}相关项目，重视真实实践经历、沟通协作与持续学习。本岗位及企业均为教学示例。`,
      deadline: "2026-12-31T16:00:00.000Z",
      status: "published",
    });
  }
  let sequence = 0;
  function audit(
    entityType: string,
    entityId: string,
    action: string,
    when: string,
    before: MetricProjection | null,
    after: MetricProjection,
    actorUserId = "user-admin-001",
  ) {
    sequence++;
    p.auditLogs.push({
      id: `audit-${pad(sequence)}`,
      sequence,
      actorUserId,
      entityType,
      entityId,
      action,
      at: when,
      reason: null,
      commandId: `seed-${pad(sequence)}`,
      before,
      after,
    });
  }
  p.students.forEach((s) =>
    audit("Student", s.id, "CREATE", s.createdAt, null, {
      studentId: s.id,
      counselorId: s.counselorId,
      collegeId: s.collegeId,
      majorId: s.majorId,
      cohortYear: s.cohortYear,
      active: s.active,
      createdAt: s.createdAt,
    }),
  );
  for (let i = 1; i <= 120; i++) {
    const student = p.students[(i - 1) % 40]!,
      resume = p.resumes[(i - 1) % 40]!,
      job = p.jobs[(i - 1) % 100]!,
      id = `application-${pad(i)}`;
    const snapshot = structuredClone(resume.sections);
    snapshot.basic.email = "[已脱敏]";
    const application: EntityMap["applications"] = {
      ...base(id, at(2)),
      studentId: student.id,
      jobId: job.id,
      status: "applied",
      resumeSnapshot: snapshot,
      resumeVersionId: resume.versionIds[0]!,
      resumeConsent: true,
      closedReason: null,
      matchSnapshot: match(
        resume,
        job,
        undefined,
        p.skillOntology,
        p.dictionaries,
        at(2),
      ),
    };
    const projection = (status: string): MetricProjection => ({
      studentId: student.id,
      jobId: job.id,
      companyId: job.companyId,
      applicationId: id,
      status,
      createdAt: at(2),
    });
    const event = (
      name: string,
      status: EntityMap["applications"]["status"],
      day: number,
    ) => {
      const from = application.status;
      p.applicationEvents.push({
        id: `event-${id}-${name}`,
        applicationId: id,
        actorUserId:
          name === "APPLY"
            ? student.userId
            : p.companies.find((c) => c.id === job.companyId)!.ownerUserId,
        event: name,
        from: name === "APPLY" ? "none" : from,
        to: status,
        at: at(day),
        commandId: `seed-${id}-${name}`,
        reason: null,
      });
      audit(
        "Application",
        id,
        name,
        at(day),
        name === "APPLY" ? null : projection(from),
        projection(status),
      );
      application.status = status;
      application.updatedAt = at(day);
    };
    event("APPLY", "applied", 2);
    if (i <= 40) {
      event("SCHEDULE_INTERVIEW", "interview", 4);
      const status = i <= 30 ? "completed" : "scheduled",
        result = i <= 20 ? "pass" : i <= 30 ? "fail" : "pending";
      const interview = {
        ...base(`interview-${pad(i)}`, at(4)),
        applicationId: id,
        scheduledAt: at(6),
        location: "教学在线会议室",
        status,
        result,
        feedback: i <= 30 ? "已完成教学面试评估，反馈仅用于演示。" : "",
      } as EntityMap["interviews"];
      audit("Interview", interview.id, "SCHEDULE_INTERVIEW", at(4), null, {
        applicationId: id,
        studentId: student.id,
        status: "scheduled",
        result: "pending",
        scheduledAt: at(6),
        createdAt: at(4),
      });
      if (i <= 30) {
        event("COMPLETE_INTERVIEW", i <= 20 ? "interview" : "rejected", 6);
        audit(
          "Interview",
          interview.id,
          "COMPLETE_INTERVIEW",
          at(6),
          {
            applicationId: id,
            studentId: student.id,
            status: "scheduled",
            result: "pending",
            scheduledAt: at(6),
          },
          {
            applicationId: id,
            studentId: student.id,
            status,
            result,
            scheduledAt: at(6),
            createdAt: at(4),
          },
        );
      }
      p.interviews.push(interview);
      if (i <= 20) event("ISSUE_OFFER", "offered", 8);
      if (i <= 12) {
        event("CONFIRM_AGREEMENT", "closed", 10);
        application.closedReason = "accepted";
        const agreement: EntityMap["agreements"] = {
          ...base(`agreement-${pad(i)}`, at(9)),
          applicationId: id,
          studentId: student.id,
          companyId: job.companyId,
          status: "signed",
          studentConfirmedAt: at(10),
          companyConfirmedAt: at(10),
          signedAt: at(10),
          terminatedAt: null,
          terminationReason: null,
        };
        p.agreements.push(agreement);
        audit("Agreement", agreement.id, "CREATE_AGREEMENT", at(9), null, {
          applicationId: id,
          studentId: student.id,
          companyId: job.companyId,
          status: "draft",
          signedAt: null,
          createdAt: at(9),
        });
        audit(
          "Agreement",
          agreement.id,
          "CONFIRM_AGREEMENT",
          at(10),
          { applicationId: id, studentId: student.id, status: "draft" },
          {
            applicationId: id,
            studentId: student.id,
            companyId: job.companyId,
            status: "signed",
            signedAt: at(10),
            createdAt: at(9),
          },
        );
      }
    }
    p.applications.push(application);
  }
  for (let i = 1; i <= 25; i++) {
    const student = p.students[i - 1]!,
      agreement = i <= 12 ? p.agreements[i - 1]! : null;
    const type =
      i <= 12
        ? "employment"
        : i <= 17
          ? "furtherStudy"
          : i <= 19
            ? "entrepreneurship"
            : "flexible";
    const blob = createTeachingProof();
    const aid = `attachment-${pad(i)}`;
    p.attachments.push({
      ...base(aid, at(11)),
      studentId: student.id,
      fileName: "教学示例证明.pdf",
      mime: "application/pdf",
      size: blob.size,
      blob,
    });
    const d: EntityMap["destinations"] = {
      ...base(`destination-${pad(i)}`, at(11)),
      studentId: student.id,
      type,
      source: agreement ? "internal" : "independent",
      applicationId: agreement?.applicationId ?? null,
      agreementId: agreement?.id ?? null,
      organizationName: agreement
        ? p.companies.find((c) => c.id === agreement.companyId)!.name
        : "示例学习与实践机构（虚构）",
      industryId: agreement
        ? p.companies.find((c) => c.id === agreement.companyId)!.industryId
        : null,
      status: i <= 20 ? "approved" : "submitted",
      attachmentIds: [aid],
      submittedAt: at(12),
      approvedAt: i <= 20 ? at(14) : null,
      reviewedBy: i <= 20 ? student.counselorId : null,
      reviewReason: null,
    };
    p.destinations.push(d);
    const project = (status: string): MetricProjection => ({
      studentId: d.studentId,
      type: d.type,
      source: d.source,
      ...(d.industryId ? { industryId: d.industryId } : {}),
      status,
      createdAt: d.createdAt,
      submittedAt: status === "draft" ? null : at(12),
      approvedAt: status === "approved" ? at(14) : null,
    });
    audit("Destination", d.id, "CREATE", at(11), null, project("draft"));
    audit(
      "Destination",
      d.id,
      "SUBMIT",
      at(12),
      project("draft"),
      project("submitted"),
    );
    if (d.status === "approved")
      audit(
        "Destination",
        d.id,
        "APPROVE",
        at(14),
        project("submitted"),
        project("approved"),
        student.counselorId,
      );
  }
  for (let i = 1; i <= 24; i++) {
    const type = (["behavior", "technical", "hr"] as const)[(i - 1) % 3]!;
    p.mockQuestions.push({
      ...base(`question-${pad(i)}`),
      categoryId: "jobCategory-digital",
      type,
      difficulty: i <= 12 ? "basic" : "advanced",
      text:
        type === "behavior"
          ? `请介绍一次你参与项目并解决困难的经历。（题${i}）`
          : type === "technical"
            ? `请结合项目说明你如何使用${skills[(i - 1) % 8]}完成任务。（题${i}）`
            : `你如何规划学习与团队协作？请举例说明。（题${i}）`,
      skillIds: [`skill-${((i - 1) % 8) + 1}`],
      keywords: type === "hr" ? ["学习", "协作"] : ["项目", "任务"],
      rubricKeys: [
        "relevance",
        "star",
        "evidence",
        "skill",
        "structure",
        "consistency",
      ],
    });
  }
  for (let i = 1; i <= 8; i++)
    p.mockSessions.push({
      ...base(`mock-${pad(i)}`),
      studentId: `student-${pad(i)}`,
      targetJobId: `job-${pad(i)}`,
      resumeVersionId: `resume-version-${pad(i)}-1`,
      state: "ready",
      questionIds: ["question-001", "question-002", "question-003"],
      questionIndex: 0,
      answers: [],
      followUpCount: 0,
      report: null,
      rubricVersion: "1.0",
    });
  for (let i = 1; i <= 12; i++)
    p.contents.push({
      ...base(`content-${pad(i)}`),
      kind: (["policy", "rule", "guidance"] as const)[i % 3]!,
      title: `教学示例 · ${["求职准备", "流程说明", "成长指南"][i % 3]} ${i}`,
      body: "本内容为课程教学示例，不是现行政策。请通过学校官方渠道核实具体就业规定。投递前确认授权，审核前检查证明，遇到困难及时联系辅导员。",
      tags: ["教学示例"],
      sourceUrl: null,
      verified: false,
      publishedAt: at(1),
    });
  for (const [key, value] of Object.entries({
    schemaVersion: "1.0",
    seedVersion: "1.0",
    algorithmVersion: "1.0",
    clock: FIXED_NOW,
    destinationDeadline: DESTINATION_DEADLINE,
    aiMode: "REPLAY",
    auditSequence: sequence,
  }))
    p.configs.push({ ...base(`config-${key}`), key, value, scope: "demo" });
  return p;
}

export function validateSeedPack(p: SeedPack): string[] {
  const errors: string[] = [];
  const check = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  const has = <K extends keyof SeedPack>(table: K, id: string | null) =>
    id !== null && p[table].some((x) => x.id === id);
  const dictionaryHas = (kind: DictionaryKind, id: string | null) =>
    p.dictionaries.some((d) => d.id === id && d.kind === kind && d.active);
  const counts = {
    students: 40,
    users: 53,
    companies: 8,
    jobs: 100,
    applications: 120,
    interviews: 40,
    resumes: 40,
    mockSessions: 8,
    agreements: 12,
    destinations: 25,
    contents: 12,
  } as const;
  for (const [key, expected] of Object.entries(counts))
    check(p[key as keyof typeof counts].length === expected, `COUNT:${key}`);
  check(p.mockQuestions.length >= 24, "COUNT:questions");
  for (const [key, rows] of Object.entries(p)) {
    check(
      new Set(rows.map((x) => x.id)).size === rows.length,
      `DUPLICATE:${key}`,
    );
    for (const row of rows)
      if ("createdAt" in row && row.createdAt !== undefined)
        check(row.createdAt <= FIXED_NOW, `FUTURE:${row.id}`);
  }
  for (const s of p.students) {
    check(
      has("users", s.userId) &&
        has("dictionaries", s.majorId) &&
        has("dictionaries", s.collegeId),
      `FK:student:${s.id}`,
    );
    check(
      p.users.some(
        (u) => u.id === s.counselorId && u.role === "counselor" && u.active,
      ),
      `FK:counselor:${s.id}`,
    );
  }
  for (const u of p.users)
    check(
      u.role === "student"
        ? p.students.some((s) => s.id === u.studentId && s.userId === u.id) &&
            u.companyId === null
        : u.role === "company"
          ? p.companies.some(
              (c) => c.id === u.companyId && c.ownerUserId === u.id,
            ) && u.studentId === null
          : u.studentId === null && u.companyId === null,
      `FK:user:${u.id}`,
    );
  for (const c of p.companies)
    check(
      has("users", c.ownerUserId) &&
        has("dictionaries", c.industryId) &&
        has("dictionaries", c.cityId),
      `FK:company:${c.id}`,
    );
  for (const j of p.jobs)
    check(
      has("companies", j.companyId) &&
        dictionaryHas("jobCategory", j.categoryId) &&
        dictionaryHas("industry", j.industryId) &&
        dictionaryHas("city", j.cityId) &&
        j.preferredMajorIds.every((id) => dictionaryHas("major", id)) &&
        j.requiredSkills.every((s) => has("skillOntology", s.skillId)),
      `FK:job:${j.id}`,
    );
  for (const r of p.resumes)
    check(
      has("students", r.studentId) &&
        r.versionIds.every((id) => has("resumeVersions", id)),
      `FK:resume:${r.id}`,
    );
  for (const a of p.applications)
    check(
      has("students", a.studentId) &&
        has("jobs", a.jobId) &&
        p.resumes.some(
          (r) =>
            r.studentId === a.studentId &&
            r.versionIds.includes(a.resumeVersionId),
        ),
      `FK:application:${a.id}`,
    );
  for (const i of p.interviews)
    check(
      has("applications", i.applicationId) &&
        (i.result === "pending" || i.status === "completed"),
      `FK:interview:${i.id}`,
    );
  for (const a of p.agreements)
    check(
      has("applications", a.applicationId) &&
        has("students", a.studentId) &&
        has("companies", a.companyId) &&
        (a.status !== "signed" ||
          (a.signedAt && a.studentConfirmedAt && a.companyConfirmedAt)),
      `FK:agreement:${a.id}`,
    );
  for (const d of p.destinations)
    check(
      has("students", d.studentId) &&
        d.attachmentIds.every((id) =>
          p.attachments.some((a) => a.id === id && a.studentId === d.studentId),
        ) &&
        (d.source !== "internal" ||
          p.agreements.some(
            (a) =>
              a.id === d.agreementId &&
              a.status === "signed" &&
              a.studentId === d.studentId &&
              a.applicationId === d.applicationId &&
              p.applications.some(
                (app) =>
                  app.id === d.applicationId &&
                  app.studentId === d.studentId &&
                  p.jobs.some(
                    (j) => j.id === app.jobId && j.companyId === a.companyId,
                  ),
              ),
          )),
      `FK:destination:${d.id}`,
    );
  check(
    new Set(p.applications.map((a) => `${a.studentId}:${a.jobId}`)).size ===
      120,
    "UNIQUE:application",
  );
  check(
    new Set(p.destinations.map((d) => d.studentId)).size === 25,
    "UNIQUE:destination",
  );
  check(
    new Set(
      p.agreements.filter((a) => a.status === "signed").map((a) => a.studentId),
    ).size === 12,
    "UNIQUE:signed",
  );
  check(
    p.destinations.filter((d) => d.status === "approved").length === 20 &&
      p.destinations.filter((d) => d.status === "submitted").length === 5,
    "ANCHOR:destination",
  );
  for (const [type, count] of Object.entries({
    employment: 12,
    furtherStudy: 5,
    entrepreneurship: 2,
    flexible: 1,
  }))
    check(
      p.destinations.filter((d) => d.status === "approved" && d.type === type)
        .length === count,
      `ANCHOR:${type}`,
    );
  check(
    p.interviews.filter((i) => i.result === "pass").length === 20 &&
      p.interviews.filter((i) => i.result === "fail").length === 10 &&
      p.interviews.filter((i) => i.result === "pending").length === 10,
    "ANCHOR:interviews",
  );
  for (const kind of [
    "college",
    "major",
    "industry",
    "city",
    "jobCategory",
    "degree",
  ])
    check(
      p.dictionaries.some((d) => d.kind === kind),
      `DICTIONARY:${kind}`,
    );
  for (const a of p.attachments)
    check(
      has("students", a.studentId) &&
        a.blob instanceof Blob &&
        a.blob.size === a.size &&
        a.size <= 2 * 1024 * 1024,
      `BLOB:${a.id}`,
    );
  for (const e of p.applicationEvents)
    check(
      has("applications", e.applicationId) && e.at <= FIXED_NOW,
      `EVENT:${e.id}`,
    );
  check(
    new Set(p.auditLogs.map((a) => a.sequence)).size === p.auditLogs.length,
    "AUDIT:sequence",
  );
  const unique = <T>(rows: T[], key: (row: T) => string, name: string) =>
    check(new Set(rows.map(key)).size === rows.length, `UNIQUE:${name}`);
  unique(p.users, (u) => u.login, "login");
  unique(p.students, (s) => s.userId, "studentUser");
  unique(p.students, (s) => s.studentNo, "studentNo");
  unique(p.companies, (c) => c.ownerUserId, "companyOwner");
  unique(p.resumes, (r) => r.studentId, "resumeStudent");
  unique(p.resumeVersions, (v) => `${v.resumeId}:${v.number}`, "resumeVersion");
  unique(p.dictionaries, (d) => `${d.kind}:${d.code}`, "dictionary");
  unique(p.configs, (c) => c.key, "config");
  for (const rows of Object.values(p))
    for (const row of rows)
      if ("updatedAt" in row)
        check(
          row.updatedAt <= FIXED_NOW &&
            row.updatedAt >= row.createdAt &&
            Number.isInteger(row.revision) &&
            row.revision >= 1,
          `BASE:${row.id}`,
        );
  for (const version of p.resumeVersions)
    check(
      p.resumes.some(
        (r) => r.id === version.resumeId && r.versionIds.includes(version.id),
      ),
      `FK:version:${version.id}`,
    );
  for (const question of p.mockQuestions)
    check(
      has("dictionaries", question.categoryId) &&
        question.keywords.length > 0 &&
        question.skillIds.every((id) => has("skillOntology", id)),
      `FK:question:${question.id}`,
    );
  for (const session of p.mockSessions)
    check(
      has("students", session.studentId) &&
        has("jobs", session.targetJobId) &&
        has("resumeVersions", session.resumeVersionId) &&
        session.questionIds.every((id) => has("mockQuestions", id)),
      `FK:mock:${session.id}`,
    );
  for (const kind of ["behavior", "technical", "hr"])
    check(
      p.mockQuestions.filter((q) => q.type === kind).length >= 3,
      `QUESTIONS:${kind}`,
    );
  try {
    prepareOntology(p.skillOntology);
  } catch {
    errors.push("ONTOLOGY:invalid");
  }
  for (const application of p.applications) {
    const events = p.applicationEvents.filter(
      (e) => e.applicationId === application.id,
    );
    let current = "none";
    let previousAt = application.createdAt;
    for (const event of events) {
      check(event.from === current, `REPLAY:event:${event.id}`);
      check(event.at >= previousAt, `ORDER:event:${event.id}`);
      previousAt = event.at;
      const job = p.jobs.find((j) => j.id === application.jobId),
        student = p.students.find((s) => s.id === application.studentId),
        company = p.companies.find((c) => c.id === job?.companyId);
      const studentEvent = ["APPLY", "WITHDRAW", "DECLINE_OFFER"].includes(
        event.event,
      );
      check(
        event.actorUserId ===
          (studentEvent ? student?.userId : company?.ownerUserId) ||
          (event.event === "CONFIRM_AGREEMENT" &&
            event.actorUserId === student?.userId),
        `ACTOR:event:${event.id}`,
      );
      const transitions: Record<string, [string[], string[]]> = {
        APPLY: [["none"], ["applied"]],
        START_SCREEN: [["applied"], ["screening"]],
        SCHEDULE_INTERVIEW: [["applied", "screening"], ["interview"]],
        RESCHEDULE: [["interview"], ["interview"]],
        COMPLETE_INTERVIEW: [["interview"], ["interview", "rejected"]],
        CANCEL_INTERVIEW: [["interview"], ["screening"]],
        ISSUE_OFFER: [["interview"], ["offered"]],
        REJECT: [["applied", "screening", "interview"], ["rejected"]],
        WITHDRAW: [
          ["applied", "screening", "interview", "offered"],
          ["withdrawn"],
        ],
        DECLINE_OFFER: [["offered"], ["closed"]],
        CREATE_AGREEMENT: [["offered"], ["offered"]],
        CONFIRM_AGREEMENT: [["offered"], ["offered", "closed"]],
        TERMINATE_AGREEMENT: [["closed"], ["closed"]],
      };
      const allowed = transitions[event.event];
      check(
        allowed &&
          allowed[0].includes(event.from) &&
          allowed[1].includes(event.to),
        `LEGAL:event:${event.id}`,
      );
      current = event.to;
    }
    check(
      current === application.status && events[0]?.event === "APPLY",
      `REPLAY:application:${application.id}`,
    );
    const resume = p.resumes.find((r) =>
        r.versionIds.includes(application.resumeVersionId),
      ),
      job = p.jobs.find((j) => j.id === application.jobId);
    if (resume && job)
      try {
        const score = match(
          resume,
          job,
          undefined,
          p.skillOntology,
          p.dictionaries,
          FIXED_NOW,
        );
        check(
          Math.abs(score.rawTotal - application.matchSnapshot.rawTotal) <
            1e-8 && score.total === application.matchSnapshot.total,
          `MATCH:${application.id}`,
        );
      } catch {
        errors.push(`MATCH:invalid:${application.id}`);
      }
  }
  const replay = replayProjections(p.auditLogs, FIXED_NOW);
  for (const [type, key] of [
    ["Student", "students"],
    ["Application", "applications"],
    ["Interview", "interviews"],
    ["Agreement", "agreements"],
    ["Destination", "destinations"],
  ] as const) {
    const rows = replay.get(type) ?? [];
    check(rows.length === p[key].length, `AUDIT:count:${type}`);
    for (const entity of p[key]) {
      const projection = rows.find((r) => r.id === entity.id)?.projection;
      check(projection, `AUDIT:missing:${entity.id}`);
      if (projection)
        for (const [field, value] of Object.entries(projection))
          if (field in entity)
            check(
              (entity as unknown as Record<string, unknown>)[field] === value,
              `AUDIT:mismatch:${entity.id}:${field}`,
            );
    }
  }
  for (const log of p.auditLogs)
    check(log.at <= FIXED_NOW, `FUTURE:audit:${log.id}`);
  check(
    new Set(
      p.applicationEvents
        .filter((e) => e.event === "SCHEDULE_INTERVIEW")
        .map((e) => e.applicationId),
    ).size === 40,
    "ANCHOR:everInterview",
  );
  check(
    new Set(
      p.applicationEvents
        .filter((e) => e.event === "ISSUE_OFFER")
        .map((e) => e.applicationId),
    ).size === 20,
    "ANCHOR:everOffer",
  );
  return errors;
}
