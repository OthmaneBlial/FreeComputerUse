# MVP requirement audit

Provider and runtime claims are scoped by the dated [support matrix](SUPPORT_MATRIX.md).
Historical benchmark evidence, repository test coverage and current live
provider checks are separate evidence categories.

This audit maps the original numbered brief to implemented behavior and explicitly
planned work. Source files alone are not considered evidence: the repository has
Chromium integration tests, real Flash runs and result-checked benchmark traces.

| Brief requirements | Result and evidence |
| --- | --- |
| 1–5: DOM-first browser agent, real tasks, local execution, Playwright | Implemented in `Agent`, `Browser`, `Observer`, `Executor`; real API contact/job and free public scenarios |
| 6–10: useful DOM, refs, selector ranking, compression, progressive context | Visible controls/forms/headings/tables/dialogs, frames/open shadow DOM, stable per-document refs, local ranking, bounded compression/diffs; accessibility and sanitized HTML escalation |
| 11–18: action DSL, compiler, planning, execution, verification, repair, diffs | All listed actions implemented; strict Zod plans/repairs; deterministic conditions, receipts and targeted repairs; Chromium tests |
| 19–20: caching and workflow learning | Bounded page/selector caches, local form aliases/strategies, SQLite semantic workflows; exact-compatible zero-provider repeats verified |
| 21: optional adapters | Generic local adapter and replaceable interface implemented. Named platform adapters planned; no external platform integration claimed |
| 22–25: metrics, budgets, inexpensive provider, routing | Actual usage/calls/timing, configured price estimates, conservative concurrent admissions, provider abstraction and live DeepSeek Flash. Multi-model routing planned as permitted for the first version |
| 26–28: screenshot fallback, accessibility, regions | Local screenshots/preview and manual control, accessibility snapshot and region observation implemented. Model vision and visual-only control planned |
| 29–35: forms, local vault/variables, sensitive actions, human control, sessions/auth | Required/options/errors/state extraction, aliases, normal website and action approvals, explicit Ultra, pause/resume/edit/manual/stop; persistent contexts, human security-check handoff; no CAPTCHA bypass |
| 36–41: CLI, interactive CLI, local UI, debugging, replay, history | run/open/inspect/replay/workflows/history/config/doctor/ui; three-column dashboard, loaded browser preview, events/budgets, private SQLite traces and provider-disabled replay |
| 42–48: modules, validation/security/injection, goal tracking, loops/hashes | Separate replaceable modules, fixed browser API, escaped untrusted content, preserved original goal, trusted criteria, max steps/repairs/repeated states/navigation checks |
| 49–60: KPIs, benchmark suite, zero-call reuse, local intelligence, compact structured context | Metrics/reports; six local plus fourteen public scenarios; result oracles and provider-free compatible repeats; semantic workflows, local similarity/form mapping, JSON outputs, bounded completed-action summary |
| 61–63: demo, README and diagrams | Real multi-page synthetic application plus contact/demo, broader free sandbox cases, runnable README and architecture diagram, actual UI screenshots |
| 64–65: naming and developer experience | Existing workspace name retained; GitHub repo created; local and global npm install/config/dev, source and built CLI, browser install documented; published npm `0.2.0` install, doctor, synthetic CLI tasks and MCP tool discovery verified |
| 66–68: real tests, local website, failures | Chromium unit/integration/UI checks with local lab; missing/replaced/duplicate controls, delayed content, validation, frame/tab changes, approval rejection, schema/budget failures and repair |
| 69–70: incremental phases and working MVP | Incremental main commits pushed. Actual API tasks open/observe/compress/plan/execute/verify/repair, print metrics and store traces |
| 71–74: deterministic-first philosophy and compiler-like vision | Local strategies and workflow matching precede provider calls. Arbitrary-site permanent workflow transfer remains a longer-term goal |
| 77: usable end-to-end implementation | Built and exercised with real Flash, private traces, human gates and result-checked local/public tasks |
| 75–76: no fabricated results and credentials | Scripted vs real runs labeled; benchmark outputs use independent correctness checks; no screenshot baseline claim; `.env` and `.fcu` ignored, known values redacted, tracked/history credential checks |

## Boundaries

The MVP automates browsers, not the full desktop. Compatibility is bounded by DOM
access, model planning and site behavior. A successful completion condition is not
a universal proof of natural-language task correctness. Human approvals and origin
restrictions reduce risk but do not make an allowed website trustworthy. Vault
storage is private by filesystem permissions, not encrypted. These limits are part
of the product documentation, not hidden behind a passing build.
