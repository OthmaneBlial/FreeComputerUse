# Support matrix

Updated 23 September 2026. This matrix separates code that exists, automated
contract coverage, and evidence from a real provider. An OpenAI-compatible URL
does not prove that every service using that label accepts the same request.

## Model connections

| Connection | Implemented route | Automated evidence in this repository | Live evidence and current status |
| --- | --- | --- | --- |
| OpenAI-compatible API | `openai-compatible`; bearer key; configurable base URL; `/chat/completions`; JSON object or schema request | Seven local HTTP/mock contract cases cover request format, schema validation, usage, context trimming, HTTPS, bounded correction, safe HTTP errors and OpenAI's completion-limit parameter. | One live DeepSeek Flash completion passed on 23 September 2026 using synthetic content: one request, one parsed action, 1,517 input and 73 output tokens. OpenAI, xAI/Grok, Gemini, Mistral and OpenRouter remain individually unverified here. |
| Anthropic API | `anthropic`; `x-api-key`; Messages endpoint; prompted JSON object, locally validated | One local HTTP contract test covers the native request, headers, usage parsing, escaped page content and unsupported JSON-schema rejection. | Not live-tested in the recorded project evidence. Unverified. |
| ChatGPT subscription | Local Codex CLI; detects semantic CLI version, checks `codex login status`; runs an ephemeral, read-only `codex exec` request with tools disabled | Three local fake-CLI tests cover version parsing, output parsing, strict-schema conversion, records-selector restoration, required flags, environment isolation and actionable missing/unsigned errors. | One synthetic plan completion passed on 23 September 2026 using Codex CLI `0.156.1` and an authenticated ChatGPT login. One request; local budget estimates 7,022 input / 97 output tokens; model ID and actual provider usage were not reported. No browser action ran. |
| Claude Pro/Max subscription | Local Claude Code CLI; requires version `2.1.248+`, checks first-party subscription authentication; runs a restricted, non-persistent prompt with tools disabled | Three local fake-CLI tests cover version threshold, output parsing, required flags, environment isolation and actionable missing/unsigned errors. | Not verified against an authenticated Claude subscription. The local package manifest reports `0.2.69`; its `claude --version` command currently throws a Node `TypeError`, so update the CLI before live verification. |

### OpenAI-compatible configuration examples

These are endpoint examples in the README, not individually verified vendor
certifications. Check each provider's current model name, JSON support, token
parameters, endpoint and terms before use.

| Service named in project docs | Implemented route | Live model/date/result | Still unverified |
| --- | --- | --- | --- |
| DeepSeek | OpenAI-compatible | `deepseek-flash`; 23 September 2026; one synthetic plan completed in one request. | Browser task behavior, other model aliases and live `json_schema` behavior. |
| OpenAI | OpenAI-compatible | No live model request recorded. | Model access, request acceptance, output/usage shape and browser task behavior. |
| xAI / Grok | OpenAI-compatible | No live model request recorded. | Model access, request acceptance, output/usage shape and browser task behavior. |
| Google Gemini | OpenAI-compatible endpoint | No live model request recorded. | Model access, request acceptance, output/usage shape and browser task behavior. |
| Mistral | OpenAI-compatible | No live model request recorded. | Model access, request acceptance, output/usage shape and browser task behavior. |
| OpenRouter | OpenAI-compatible endpoint | No live model request recorded. | Account/model routing, request acceptance, output/usage shape and browser task behavior. |

## Browser, runtime and distribution

