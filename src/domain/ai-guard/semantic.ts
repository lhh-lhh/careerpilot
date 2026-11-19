import type {
  AiPayload,
  AiEvidence,
  A1Variables,
  A2Variables,
  A3Variables,
  A7Variables,
} from "../../adapters/ai/types";
import { requireCondition } from "../errors";
import { validatePayload } from "./schema";
import { canonicalJson } from "./fingerprint";
import { assertMasked } from "./privacy";
const safePath = /^(?:experience|projects)\.[A-Za-z0-9_-]+\.description$/;
const tokens = (text: string) => text.match(/\{\{[^{}]*\}\}/g) ?? [];
const plain = (text: string) => {
  requireCondition(
    !/<\/?[a-z][^>]*>|(?:https?:|javascript:|data:)/i.test(text),
    "SEMANTIC_INVALID",
  );
  try {
    assertMasked(text);
  } catch {
    requireCondition(false, "SEMANTIC_INVALID");
  }
};
function boundary(text: string, offset: number) {
  const left = text.charCodeAt(offset - 1),
    right = text.charCodeAt(offset);
  return !(
    left >= 0xd800 &&
    left <= 0xdbff &&
    right >= 0xdc00 &&
    right <= 0xdfff
  );
}
function evidenceValid(
  evidence: AiEvidence,
  sources: { fieldPath: string; text: string }[],
) {
  const source = sources.find((s) => s.fieldPath === evidence.fieldPath)?.text;
  requireCondition(
    source !== undefined &&
      evidence.start < evidence.end &&
      evidence.end <= source.length &&
      boundary(source, evidence.start) &&
      boundary(source, evidence.end) &&
      source.slice(evidence.start, evidence.end) === evidence.quote,
    "SEMANTIC_INVALID",
  );
}
function factualChange(before: string, after: string) {
  const numbers = new Set(before.match(/\d+(?:\.\d+)?/g) ?? []);
  const knownWords = new Set(before.match(/[A-Za-z][A-Za-z0-9.+#-]*/g) ?? []);
  const characters = new Set(
    before +
      "在该任务中我负责通过并与以及最终从而实现完成参与使用进行针对把将为的了和；：，。！？、（）()[]【】 \n",
  );
  return (
    (after.match(/\d+(?:\.\d+)?/g) ?? []).some((n) => !numbers.has(n)) ||
    (after.match(/[A-Za-z][A-Za-z0-9.+#-]*/g) ?? []).some(
      (word) => !knownWords.has(word),
    ) ||
    [...after].some(
      (char) => /\p{Script=Han}/u.test(char) && !characters.has(char),
    ) ||
    ["主导", "独立", "领导", "精通", "显著", "成功"].some(
      (term) => after.includes(term) && !before.includes(term),
    )
  );
}
function numericText(text: string, allowed: Set<string>) {
  const used = tokens(text);
  requireCondition(
    used.every((token) => allowed.has(token)),
    "SEMANTIC_INVALID",
  );
  const remainder = text.replace(/\{\{[^{}]*\}\}/g, "");
  requireCondition(
    !/[\d０-９]|百分之|[零一二三四五六七八九十百千万亿两]+(?:分|个|人|次|成|位|倍|％|%)/u.test(
      remainder,
    ) && !/[{}]/.test(remainder),
    "SEMANTIC_INVALID",
  );
}
export function guardPayload(
  module: string,
  operation: string,
  variables: unknown,
  payload: unknown,
): AiPayload {
  requireCondition(
    validatePayload(module, operation, payload),
    "SCHEMA_INVALID",
  );
  canonicalJson(variables);
  const data = structuredClone(payload) as AiPayload;
  if (data.module === "A1") {
    const input = variables as A1Variables;
    plain(data.summary);
    requireCondition(
      new Set(data.suggestions.map((s) => s.id)).size ===
        data.suggestions.length,
      "SEMANTIC_INVALID",
    );
    for (const suggestion of data.suggestions) {
      requireCondition(
        safePath.test(suggestion.fieldPath) &&
          !/constructor|__proto__|prototype/.test(suggestion.fieldPath),
        "SEMANTIC_INVALID",
      );
      const original = input.fields.find(
        (field) => field.fieldPath === suggestion.fieldPath,
      );
      requireCondition(
        original?.text === suggestion.before &&
          input.resumeVersionId === suggestion.resumeVersionId,
        "SEMANTIC_INVALID",
      );
      suggestion.evidence.forEach((e) => {
        requireCondition(
          e.fieldPath === suggestion.fieldPath,
          "SEMANTIC_INVALID",
        );
        evidenceValid(e, input.fields);
      });
      plain(suggestion.after);
      plain(suggestion.reason);
      if (
        factualChange(suggestion.before, suggestion.after) ||
        (suggestion.after.match(/\d+(?:\.\d+)?/g) ?? []).some(
          (n) => !suggestion.evidence.some((e) => e.quote.includes(n)),
        )
      ) {
        suggestion.after = "【待核实：请依据真实经历补充表达】";
        suggestion.requiresUserInput = true;
      }
      if (/【|\[[^\]]*(?:待|请|填写)/.test(suggestion.after))
        suggestion.requiresUserInput = true;
    }
  } else if (data.module === "A2") {
    const input = variables as A2Variables;
    requireCondition(
      data.sessionId === input.sessionId &&
        data.questionId === input.question.questionId,
      "SEMANTIC_INVALID",
    );
    requireCondition(
      operation !== "followUp" ||
        (input.followUpCount < 2 &&
          input.answers.some((a) => a.kind !== "skip" && a.text.trim())),
      "SEMANTIC_INVALID",
    );
    requireCondition(
      operation !== "question" || input.answers.length === 0,
      "SEMANTIC_INVALID",
    );
    const sources = input.answers.map((a) => ({
      fieldPath: `answers.${a.id}.text`,
      text: a.text,
    }));
    data.evidence.forEach((e) => evidenceValid(e, sources));
    const supported =
      operation === "question"
        ? input.question.text
        : input.answers.map((a) => a.text).join("\n");
    requireCondition(
      (data.text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) =>
        supported.includes(n),
      ),
      "SEMANTIC_INVALID",
    );
    plain(data.text);
  } else if (data.module === "A3") {
    const input = variables as A3Variables;
    requireCondition(
      data.jobId === input.job.jobId &&
        input.match.jobId === data.jobId &&
        data.dimensionKeys.every((key) =>
          input.match.dimensions.some((d) => d.key === key),
        ),
      "SEMANTIC_INVALID",
    );
    const skills = new Set(
      input.match.dimensions.flatMap((d) => [...d.hits, ...d.misses]),
    );
    requireCondition(
      data.skillIds.every((id) => skills.has(id)),
      "SEMANTIC_INVALID",
    );
    numericText(
      data.text,
      new Set([
        "{{match:total}}",
        ...data.dimensionKeys.map((key) => `{{dimension:${key}}}`),
      ]),
    );
    plain(data.text);
  } else {
    const input = variables as A7Variables;
    requireCondition(
      data.intent === input.intent &&
        data.studentIds.every((id) =>
          input.targetStudents.some((s) => s.studentId === id),
        ),
      "SEMANTIC_INVALID",
    );
    requireCondition(
      operation !== "query" ||
        (input.targetStudents.length === 0 && data.studentIds.length === 0),
      "SEMANTIC_INVALID",
    );
    requireCondition(
      operation !== "advice" ||
        (input.targetStudents.length === 1 && data.studentIds.length === 1),
      "SEMANTIC_INVALID",
    );
    const triggered = new Set(input.targetStudents.flatMap((s) => s.ruleIds));
    requireCondition(
      data.ruleIds.every((id) => triggered.has(id)) &&
        data.metricRefs.every((id) =>
          input.metricContext.some((row) => row.metricId === id),
        ),
      "SEMANTIC_INVALID",
    );
    const allowed = new Set([
      ...input.metricContext
        .filter((row) => data.metricRefs.includes(row.metricId))
        .map((row) => row.token),
      ...data.ruleIds.map((id) => `{{rule:${id}}}`),
    ]);
    numericText(data.text, allowed);
    plain(data.text);
  }
  return data;
}
