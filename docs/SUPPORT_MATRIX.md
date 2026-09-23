# Support matrix

Updated 23 September 2026. This matrix separates code that exists, automated
contract coverage, and evidence from a real provider. An OpenAI-compatible URL
does not prove that every service using that label accepts the same request.

## Model connections

| Connection | Implemented route | Automated evidence in this repository | Live evidence and current status |
| --- | --- | --- | --- |
| OpenAI-compatible API | `openai-compatible`; bearer key; configurable base URL; `/chat/completions`; JSON object or schema request | Six local HTTP contract cases cover request format, schema validation, usage, context trimming, HTTPS, bounded correction and safe HTTP errors. | One live DeepSeek Flash completion passed on 23 September 2026 using synthetic content: one request, one parsed action, 1,517 input and 73 output tokens. OpenAI, xAI/Grok, Gemini, Mistral and OpenRouter remain individually unverified here. |
| Anthropic API | `anthropic`; `x-api-key`; Messages endpoint; prompted JSON object, locally validated | One local HTTP contract test covers the native request, headers, usage parsing, escaped page content and unsupported JSON-schema rejection. | Not live-tested in the recorded project evidence. Unverified. |
| ChatGPT subscription | Local Codex CLI; detects semantic CLI version, checks `codex login status`; runs an ephemeral, read-only `codex exec` request with tools disabled | One fake-CLI contract test covers version parsing, output parsing, required flags and stripping API/provider environment variables. | Local `codex --version` reports `codex-cli 0.156.1`; authenticated ChatGPT plan and completion remain unverified. |
| Claude Pro/Max subscription | Local Claude Code CLI; requires version `2.1.248+`, checks first-party subscription authentication; runs a restricted, non-persistent prompt with tools disabled | One fake-CLI contract test covers version threshold, output parsing, required flags and stripping API/provider environment variables. | Not verified against an authenticated Claude subscription. The local package manifest reports `0.2.69`; its `claude --version` command currently throws a Node `TypeError`, so update the CLI before live verification. |

### OpenAI-compatible configuration examples

These are endpoint examples in the README, not individually verified vendor
certifications. Check each provider's current model name, JSON support, token
parameters, endpoint and terms before use.

| Service named in project docs | Route | Project-specific live test |
| --- | --- | --- |
| DeepSeek | OpenAI-compatible | One live `deepseek-flash` completion on 23 September 2026 (one request; synthetic content; no browser workflow), in addition to the dated 18 September benchmark. Neither establishes general compatibility or a current guarantee. |
| OpenAI | OpenAI-compatible | None recorded. |
| xAI / Grok | OpenAI-compatible | None recorded. |
| Google Gemini | OpenAI-compatible endpoint | None recorded. |
| Mistral | OpenAI-compatible | None recorded. |
| OpenRouter | OpenAI-compatible endpoint | None recorded. |

## Browser, runtime and distribution

| Area | Declared or implemented | Verified evidence | Limit |
| --- | --- | --- | --- |
| Node.js | `package.json` requires Node `>=22.13.0`. | TypeScript checks passed on Node `25.9.0`, macOS `25.6.0`, Apple Silicon on 23 September 2026. | Minimum Node version and other operating systems have not been validated in this run. |
| Browser engine | Playwright `1.63.0`; defaults to its matching Chromium. Optional `FCU_BROWSER_CHANNEL` selects installed Chrome/Edge to avoid a browser download. | Installed Chrome `153.0.8010.52` launched locally and passed most browser checks. After fixing the lab's missing favicon, a focused replay test exposed a Chrome `SIGTRAP` during a synthetic download workflow. | Matching Playwright Chromium is absent. Do not treat system Chrome as a validated substitute; Playwright warns that non-bundled browsers may be incompatible. No browser was downloaded. |
| Browser task behavior | DOM observation, bounded action plans, origin/action approvals, result checks and compatible workflow replay are implemented. | Local test cases and dated synthetic/public benchmark reports exist. | Evidence is scoped to the cases and exact compatible starts described in the reports. It does not establish universal website success or arbitrary workflow transfer. |
| Vision and canvas | Local screenshots/preview exist. | Screenshot paths are documented as local. | Images are not sent to the model; model vision and visual-only/canvas control are not implemented. |
| npm package | Package metadata declares a CLI and library entry point; package name is `free-computer-use`. | `npm pack` has not been validated from a clean installation in this run. | No npm publication is verified; registry lookup returned 404 during the 23 September audit. `0.1.0` is manifest metadata, not a published release. |
| GitHub release / binary | No release tag or GitHub release was present at audit time. | None. | No downloadable release binary or archive is currently offered. |
| GitHub Actions | No active workflow is in the checkout. | `docs/LOCAL_VALIDATION.md` records the repository owner's instruction to keep GitHub validation workflows disabled and not dispatch them. | Local checks remain the validation route unless the owner changes that instruction. |

## Validation snapshot for this implementation session

- `npm run check`: passed on Node `25.9.0`.
- `npm run build`: passed.
- `npm run security`: passed for 6,005 tracked file versions; this pattern scan
  is not a complete security audit.
- `npm audit --omit=dev --audit-level=high`: passed; zero production dependency
  advisories reported.
- `FCU_BROWSER_CHANNEL=chrome LLM_API_KEY= npm run agent -- doctor`: passed the
  Node/runtime and browser-launch checks with no model configured.
- Public-lab build regression test: passed; it ran the build twice and confirmed
  `docs/index.html` stayed byte-for-byte unchanged and `docs/lab/index.html` was
  stable across both runs.
- Provider contract tests: nine passed against local HTTP/fake-CLI fixtures.
- Provider doctor CLI: one local test passed for offline mode, a successful
  loopback `/models` response, missing API configuration and a simulated HTTP
  503; the configured API key and response body stayed out of CLI output.
- Focused security suite: nine tests passed with system Chrome
  `153.0.8010.52`; DNS rebinding and other operating systems remain unverified.
- DeepSeek live smoke: one completion passed on 23 September 2026 using the
  synthetic title `Sandbox title`; one request, one parsed action, 1,517 input
  and 73 output tokens. This did not run a browser workflow or test other
  vendors. ChatGPT and Claude subscription authentication remain unverified.
- Full `npm test`: **not verified**. The matching Playwright browser is absent;
  the first run using system Chrome passed 49/50 tests but failed on a missing
  lab favicon, which is now fixed. The focused lab replay then reached a
  synthetic-download scenario where system Chrome exited with `SIGTRAP`. The
  matching Playwright browser is not installed, and no browser was downloaded.
- No authenticated subscription request was made in this session.

Update this page only when a specific local test, dated live run, supported
runtime check, or public release provides new evidence. Keep failures and
untested combinations visible.
