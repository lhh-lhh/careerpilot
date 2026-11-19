import { createHash } from "node:crypto";
import type { createSqlDatabase } from "./database";
import type { createOpportunities } from "./opportunities";
import type { Opportunity, OpportunityPage } from "../src/types/opportunities";
export function createPublicOpportunities(
  database: ReturnType<typeof createSqlDatabase>,
  external: ReturnType<typeof createOpportunities>,
  clock = { now: () => new Date().toISOString() },
) {
  const { db } = database;
  async function localRows(): Promise<Opportunity[]> {
    const [jobs, companies, dictionaries] = await Promise.all([
      db.jobs.toArray(),
      db.companies.toArray(),
      db.dictionaries.toArray(),
    ]);
    const label = (id: string | null) =>
      dictionaries.find((d) => d.id === id)?.label ?? null;
    const degrees: Record<string, string> = {
      associate: "专科",
      bachelor: "本科",
      master: "硕士",
      doctorate: "博士",
    };
    return jobs
      .filter(
        (j) =>
          j.status === "published" &&
          (j.reviewStatus === undefined || j.reviewStatus === "approved") &&
          j.deadline > clock.now() &&
          companies.some((c) => c.id === j.companyId && c.verified),
      )
      .map((j) => ({
        id: `local:${j.id}`,
        localJobId: j.id,
        kind: "local",
        title: j.title,
        employer: companies.find((c) => c.id === j.companyId)!.name,
        location: label(j.cityId),
        degree: j.minDegree ? (degrees[j.minDegree] ?? j.minDegree) : "不限",
        majors:
          j.preferredMajorIds.map(label).filter(Boolean).join("、") || null,
        recruitmentType: null,
        salaryText: j.salaryRange
          ? `${j.salaryRange.min / 1000}–${j.salaryRange.max / 1000}K / 月`
          : "面议",
        headCount: null,
        industry: label(j.industryId),
        companyNature: null,
        companySize: null,
        sourceName: "路鸣职引",
        underlyingSource: null,
        url: "",
        publishedAt: j.createdAt,
        sourceUpdatedAt: j.updatedAt,
        observedAt: j.updatedAt,
        deadline: j.deadline,
        qualificationNote: null,
        description: j.jdText,
        freshness: "recent",
        availability: "available",
      }));
  }
  async function list(params: URLSearchParams): Promise<OpportunityPage> {
    const allowed = [
      "q",
      "location",
      "degree",
      "type",
      "source",
      "page",
      "pageSize",
    ];
    if (
      [...params.keys()].some(
        (k) => !allowed.includes(k) || params.getAll(k).length > 1,
      ) ||
      [...params.values()].some((v) => v.length > 200)
    )
      throw Error("VALIDATION_ERROR");
    const page = Number(params.get("page") ?? 1),
      pageSize = Number(params.get("pageSize") ?? 10),
      source = params.get("source") ?? "";
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 30 ||
      !["", "local", "external"].includes(source)
    )
      throw Error("VALIDATION_ERROR");
    const all = [...(await localRows()), ...(await external.publicExternal())],
      q = params.get("q")?.trim().toLocaleLowerCase() ?? "";
    const filtered = all
      .filter(
        (r) =>
          (!source || r.kind === source) &&
          (!q ||
            `${r.title} ${r.employer} ${r.majors ?? ""}`
              .toLocaleLowerCase()
              .includes(q)) &&
          (!params.get("location") || r.location === params.get("location")) &&
          (!params.get("degree") || r.degree === params.get("degree")) &&
          (!params.get("type") || r.recruitmentType === params.get("type")),
      )
      .sort(
        (a, b) =>
          (b.sourceUpdatedAt ?? b.publishedAt ?? b.observedAt).localeCompare(
            a.sourceUpdatedAt ?? a.publishedAt ?? a.observedAt,
          ) || a.id.localeCompare(b.id),
      );
    const values = (key: "location" | "degree" | "recruitmentType") =>
      [
        ...new Set(all.map((r) => r[key]).filter((v): v is string => !!v)),
      ].sort();
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
      facets: {
        locations: values("location"),
        degrees: values("degree"),
        types: values("recruitmentType"),
      },
      version: createHash("sha256")
        .update(JSON.stringify(all))
        .digest("hex")
        .slice(0, 16),
    };
  }
  async function detail(id: string) {
    if (id.startsWith("ncss:")) return external.detail(id);
    const row = (await localRows()).find((r) => r.id === id);
    if (!row) throw Error("NOT_FOUND");
    return row;
  }
  return { list, detail };
}
