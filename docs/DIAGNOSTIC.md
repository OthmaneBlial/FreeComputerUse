# Diagnostic — 25 October 2026

Starting point for the "autonomous, teachable Computer Use" work. Baseline:
`v0.2.23` (`caf4c84`), macOS 26.6, Node 25.9.0, system Chrome. `npm run check`
and `npm test` passed 196/196 before any change in this session.

## What works today (verified in this checkout)

- **Browser engine.** DOM-first observe → plan → execute → verify → repair loop
  (`src/agent/Agent.ts`) on Playwright, with a fixed action set (click, type,
  select, upload, download, tabs, scroll, wait, extract…), post-condition
  checks, bounded repairs, loop guards, pause/resume/stop and human approval.
- **Safety.** Per-site approval, origin allowlist enforced in Chromium and in a
  local proxy, private-network blocking, sensitive-action confirmation,
  prompt-injection warnings, redacted traces, loopback-only dashboard with CSRF.
- **Providers.** One HTTP adapter (`FlashProvider`) for OpenAI-compatible
  chat completions and the Anthropic Messages API (prompted JSON, locally
  validated); local Codex CLI and Claude Code CLI subscription adapters.
  Codex CLI 0.164.0 and Claude Code 2.1.310 are installed and signed in on this
  machine; a DeepSeek key is available locally for live tests.
- **Learned workflows.** A successful run is cached and replayed without a
  model call — but only for the same origin, path, exact goal text and page
  structure hash.
- **Dashboard.** Goal form, live preview, manual control, approvals, run
  history, replay, metrics (calls, tokens, configured cost).

## What is missing or only simulated

| Area | Status before this work |
| --- | --- |
| Claude API | Request/response contract test only; no retries on 429/529, no refusal handling, no prompt caching, generic HTTP errors, no end-to-end connection test. |
| Provider choice | One provider per process from `.env`; no per-run choice, fallback or escalation; no connection test in the UI. |
| DeepSeek / OpenAI | DeepSeek has one dated live plan call; OpenAI is a configuration example only. |
| Teach me | Not implemented. The agent cannot ask for or record a demonstration. |
| Procedure memory | No names, parameters, versions, run history, success rate, fuzzy retrieval, edit/rename/duplicate/delete/export/import. A different wording of the same goal misses the cache. |
| Replay after UI change | Any structure change misses the cache and replans from scratch. |
| Google Play scenario | No test console, no AAB upload flow. |
| Token measurements | Single public benchmark; no first-run vs repeat vs changed-UI comparison per workflow. |
| Vision | Screenshots stay local; no visual fallback. |

## Priorities for this work

1. Claude first: robust Anthropic Messages adapter, explicit errors, retries,
   end-to-end connection test; then DeepSeek and OpenAI/Codex presets,
   per-run provider selection, fallback and escalation.
2. Durable procedures with parameters, versions, history and fuzzy retrieval.
3. Teach mode (recorded demonstration or explicit steps) and targeted help
   requests when the agent is stuck.
4. Smart replay: local execution, tolerant selectors, model repair only for the
   changed step, new version after a validated repair.
5. Local Play Console simulator: AAB upload, checks, stop before publishing.
6. Measured calls/tokens: first run, repeat, minor UI change.
7. UI, CLI and documentation for all of the above.
