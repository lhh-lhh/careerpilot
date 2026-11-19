# Approved workbench remediation implementation plan

> **For agentic workers:** Use superpowers:executing-plans, task-by-task in this session.

**Goal:** Implement the approved 49 page/43 window design pack in the functioning Vue application without changing business or AI behavior.

**Architecture:** A presentation-only route catalog selects approved artwork and header variants. A slotted WorkbenchHeader separates real heading content, decorative imagery and original action controls. Existing views retain their state, permissions, services, events and data; page-family CSS and explicitly composed layouts reproduce the approved designs.

**Tech Stack:** Vue 3, TypeScript, existing Vite/Pinia/Router, Vitest and Playwright; no new dependency.

**Spec:** `outputs/workbench-remediation-20261118/design-pack/{README.md,manifest.json,design.css,pages/,windows/}` approved by user “按设计稿执行，一比一复现”. The design-only ribbons, synthetic values and explanatory QA labels are not production content.

## Global constraints

- Preserve all routes/query, form fields, data sources, events, disabled/permission conditions and lifecycle keys.
- No edits to server/gateway/services/adapters/domain/stores/router/composables/types/contracts or dependency/configuration files.
- Preserve all AI consent, calls, costs, quotas, retries, cancellation, concurrency and persistence; no paid AI generation in QA.
- Reuse the 48 already generated gpt-image-2.6 illustrations, no provider switch or additional generation required.
- Match 218px gradient sidebar, 74px toolbar, 24px/30px main gutters, white panels, blue/cyan/orange accents, separate image/text grid and action rail, 390px responsive and dark designs.
- All existing real content is retained even where the synthetic design abbreviates it. Real data determines row counts/heights.
- Browser plugin unavailable: use Playwright Chromium and installed Edge. Synthetic isolated databases/accounts only. Physical devices and public-domain deployment require external access and are not claimed.
- Reuse the clean existing non-main UI branch; no destructive Git operations, merges or push. No extra worktree is created without consent.

## Task 1: Header, theme and page coverage

Files: `src/components/presentation/WorkbenchHeader.vue`, `src/presentation/workbench-design.ts`, `src/styles/workbench-design.css`, `src/main.ts`, existing view templates, `public/media/workbench/`, `tests/e2e/workbench-design.spec.ts`.

- [ ] Add failing rendered test: original interview links must be below and disjoint from artwork; expected no initial AI POSTs; overview must show real job art.
- [ ] Run baseline test against existing dist and record failure.
- [ ] Copy approved illustration assets (measure sizes, preserve provenance), add pure route metadata and slotted header. Replace only heading wrappers/imports; preserve all original slot controls and bindings.
- [ ] Apply exact shell/header/action/button/panel/form/table/mobile/dark tokens and all route-specific image variants.
- [ ] Build and rerun new geometry and interactive tests at 1440/390/320 widths.

## Task 2: Real overview and page-specific bodies

Files: `src/views/student/HomeView.vue`, `src/presentation/job-artwork.ts`, `tests/unit/job-artwork.test.ts`, individual workbench view templates/styles.

- [ ] Add failing cross-page job identity test (`jobArtworkBatch([job,other])` must equal single identity output independent of position/filter).
- [ ] Implement stable semantic identity mapping; preserve available imagery and document finite-resource repetition.
- [ ] Compose overview task/recommendation/main/rail/stat/diagnosis/journey regions with existing real data, complete six dimensions and routes.
- [ ] Apply distinct editor, comparison, interview, report, timeline, schedule, roster, chart and governance structures; do not add inert controls or synthetic records.
- [ ] Exercise all existing actions and retain every original binding; capture route-specific renders and fix visual mismatches.

## Task 3: Windows and shared pages

Files: `src/components/base/AppOverlay.vue`, `src/views/AccountStatusView.vue`, `src/views/StatusView.vue`, `src/views/DataCheckView.vue`, shared CSS.

- [ ] Verify title/art/close/button disjoint geometry, body-only scroll and visible footer using real existing modal tests.
- [ ] Implement explicit decorative image grid and fixed header/footer in shared overlay; preserve focus trap, escape, return-focus, teleports and close events.
- [ ] Match standalone account/status/data-check/design-system designs, role-specific images and real conditional content.
- [ ] Preserve native browser confirmations, file pickers, print and microphone permission boundaries and pet drag/settings.

## Task 4: Regression, fidelity and delivery

Files: `docs/evidence/workbench-remediation-20261118/` test/source/fidelity reports.

- [ ] Run source invariant audit: byte-identical protected files; normalize only explicitly approved presentation imports/wrappers while preserving binding multiset and order where business-dependent.
- [ ] Fresh typecheck, lint, build, unit, contract, seed, E2E and performance checks; diagnose failures instead of weakening assertions.
- [ ] Capture all routes, light/dark and desktop/mobile; verify important content/art overlap, asset load, overflow, focus and AI no-auto-call contracts.
- [ ] View accepted and actual native-size screenshots, record copy/layout/type/palette/asset/spacing/responsive differences and repair them.
- [ ] Verify current local online server serves the new dist. Report exact evidence and honest boundaries; no claim of physical-device/public-domain verification.

## Baseline / execution log

- 2026-11-18: clean branch `ui-refresh-20261117`, baseline `5295f53`. No linked worktree/artifacts.
- Unit baseline: 534/535 in concurrent run, one 5000ms service-ticket timeout. Isolated rerun `vitest run tests/unit/online.test.ts`: 22/22 pass, no source change. Final suite will use reduced worker concurrency to avoid host CPU contention.
- Design spec reviewed: preserve live dynamic copy/security disclosures rather than introducing design dummy scores, labels or claims.
