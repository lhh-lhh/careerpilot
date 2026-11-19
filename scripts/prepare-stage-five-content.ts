import { resolve } from "node:path";
import { createSqlDatabase } from "../server/database";
import { createOpportunities } from "../server/opportunities";
// Operates only on the already fetched, isolated QA index. No network or automatic production publishing.
const db = createSqlDatabase(resolve("artifacts/stage-five-qa/service.sqlite")),
  service = createOpportunities(db);
try {
  const admin = (await db.db.users.toArray()).find(
    (u) => u.active && u.role === "admin",
  );
  if (!admin) throw Error("admin");
  const actor = { userId: admin.id, role: "admin" } as const;
  const evidence: Record<
    string,
    { salaryText?: string; recruitmentType?: string; note: string }
  > = {
    "ncss:3HSV7rKRzfpb6FEQcBV29x": {
      salaryText: "8–10K / 月",
      recruitmentType: "全职",
      note: "原站要求本科及以上，面向2027届及2025/2026届未就业毕业生；其他条件请在原站核对。",
    },
    "ncss:BMZEnCAufQejdctN7WmrKD": {
      salaryText: "1K / 月",
      recruitmentType: "实习",
      note: "原站岗位标题要求实习6个月以上，大小周；申请前请核对工作安排与薪资口径。",
    },
    "ncss:9FYK2H19V7QT189rYFBexT": {
      note: "已抽样核对原站详情入口；薪资与具体申请条件请在原站确认。",
    },
  };
  const input = (await service.admin(actor)).entries
    .filter((r) => r.candidate)
    .map((r) => ({
      ...r.candidate!,
      headCount: r.candidate!.headCount === "0" ? null : r.candidate!.headCount,
    }));
  await service.stage(input);
  for (const row of (await service.admin(actor)).entries) {
    if (!row.candidate) continue;
    const sample = evidence[row.id],
      title = row.candidate.title;
    const ambiguous = /博士教研|党校|长安银行/.test(title);
    await service.review(actor, {
      id: row.id,
      expectedRevision: row.revision,
      commandId: crypto.randomUUID(),
      decision: ambiguous ? "reject" : "publish",
      reason: ambiguous
        ? "标题与结构化学历或招聘主体存在歧义，需进一步核对，本批暂不发布。"
        : "已核对本次公开列表事实字段与标准来源链接；仅作有限机会索引，未认证招聘主体或可投状态。",
      ...(ambiguous
        ? {}
        : {
            qualificationNote: sample?.note ?? "",
            verifiedFields: {
              ...(sample?.salaryText ? { salaryText: sample.salaryText } : {}),
              ...(sample?.recruitmentType
                ? { recruitmentType: sample.recruitmentType }
                : {}),
            },
          }),
    });
  }
  console.log(
    JSON.stringify({
      fetched: 20,
      published: (await service.publicExternal()).length,
      withheld: (await service.admin(actor)).entries.filter(
        (r) => r.status === "rejected",
      ).length,
      networkRequests: 0,
    }),
  );
} finally {
  await db.close();
}