| Area | Declared or implemented | Verified evidence | Limit |
| --- | --- | --- | --- |
| Node.js | `package.json` requires Node `>=22.13.0`. | TypeScript checks passed on Node `25.9.0`, macOS `25.6.0`, Apple Silicon on 23 September 2026. | Minimum Node version and other operating systems have not been validated in this run. |
| Browser engine | Playwright `1.63.0`; defaults to its matching Chromium. Optional `FCU_BROWSER_CHANNEL` selects installed Chrome/Edge to avoid a browser download. | Installed Chrome `154.0.8037.57` launched locally and passed the focused security suite. A prior synthetic download test under system Chrome ended in `SIGTRAP`; a later full-suite run stalled on an idle Chrome process and was stopped. | Matching Playwright Chromium is absent. Do not treat system Chrome as a validated substitute; Playwright warns that non-bundled browsers may be incompatible. No browser was downloaded. |
| Browser task behavior | DOM observation, bounded action plans, origin/action approvals, result checks and compatible workflow replay are implemented. A loopback-only Chromium DevTools Protocol connection attaches to page targets before navigation and checks redirect hops. Closing the active page cancels its run and pending approval. | An earlier 13-test focused security run passed on system Chrome `154.0.8037.57`, including fast popup redirect denial before target receipt and the explicit-approval path. Separate credential-URL and cross-origin-WebSocket regressions also pass; the WebSocket fixture received no unapproved upgrade. | The full suite is not verified. DNS rebinding, approved WebSocket behavior, other browser builds and universal website success also remain unverified. |
| Vision and canvas | Local screenshots/preview exist. | Screenshot paths are documented as local. | Images are not sent to the model; model vision and visual-only/canvas control are not implemented. |
| npm package | Package metadata declares a CLI and library entry point; package name is `free-computer-use`. | `npm pack` has not been validated from a clean installation in this run. | No npm publication is verified; registry lookup returned 404 during the 23 September audit. `0.1.0` is manifest metadata, not a published release. |
| GitHub release / binary | No release tag or GitHub release was present at audit time. | None. | No downloadable release binary or archive is currently offered. |
| GitHub Actions | No active workflow is in the checkout. | `docs/LOCAL_VALIDATION.md` records the repository owner's instruction to keep GitHub validation workflows disabled and not dispatch them. | Local checks remain the validation route unless the owner changes that instruction. |

## Validation snapshot for this implementation session

- `npm run check`: passed on Node `25.9.0`.
- `npm run build`: passed.
- Previous recorded `npm run security` pass covered 6,005 tracked file versions.
  The history rescan in this iteration was stopped after more than one minute
  while traversing Git; it produced no new result. This pattern scan is not a
  complete security audit.
- `npm audit --omit=dev --audit-level=high`: passed; zero production dependency
  advisories reported.
- `FCU_BROWSER_CHANNEL=chrome LLM_API_KEY= npm run agent -- doctor`: passed the
  Node/runtime and browser-launch checks with no model configured.
- Public-lab build regression test: passed; it ran the build twice and confirmed
  `docs/index.html` stayed byte-for-byte unchanged and `docs/lab/index.html` was
  stable across both runs.
- Provider contract tests: eleven passed against local HTTP/fake-CLI fixtures.
- Provider doctor CLI: one local test passed for offline mode, a successful
  loopback `/models` response, missing API configuration and a simulated HTTP
  503; the configured API key and response body stayed out of CLI output.
- Earlier focused security-file run: 13/13 tests passed on system Chrome
  `154.0.8037.57`; the fast popup redirect test observed zero target requests
  when denied and one when approved. The run preceded addition of the initial
  credential-URL regression case; existing popup navigation test also passed
  standalone.
- Credentialed initial URL: two focused tests passed. The library agent rejects
  credentials before persisting a trace; the dashboard rejects credentials in
  the starting URL or allowed-origin list before creating an agent.
- Cross-origin WebSocket: focused Chrome `154.0.8037.57` test passed; the
  unapproved fixture server received no upgrade request. Approved WebSocket
  behavior and other browser builds remain unverified.
- DNS rebinding and other browser builds remain unverified.
- DeepSeek live smoke: one completion passed on 23 September 2026 using the
  synthetic title `Sandbox title`; one request, one parsed action, 1,517 input
  and 73 output tokens. This did not run a browser workflow or test other
  vendors.
- Full `npm test`: **not verified**. A run was stopped after process inspection
  found the suite idle in `tests/security.test.ts` with a headless Chrome child;
  no full-suite result is claimed. A prior run passed 49/50 and hit a Chrome
  `SIGTRAP` in a synthetic-download case. Matching Playwright Chromium is
  absent; no browser was downloaded.
- ChatGPT subscription smoke: one synthetic plan completed on 23 September 2026
  using Codex CLI `0.156.1`; local budget estimates 7,022 input / 97 output
  tokens. The model ID and actual provider usage were not reported. No browser
  action ran. Claude subscription remains unverified because its local
  `claude --version` command fails with a Node `TypeError`.

Update this page only when a specific local test, dated live run, supported
runtime check, or public release provides new evidence. Keep failures and
untested combinations visible.
