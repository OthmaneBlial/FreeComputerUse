# FreeComputerUse

**An autonomous browser agent that spends tokens on thinking, not clicking.**

TypeScript and Playwright. A model plans batches of validated browser actions;
local code extracts the DOM, executes, verifies, and reuses successful workflows.
Screenshots are an optional fallback, not the main observation loop.

## Development status

This repository is being built incrementally. The first working milestone includes
Chromium, visible DOM/form extraction, frames and open shadow roots, stable
element references, ranked selectors, bounded compression, strict action
validation, local profile variables, deterministic conditions and a controlled
Playwright executor. See the [implementation contract](docs/IMPLEMENTATION.md).

Run `npm run check` and `npm test` for the real Chromium fixture tests. Start the
local browser lab with `npm run fixtures`, then open `http://127.0.0.1:3000`.
The agent also includes a real HTTP model provider, compact plan batches, bounded
repair, token admission budgets, DOM diffs, private SQLite traces and semantic
workflow learning/replay. `npm run demo -- --live` runs the full job application
with your configured model; `npm run demo` uses a clearly labeled scripted fixture
planner without an LLM. The demo only submits synthetic data to its own local site.

Measured on 2026-09-18 with real `deepseek-flash`: the contact form used 7 actions,
1 model call and 1,207 tokens; the complete job application used 11 actions,
3 model calls and 4,272 tokens with approval before final submission. These are
local fixture measurements, not third-party site success rates or comparisons
against a screenshot agent. No API credentials are included.

## Configuration

Node 22.13 or newer is required. Install dependencies with `npm ci` and Chromium
with `npx playwright install chromium`. Copy `.env.example` to `.env` locally,
then set your model, endpoint and API key. `.env` and local browser state are
excluded from Git.

MIT licensed.
