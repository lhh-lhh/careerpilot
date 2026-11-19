import type { ExternalOpportunity } from "../src/types/opportunities";
export const NCSS_LIST_URL =
  "https://www.ncss.cn/student/jobs/jobslist/ajax/?offset=1&limit=20";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("SCHEMA_INVALID");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return text(value.join("、"), max);
  if (typeof value !== "string" && typeof value !== "number")
    throw Error("SCHEMA_INVALID");
  const result = String(value).trim();
  if (
    result.length > max ||
    /[<>]/u.test(result) ||
    [...result].some(
      (c) => c.charCodeAt(0) < 32 && !["\t", "\n", "\r"].includes(c),
    )
  )
    throw Error("SCHEMA_INVALID");
  return result || null;
}
function instant(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const time =
    typeof value === "number" || /^\d{13}$/.test(String(value))
      ? Number(value)
      : Date.parse(String(value));
  if (
    !Number.isFinite(time) ||
    time < Date.UTC(2000, 0, 1) ||
    time > Date.UTC(2100, 0, 1)
  )
    throw Error("SCHEMA_INVALID");
  return new Date(time).toISOString();
}
export function parseNcssList(
  input: unknown,
  observedAt: string,
): ExternalOpportunity[] {
  if (!Number.isFinite(Date.parse(observedAt))) throw Error("SCHEMA_INVALID");
  const envelope = object(input),
    data = object(envelope.data);
  if (envelope.flag === false || !Array.isArray(data.list))
    throw Error("SCHEMA_INVALID");
  if (data.list.length > 30) throw Error("PAYLOAD_TOO_LARGE");
  const rows = new Map<string, ExternalOpportunity>();
  for (const item of data.list) {
    const row = object(item),
      sourceId = text(row.jobId),
      title = text(row.jobName),
      employer = text(row.recName);
    if (
      !sourceId ||
      !/^[A-Za-z0-9]{1,80}$/.test(sourceId) ||
      !title ||
      !employer
    )
      throw Error("SCHEMA_INVALID");
    const id = `ncss:${sourceId}`;
    rows.set(id, {
      id,
      title,
      employer,
      location: text(row.areaCodeName),
      degree: text(row.degreeName),
      majors: text(row.major, 1500),
      recruitmentType:
        typeof row.recruitType === "string" &&
        /[\u4e00-\u9fff]/u.test(row.recruitType)
          ? text(row.recruitType)
          : null,
      // List numeric pay units have not been independently confirmed. Never manufacture a formatted range.
      salaryText:
        [0, "0"].includes(row.lowMonthPay as string | number) &&
        [0, "0"].includes(row.highMonthPay as string | number)
          ? "面议"
          : "原站查看",
      headCount:
        row.headCount === 0 || row.headCount === "0"
          ? null
          : text(row.headCount),
      industry: text(row.industryName),
      companyNature: text(row.recProperty),
      companySize: text(row.recScale),
      sourceName: "国家大学生就业服务平台",
      underlyingSource: text(row.sourcesNameCh),
      url: `https://www.ncss.cn/student/jobs/${sourceId}/detail.html`,
      publishedAt: instant(row.publishDate),
      sourceUpdatedAt: instant(row.updateDate),
      observedAt,
      deadline: null,
      qualificationNote: null,
    });
  }
  return [...rows.values()];
}
export async function fetchNcssList(
  observedAt: string,
  transport: typeof fetch = fetch,
): Promise<ExternalOpportunity[]> {
  const response = await transport(NCSS_LIST_URL, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || response.redirected) throw Error("UPSTREAM_ERROR");
  if (Number(response.headers.get("content-length")) > 1048576) {
    await response.body?.cancel();
    throw Error("PAYLOAD_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("UPSTREAM_ERROR");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1048576) throw Error("PAYLOAD_TOO_LARGE");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("SCHEMA_INVALID");
  }
  return parseNcssList(data, observedAt);
}
