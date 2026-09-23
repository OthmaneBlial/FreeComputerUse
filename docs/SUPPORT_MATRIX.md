# Support matrix

Updated 23 September 2026. This matrix separates code that exists, automated
contract coverage, and evidence from a real provider. An OpenAI-compatible URL
does not prove that every service using that label accepts the same request.

## Model connections

| Connection | Implemented route | Automated evidence in this repository | Live evidence and current status |
| --- | --- | --- | --- |
| OpenAI-compatible API | `openai-compatible`; bearer key; configurable base URL; `/chat/completions`; JSON object or schema request | Five `tests/provider.test.ts` cases cover a local HTTP stub, schema validation, usage accounting, context trimming, HTTPS rules and bounded correction. They do not contact vendor services. | DeepSeek Flash has a dated, single-trial benchmark in [`BENCHMARKS.md`](BENCHMARKS.md). OpenAI, xAI/Grok, Gemini, Mistral and OpenRouter are configuration examples using this generic route; each vendor/model combination remains individually unverified here. |
| Anthropic API | `anthropic`; `x-api-key`; Messages endpoint; JSON object mode | The provider shares request validation and budgeting code, but the repository has no Anthropic-specific contract test. | Not live-tested in the recorded project evidence. Unverified. |
| ChatGPT subscription | Local Codex CLI; checks `codex login status`; runs an ephemeral, read-only `codex exec` request with tools disabled | Provider code is present; the repository has no Codex CLI contract/integration test. | Not verified against an authenticated ChatGPT plan in the recorded project evidence. Requires a compatible Codex CLI and account/plan access. |
| Claude Pro/Max subscription | Local Claude Code CLI; checks first-party subscription authentication; runs a restricted, non-persistent prompt with tools disabled | Provider code is present; the repository has no Claude Code CLI contract/integration test. | Not verified against an authenticated Claude subscription in the recorded project evidence. `.env.example` documents a minimum CLI version; recheck it before each release. |

### OpenAI-compatible configuration examples

These are endpoint examples in the README, not individually verified vendor
certifications. Check each provider's current model name, JSON support, token
parameters, endpoint and terms before use.

| Service named in project docs | Route | Project-specific live test |
| --- | --- | --- |
| DeepSeek | OpenAI-compatible | One dated public benchmark with `deepseek-flash` on 18 September 2026; one trial per case. It is historical evidence, not a current guarantee. |
| OpenAI | OpenAI-compatible | None recorded. |
| xAI / Grok | OpenAI-compatible | None recorded. |
| Google Gemini | OpenAI-compatible endpoint | None recorded. |
| Mistral | OpenAI-compatible | None recorded. |
| OpenRouter | OpenAI-compatible endpoint | None recorded. |

## Browser, runtime and distribution

| Area | Declared or implemented | Verified evidence | Limit |
| --- | --- | --- | --- |
| Node.js | `package.json` requires Node `>=22.13.0`. | TypeScript checks passed on Node `25.9.0`, macOS `25.6.0`, Apple Silicon on 23 September 2026. | Minimum Node version and other operating systems have not been validated in this run. |
| Browser engine | Playwright `1.63.0`; README setup asks for Chromium. | The repository contains Chromium browser tests and dated local benchmark records. | Full browser tests did not run in this validation session: the matching Playwright Chromium headless shell is absent. No browser was downloaded. Other engines are unverified. |
| Browser task behavior | DOM observation, bounded action plans, origin/action approvals, result checks and compatible workflow replay are implemented. | Local test cases and dated synthetic/public benchmark reports exist. | Evidence is scoped to the cases and exact compatible starts described in the reports. It does not establish universal website success or arbitrary workflow transfer. |
| Vision and canvas | Local screenshots/preview exist. | Screenshot paths are documented as local. | Images are not sent to the model; model vision and visual-only/canvas control are not implemented. |
| npm package | Package metadata declares a CLI and library entry point; package name is `free-computer-use`. | `npm pack` has not been validated from a clean installation in this run. | No npm publication is verified; registry lookup returned 404 during the 23 September audit. `0.1.0` is manifest metadata, not a published release. |
| GitHub release / binary | No release tag or GitHub release was present at audit time. | None. | No downloadable release binary or archive is currently offered. |
| GitHub Actions | No active workflow is in the checkout. | `docs/LOCAL_VALIDATION.md` records the repository owner's instruction to keep GitHub validation workflows disabled and not dispatch them. | Local checks remain the validation route unless the owner changes that instruction. |

## Validation snapshot for this implementation session

- `npm run check`: passed on Node `25.9.0`.
- Public-lab build regression test: passed; it ran the build twice and confirmed
  `docs/index.html` stayed byte-for-byte unchanged and `docs/lab/index.html` was
  stable across both runs.
- Provider mock tests: five passed when run without browser-dependent tests.
- Full `npm test`: **not verified**. The matching Playwright browser is absent;
  tests that start a server before launching Chromium can remain open after the
  launch failure. The current user instruction prohibits downloading a large
  browser binary, so no install was attempted.
- No live API or subscription call was made in this session; no credentials
  were read or printed.

Update this page only when a specific local test, dated live run, supported
runtime check, or public release provides new evidence. Keep failures and
untested combinations visible.
