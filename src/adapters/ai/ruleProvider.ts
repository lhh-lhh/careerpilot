import type {
  AiRequest,
  AiPayload,
  A1Variables,
  A2Variables,
  A3Variables,
  A7Variables,
  Suggestion,
} from "./types";
import { guardPayload } from "../../domain/ai-guard/semantic";
import { assertRequest } from "./registry";
import { textSignals } from "../../domain/resume/diagnose";
export function rulePayload(request: AiRequest): AiPayload {
  assertRequest(request);
  let payload: AiPayload;
  if (request.module === "A1") {
    const input = request.variables as A1Variables;
    const suggestions: Suggestion[] = input.fields
      .filter((f) => f.text.trim())
      .flatMap((field, index) => {
        const before = field.text;
        const after =
          input.strategy === "evidencePrompt"
            ? before + "【待补充：请填写可核实的结果】"
            : input.keepMyTone
              ? before
              : input.strategy === "concise"
                ? before.split(/[。！？]/u).filter(Boolean)[0]! + "。"
                : before.replace(/，/g, "；");
        if (after === before) return [];
        return [
          {
            id: `suggestion-${index + 1}`,
            resumeVersionId: input.resumeVersionId,
            fieldPath: field.fieldPath,
            before,
            after,
            reason:
              input.strategy === "evidencePrompt"
                ? "请补充真实依据，未补充前不可采纳。"
                : "仅整理原文表达，未增加事实。",
            evidence: [
              {
                fieldPath: field.fieldPath,
                quote: before,
                start: 0,
                end: before.length,
              },
            ],
            requiresUserInput: input.strategy === "evidencePrompt",
            disposition: "pending" as const,
          },
        ];
      });
    payload = {
      module: "A1",
      operation: "rewrite",
      summary: input.fields.some((f) => f.text.trim())
        ? input.keepMyTone
          ? "保留你的原有语气；没有必须改写的内容，可结合体检提示自行完善。"
          : "依据已记录的经历整理表达；内容仍需本人核实，可逐条驳回。"
        : "暂无可改写的描述。请先写下真实参与的任务、行动与结果。",
      suggestions,
    };
  } else if (request.module === "A2") {
    const input = request.variables as A2Variables,
      joined = input.answers.map((a) => a.text).join("\n"),
      signals = textSignals(joined);
    const follow = !signals.star.S.length
      ? "请补充当时的项目背景或具体场景。"
      : !signals.star.T.length
        ? "在这个场景中，你本人承担了什么任务？"
        : !signals.star.A.length
          ? "你具体采取了哪些行动，为什么这样选择？"
          : "最终产生了怎样的结果？请只补充可以核实的事实。";
    payload = {
      module: "A2",
      operation: request.operation as "question" | "followUp" | "feedback",
      sessionId: input.sessionId,
      questionId: input.question.questionId,
      text:
        request.operation === "question"
          ? input.question.text
          : request.operation === "followUp"
            ? follow
            : joined.trim()
              ? "已记录你的回答。请结合本地评分依据，核对任务、行动和结果是否清楚；没有证据的成果不必补写。"
              : "本题已跳过，未生成虚构评价。可在下次练习中先说明背景与本人任务。",
      evidence:
        request.operation === "feedback"
          ? input.answers
              .filter((a) => a.text.trim())
              .slice(0, 1)
              .map((a) => ({
                fieldPath: `answers.${a.id}.text`,
                quote: a.text,
                start: 0,
                end: a.text.length,
              }))
          : [],
    };
  } else if (request.module === "A3") {
    const input = request.variables as A3Variables;
    payload = {
      module: "A3",
      operation: "explain",
      jobId: input.job.jobId,
      text: `当前匹配为{{match:total}}。技能贡献{{dimension:skill}}，城市贡献{{dimension:city}}。${input.hypotheticalSkillIds.length ? "此结果含假设技能，不代表已经掌握；真实投递仍使用已保存简历。" : "建议展开各维度核对命中与缺口，再决定是否投递。"}`,
      dimensionKeys: ["skill", "city"],
      skillIds: input.match.dimensions.find((d) => d.key === "skill")!.misses,
    };
  } else {
    const input = request.variables as A7Variables;
    const rows = input.metricContext.filter(
      (row) => row.metricId === input.intent,
    );
    const target = input.targetStudents[0];
    payload = {
      module: "A7",
      operation: request.operation as "query" | "advice",
      intent: input.intent,
      text:
        input.intent === "clarify"
          ? "请明确要了解落实率、专业对比、招聘漏斗、风险预警、平均投递或面试通过情况中的哪项。"
          : request.operation === "advice"
            ? `建议先与学生核实当前进展，并共同确定具体行动和复查时间。${target?.ruleIds.map((rule) => `依据{{rule:${rule}}}。`).join("") ?? ""}帮扶记录不会自动清除风险条件。`
            : rows.length
              ? rows.map((row) => `${row.label}：${row.token}。`).join("") +
                "以上口径仅限当前可见范围与固定统计时点。"
              : "当前范围暂无该指标，请调整筛选后再查询。",
      metricRefs: rows.length
        ? [input.intent as Exclude<typeof input.intent, "clarify">]
        : [],
      studentIds: target ? [target.studentId] : [],
      ruleIds: target?.ruleIds ?? [],
    };
  }
  return guardPayload(
    request.module,
    request.operation,
    request.variables,
    payload,
  );
}
