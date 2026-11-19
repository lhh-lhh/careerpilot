# Strict DeepSeek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All executable AI generation must use DeepSeek, fail closed, and expose truthful provenance.
**Architecture:** Preserve the two authenticated same-origin gateways; eliminate business fallbacks, add real model recommendation and OCR, and route online text interviews through the dynamic session API.
**Tech Stack:** Vue3, TypeScript, Node24, SQLite, Vitest, Playwright.
**Spec:** `../specs/2026-11-15-strict-deepseek-design.md` (approved).

## Global Constraints

- Preserve credentials, real student data, CSRF, ownership, revision, consent, cancellation and quotas. Synthetic fixtures only for verification.
- No initial Git commit/worktree/reset. Keep existing checkout and use database backup. No automatic paid retries.
- AI never falls back to replay/rules. Deterministic facts, statistics, validations and PDF rendering remain explicitly non-AI.
- Secret remains server-only DPAPI. No credential/body in logs or deliverables.

### Task 1: Strict business calls

Files: `src/adapters/ai/orchestrator.ts`, `src/composables/useBusinessAi.ts`, `src/components/layout/AppShell.vue`, `tests/unit/ai/providers.test.ts`, `tests/unit/ai/runtime.test.ts`, affected E2E.

- [x] Add behavior test with valid request and failing LIVE provider: `await expect(provider.complete(request,'LIVE')).rejects.toMatchObject({code:'UPSTREAM_ERROR'})`; assert audit failure and no success payload. Run `npx vitest run tests/unit/ai/providers.test.ts` and observe red.
- [x] Re-throw all LIVE failures rather than selecting replay/rule; preserve pure explicit replay tests. In `useBusinessAi.generate`, reject offline, unavailable status and missing ticket before execution; remove business records import, always pass LIVE with `records:[]`.
- [x] Change UI status to DeepSeek availability; show live errors without local alternate output. Update intentional legacy assertions to strict behavior; rerun providers/runtime/online-AI tests.

### Task 2: Provider provenance, model recommendations, OCR

Files: `server/workbench/provider.ts`, new `server/workbench/provenance.ts`, `server/workbench/matching.ts`, new `server/workbench/ocr.ts`, `server/workbench/index.ts`, `src/types/ai-workbench.ts`, `tests/unit/workbench-http.test.ts`, new `tests/unit/strict-workbench.test.ts`.

Interfaces: provenance `{traceId,provider:'deepseek',model,createdAt,upstreamRequestId?,usage?}`; MatchCandidate adds optional `aiRank`, `aiReasons`, `aiGaps`; MatchResults adds `provenance?`. OCR returns `{pages:[{index,text,finish_reason}],page_count,provenance}`.

- [x] Add isolated HTTP tests for no consent, disabled provider, model failure, unknown/duplicate candidate IDs, unchanged rule scores, no-result GET without generation. Observe failures via `npx vitest run tests/unit/strict-workbench.test.ts`.
- [x] Add provider attempt metadata with safe fixed error codes; never store request/answer text. Expose validated success provenance, not a client-supplied flag. Stream success only after complete. Keep shared quota and no automatic retries.
- [x] `GET /matches` returns saved snapshot or empty items; `POST` requires consent and uses model JSON recommendation for ≤30 real candidates. Validate IDs/lengths/rank; keep facts/rule scores untouched. Reject malformed response, no local AI substitute.
- [x] Add OCR HTTP tests: valid image→multipart file+purpose; bad magic/oversize/PDF>20 pages/unauthorized rejected pre-call; HTTP200error rejected; `length` retained. Observe red.
- [x] Implement in-memory file validation via existing sharp/pdfjs, 2MiB/20 pages. POST raw bytes `/documents/ocr`, consent header, bounded timeout190s. Official multipart only; inspect error and all page fields. Provenance only after valid result; no disk persistence.
- [x] Rerun strict HTTP and original workbench tests, updating only intentional API contract changes.

### Task 3: UI and dynamic text interview

Files: `src/router/index.ts`, `src/views/student/VoiceInterviewView.vue`, `src/views/student/MatchResultsView.vue`, new `src/views/student/DocumentOcrView.vue`, `src/views/student/ResumeView.vue`, `src/views/student/ResumeOptimizeView.vue`, new provenance component, affected E2E.

- [x] Add E2E: online `/student/mock` starts a model question with typed answer and does not request TTS/ASR; OCR upload shows pages, failure no invented text; model match result shows AI rank distinct from rule score. Run and observe red.
- [x] Share dynamic interview view with text-first mode at `/student/mock` and voice-first at `/student/mock/voice`; old reports read-only labeled old rule records. No online route starts static question bank.
- [x] Matching POST always consent:true; present aiRank/reasons with real provenance and separate rule data. No fresh-results implication for history.
- [x] Add OCR page with explicit whole-file privacy/cost and cancellation disclaimer, result textarea per page and copy; clear in-flight/results on leave or consent off. Never auto-save recognized facts.
- [x] Link OCR from resume pages, render provenance for successful generation, rerun typecheck and relevant E2E.

### Task 4: Integrated verification and release

- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit`, affected and full E2E; fix actual regressions with red/green evidence. Fresh results: 516unit,158dual-browser,0failure.
- [x] Use Browser skill first for desktop and390px UI, pet drag when closed, dynamic text, OCR and request errors. Synthetic-provider browser test is not real API evidence.
- [x] On temporary SQLite and synthetic content, use existing DPAPI loader to smoke real API paths (A1,A3,A7,chat,match,question,evaluation,OCR,TTS,ASR) with bounded attempts. Record only safe provenance/status, no secrets or real student content.
- [x] Verify real DB quick_check and material table counts/hash against backup; no applications created. Restart only own actual service with new build; never initialize accounts.
- [x] Produce evidence/runbook and fresh source package with pet licenses; final report actual tests and remaining device/browser limitations. Source package547files,114animations,securityScan passed; actual limitations documented.

## Review and progress

Plan/spec checked: Tasks2–3 share types/index; task2 defines responses, task3 consumes. Task1 preserves explicit test-only replay while forbidding business fallback. Task4 consumes all. Pet plan alone owns GlobalAssistant launcher and pet files; no simultaneous edits to those files.
Current status (2026-11-15): tasks1–4 implemented/verified and source package generated. Fresh typecheck/lint/build,516unit,158dual-browser passed. Existing database preserved before/after service restart. Real synthetic smoke and metadata evidence are in docs/evidence/strict-ai-pet-live.json. Independent pet review attempts did not execute and are not counted as passed; physical-device and production limits remain in the evidence report.
