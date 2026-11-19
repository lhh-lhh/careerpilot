import { onUnmounted, ref, shallowRef, watch } from "vue";
import type { AiModule, AiPayload, AiRequest, AiResponse } from "../adapters/ai/types";
import { AiFailure } from "../adapters/ai/types";
import { requestFromInput, type LocalAiMapping } from "../services/ai-requests";
import { appAiRuntime, appRepository, onDomainChange } from "../services/app-services";
import { useSessionStore } from "../stores/session";
import { useAiConnectionStore } from "../stores/aiConnection";
import { api } from '../adapters/repository/http';
import { isOnline } from '../services/runtime';
import type { A3Variables, A7Variables } from '../adapters/ai/types';
import { aiConsent } from '../services/ai-consent';

/** Confirmation binds to one immutable, masked revision, never the editable form. */
export function useBusinessAi() {
  const session = useSessionStore(), connection = useAiConnectionStore();
  const busy = ref(false), error = ref(""), text = ref(""), preview = ref(""), consentOpen = ref(false);
  const response = shallowRef<AiResponse | null>(null);
  let controller: AbortController | null = null, pending: AiRequest | null = null;
  let revision = "", operation = 0;
  let onlineTicket: string | null = null;
  function stop() { operation++; controller?.abort(); pending = null; onlineTicket = null; busy.value = false; consentOpen.value = false; connection.clearConsent(); }
  watch(aiConsent,value=>{if(!value)stop();},{flush:'sync'});
  const unsubscribe = onDomainChange(() => { revision = "invalidated"; stop(); });
  onUnmounted(() => { stop(); unsubscribe(); });
  async function execute(request: AiRequest) {
    const actor = session.actor;
    if (!actor) return;
    const id = ++operation;
    busy.value = true; response.value = null; text.value = ""; error.value = "";
    const ticket = onlineTicket; onlineTicket = null;
    const mode = "LIVE";
    try {
      const result = await appAiRuntime.run(request, mode, {
        records: [],
        current: () => ({ actorUserId: session.actor?.userId ?? "", epoch: appRepository.epoch, domainRevision: revision }),
        audit: run => appRepository.appendAiRun(actor, run, request.epoch),
        live: async input => {
          if (!isOnline||!ticket) throw new AiFailure('PROVIDER_DISABLED');
          return api<AiResponse>('/api/ai/confirm', { ticket, consent: true }, input.signal);
        },
      }, delta => { if (id === operation) text.value += delta; });
      if (id === operation) response.value = result;
    } catch (failure) {
      if (id === operation) error.value = failure instanceof AiFailure && failure.code === "CANCELLED" ? "已停止，未采纳任何内容。" : "本次建议未完成，请保留原文后重试。";
    } finally { if (id === operation) busy.value = false; connection.clearConsent(); }
  }
  async function generate(module: AiModule, action: AiPayload["operation"], input: { variables: unknown; snapshot: unknown; local?: LocalAiMapping }) {
    if(!isOnline){stop();response.value=null;text.value='';error.value='AI生成仅支持在线DeepSeek服务，离线演示不会使用预设内容代答。';return;}
    if(!aiConsent.value){error.value='AI已关闭，请在顶部开启默认授权后使用。';return;}
    stop(); controller = new AbortController();
    response.value=null;text.value='';error.value='';
    const id = operation;
    let request = await requestFromInput(module, action, input, appRepository.epoch, controller.signal);
    if (id !== operation || controller.signal.aborted) return;
    if (isOnline) {
      busy.value = true; error.value = '';
      try {
        const status = await api<{ enabled: boolean }>('/api/ai/status', undefined, controller.signal);
        if (id !== operation || controller.signal.aborted) return;
        if (status.enabled) {
          const local = input.local;
          const resource = module === 'A1' ? { jobId: local?.jobId ?? null, strategy: (input.variables as { strategy: string }).strategy, keepMyTone: (input.variables as { keepMyTone: boolean }).keepMyTone }
            : module === 'A2' ? { sessionId: local?.sessionId, questionId: local?.questionId }
              : module === 'A3' ? { jobId: local?.jobId, weights: (input.variables as A3Variables).match.dimensions.map(d => d.weight), hypotheticalSkillIds: (input.variables as A3Variables).hypotheticalSkillIds }
                : { queryText: (input.variables as A7Variables).queryText, ...(action === 'advice' ? { studentId: Object.values(local?.studentIds ?? {})[0] } : {}) };
          const prepared = await api<{ ticket: string; request: AiRequest }>('/api/ai/prepare', { module, operation: action, resource }, controller.signal);
          if (id !== operation || controller.signal.aborted) return;
          request = { ...prepared.request, epoch: appRepository.epoch, signal: controller.signal };
          onlineTicket = prepared.ticket;
          revision = request.domainRevision; pending = request;
          preview.value = JSON.stringify(request.variables, null, 2);
          await confirm();
          return;
        }
        response.value=null;text.value='';error.value='DeepSeek服务不可用，未生成任何替代内容。请检查密钥、额度或在线服务。';
        return;
      } catch {
        if (id === operation) error.value = '在线建议暂不可用，当前内容未改动，请稍后重试。';
        return;
      } finally { if (id === operation) busy.value = false; }
    }
  }
  async function confirm() {
    if (!pending) return;
    const request = pending; pending = null; consentOpen.value = false;
    if (!isOnline||!aiConsent.value) return;
    await execute(request);
  }
  return { busy, error, text, preview, consentOpen, response, stop, generate, confirm };
}
