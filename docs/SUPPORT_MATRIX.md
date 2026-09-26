# Support matrix

Updated 26 September 2026. This matrix separates code that exists, automated
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
| MCP host integration | Local `stdio` server, MCP TypeScript SDK `2.0.0`; tools start, inspect, follow/verify and stop a browser task. | On 24 September 2026, four focused tests passed with the official TypeScript MCP client. MCP Inspector 2.8.0 connected to the built CLI, displayed site approval and declined it; the task failed with zero model calls and zero fixture requests. On 26 September, the published `free-computer-use@0.2.0` package launched from a fresh prefix on Node `22.13.0`; the official client listed all four tools over `stdio`. | The package smoke covers launch and tool discovery, not task execution through the published package. Inspector covers the built CLI. Other desktop hosts remain unverified; approvals require form elicitation. |
| Node.js | `package.json` declares an install floor of Node `>=22.13.0`; this does not certify every release in that range. | The full `FCU_BROWSER_CHANNEL=chrome npm run validate` gate passed on Node `22.13.0` and `25.9.0` on 26 September 2026: 131/131 tests on each, type checks, build, historical secret scan and npm audit (zero vulnerabilities). The published `free-computer-use@0.2.0` also installed in a fresh prefix on Node `22.13.0`; `agent doctor` reported browser launch passed. Runtime: macOS `26.6`, Apple Silicon and system Chrome `154.0.8037.57`. | Other Node releases and Windows/Linux have not been validated. Node `22.13.0` emits the expected experimental `node:sqlite` warning. |
| Browser engine | Playwright `1.63.0`; defaults to its matching Chromium. Optional `FCU_BROWSER_CHANNEL` selects installed Chrome/Edge to avoid a browser download. | System Chrome `154.0.8037.57` passed the full 131/131 serial suite on Node `22.13.0` and `25.9.0` on 26 September 2026. `FCU_BROWSER_CHANNEL=chrome npm run demo -- --headed --contact` also completed seven local actions with zero model calls and exited cleanly on 24 September 2026. | Matching Playwright Chromium is absent. Playwright warns that non-bundled browsers may be incompatible. Other browser builds and operating systems remain unverified. No browser was downloaded. |
| Browser task behavior | DOM observation, bounded action plans, origin/action approvals, result checks and compatible workflow replay are implemented. A loopback-only Chromium DevTools Protocol connection attaches to page targets before navigation and checks redirect hops. A second loopback proxy enforces origin policy for HTTP(S)/WebSocket traffic, blocks private/reserved DNS answers and checks private IPv4 embedded in prefixes learned through `ipv4only.arpa`. The persistent Chromium profile disables WebRTC UDP that the proxy cannot carry. Explicit IP literals need exact origin approval. Ultra/`allowExternal` opts out of origin and private-address checks. Closing the active page cancels its run and pending approval. | On 24 September, the dashboard was changed to reuse one `Agent` and Chromium context between tasks, opening a fresh tab for each task. Regression checks confirm dashboard replay keeps the same context, all eight lab workflows replay in that context, and the persistent network proxy reapplies private-address policy when the mode changes. The clean serial full suite passed 101/101 on system Chrome `154.0.8037.57`, macOS `26.6`, Node `25.9.0`. Security cases include popup redirects, simulated DNS rebinding, reserved ranges, normal/Ultra behavior and approved/blocked WebSockets. A Chrome-originated WSS fixture returns a frame through the proxy; its generated local certificate is ignored. A separate opt-in `security:wss` smoke connected to Postman Echo with Chrome’s normal TLS validation and received its synthetic message. Synthetic DNS64 fixtures cover all six RFC 6052 prefix lengths; actual NAT64 discovery remains unverified. A local STUN receiver got no WebRTC UDP packets. | Before context reuse, relaunching Chrome `154.0.8037.57` with the same persistent profile caused a `SIGSEGV` on 23 September; the `.ips` report identifies `CrBrowserMain` and `EXC_BAD_ACCESS`. The dashboard now avoids this process boundary, and its full local regression suite passes. Reopening the same profile through a standalone Playwright process remains unverified. Matching Playwright Chromium is absent; no browser was downloaded. Live NAT64 discovery, other trusted WSS endpoints, non-HTTP traffic beyond the WebRTC STUN fixture, other browser builds, Windows/Linux and universal website success remain unverified. WebRTC services needing direct UDP may fail. |
| Vision and canvas | Local screenshots/preview exist. | Screenshot paths are documented as local. | Images are not sent to the model; model vision and visual-only/canvas control are not implemented. |
| npm package | Published `free-computer-use@0.2.0`; package exposes an ESM library and global `agent` command. | Registry reports `0.2.0` as `latest` and integrity `sha512-glkwOKYiU49UaD+GFiJ7IovFvEZXBkszsylVDri1Z5LlOW15H+eeerv9BEYXvIfbYiISmpsxWwsUJZIeA8UiUg==`, matching the release candidate. Fresh-prefix install on Node `22.13.0` passed `agent doctor` and Chrome launch; CLI extracted page text, five visible links and a synthetic table with one action and zero model calls. The published MCP command also launched and listed four tools over `stdio`. | Package tasks and runtime were checked on macOS `26.6`/Apple Silicon with system Chrome `154.0.8037.57`; other OS/browser combinations remain unverified. MCP package smoke covers discovery, not task execution or approvals. |
| GitHub release / archive | Public release `v0.2.0`, published 26 September 2026. | Release includes `free-computer-use-0.2.0.tgz` and `SHA256SUMS`; archive SHA-256 `dda4770ff198412180855882db6201b15cdfb25276f685854ca0dfa7124edde4` matches the npm candidate. | Archive requires Node.js, npm and a supported installed browser; no standalone native executable is offered. |
| GitHub Actions | No workflow files are tracked in the checkout. | `git ls-files '.github/workflows/*'` returned no workflow; no workflow was activated or dispatched. `docs/LOCAL_VALIDATION.md` records the owner instruction. | Local checks remain the validation route unless the owner changes that instruction. |

## Validation snapshot for this implementation session

- Fresh-export onboarding: `git archive` of commit `eca3f17`, offline `npm ci`,
  copied `.env.example` with Chrome selected, `chmod 600`, `agent doctor`,
  keyboard-only no-key `ui:smoke`, and `npm run dev -- --port 0` all passed on
  macOS `26.6` / Node `25.9.0` / system Chrome `154.0.8037.57`. Dashboard
  returned HTTP `200`; export was removed.
- `npm run check`: passed on Node `25.9.0` on 24 September 2026.
- `npm run build`: passed.
- Previous recorded `npm run security` pass covered 6,005 tracked file versions.
  On 24 September 2026, the checkout-only scan passed 245 tracked file versions;
  the full history rescan was stopped after 2 minutes 30 seconds without a
  result. This pattern scan is not a complete security audit.
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
- Local environment file: a subprocess test passed on macOS; a permissive `.env`
  became owner-only before loading, a symlink was rejected without changing its
  target, and the test key stayed out of standard output/error.
- Focused security-file run: 26/26 tests passed on system Chrome
  `154.0.8037.57`, including popup redirect denial/approval, simulated DNS
  rebinding blocked before HTTP/TLS-tunnel target receipt, hostname-to-loopback
  denial, Ultra access to a local fixture, and approved/blocked WebSockets.
- WebRTC egress: Chrome `154.0.8037.57` generated an ICE offer while a local UDP
  STUN fixture observed no direct packets; an unrelated browser preference was
  preserved. This verifies the local STUN scenario only.
- Focused action and results runs: 8/8 and 1/1 tests passed on system Chrome
  `154.0.8037.57`; upload/download/navigation, saved-download confinement and
  result reporting remained functional. Download directory/file modes `0700`/
  `0600` were verified on macOS.
- Credentialed initial URL: two focused tests passed. The library agent rejects
  credentials before persisting a trace; the dashboard rejects credentials in
  the starting URL or allowed-origin list before creating an agent.
- Cross-origin WebSocket: Chrome `154.0.8037.57` tests passed for denied and
  approved plain WS endpoints; the denied fixture received no upgrade. A
  browser-originated WSS test passed for an approved origin and returned a frame;
  an unapproved WSS origin was blocked before the target received a TCP
  connection. The test ignores its generated local certificate, so public trust
  validation and other browser builds remain unverified.
- Profile and local-data lifecycle: 4/4 tests passed on macOS. Unknown fields are
  rejected without replacing the existing vault; symbolic-link reads and writes
  are refused; profile mode is `0600`; data directory/history modes are `0700`/
  `0600`; deleting a stopped data directory and restarting creates a fresh empty
  history. A forced filesystem write failure leaves the existing profile bytes
  unchanged. Forty saved runs remain stored; the history limit only affects
  displayed summaries. Retention is manual with no expiry. Windows/Linux
  permissions remain unverified.
- IPv6 allowlist matching: focused test passed; expanded and compressed loopback
  spellings normalize to one origin, while a different port and path-scoped
  allowlist are denied.
- DNS private-address guard: a simulated first lookup to `8.8.8.8` followed by a
  connection-time lookup to loopback was rejected before the target received an
  HTTP request or TCP tunnel. Another test confirms a successful connection uses
  its first vetted IP without resolving again. These run with the local proxy and
  do not validate network-specific NAT64 or other browser builds.
- DNS64/NAT64: synthetic DNS64 answers for RFC 6052 prefixes `/32`, `/40`, `/48`,
  `/56`, `/64` and `/96` reject private embedded IPv4 and allow `8.8.8.8`. The
  current system resolver returned only IPv4 A records for `ipv4only.arpa`; live
  network-prefix discovery remains unverified.
- First-run dashboard smoke: `FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` passed
  on 23 September 2026 from a clean export of commit `eca3f17` with Node `25.9.0`,
  macOS `26.6`/Apple Silicon and system Chrome `154.0.8037.57`. Offline `npm ci`,
  `.env.example` copy, `FCU_BROWSER_CHANNEL=chrome`, `chmod 600`, doctor, UI smoke
  and CLI server startup all passed without a provider or browser download. The
  smoke used keyboard input, Enter to start/approve/open the result, and Escape to
  close it; the approved synthetic task completed with one browser action and
  zero model calls. Output, preview, console and 1600/390 px overflow checks
  passed. This verifies one clean-checkout onboarding path, not other OS, Node or
  browser combinations.
- Results UI smoke: `FCU_BROWSER_CHANNEL=chrome npm run ui:results` passed on
  23 September 2026 with its authored local planning fixture. The independent
  journey oracle, result facts, fullscreen view, viewer scrolling and browser
  console checks passed. This validates result presentation, not model planning.
- Dashboard UI tests: `FCU_BROWSER_CHANNEL=chrome ./node_modules/.bin/tsx --test
  tests/ui.test.ts` passed 11/11 on 24 September 2026. Cases cover rejecting
  site access before a visit, stopping while approval is pending, a synthetic
  provider timeout shown as failed, a false extraction criterion shown as a
  partial result, revoking an approved origin and blocking a fetch before the
  local fixture receives it, and the distinct `BLOCKED` state for a
  private-network DNS refusal. The
  timeout used an in-process fake provider; this is not a live provider timeout
  test. The dashboard run still reports its historical trace status as `failed`
  with `failureKind: security` for policy blocks.
- Agent and security tests: `FCU_BROWSER_CHANNEL=chrome ./node_modules/.bin/tsx
  --test tests/agent.test.ts tests/security.test.ts` passed 35/35 on 24 September
  2026 after the permission and security-state changes. This remains local test
  evidence, not a cross-platform or full-suite result.
- Lab/site smoke: `FCU_BROWSER_CHANNEL=chrome npm run lab:smoke` passed on
  23 September 2026. It rendered 24 lab pages and eight task cards, played the
  local 1600x900 demo clip, loaded the brand asset, and reported no browser
  console errors. Horizontal overflow checks passed at 320, 390, 768 and 1440 px
  for the lab pages/workflow library. It refreshed 50 lab and two dashboard PNG
  captures. The dashboard and lab keyboard paths, accessible names, contrast,
  and responsive widths are verified as recorded in `ROADMAP.md`. Spoken
  VoiceOver/NVDA output remains unverified and is not claimed.
- DeepSeek live smoke: one completion passed on 23 September 2026 using the
  synthetic title `Sandbox title`; one request, one parsed action, 1,517 input
  and 73 output tokens. This did not run a browser workflow or test other
  vendors.
- Full serial `FCU_BROWSER_CHANNEL=chrome npm test`: passed 100/100 on 24 September
  2026 in 148.8 seconds before the history-scan regression test was added. The
  latest suite passes 102/102 in 156.44 seconds at commit `d978b06` with system
  Chrome `154.0.8037.57`, macOS `26.6`, and Node `25.9.0`. `npm test` pins test-file
  concurrency to one. This does not validate standalone same-profile Chrome
  relaunches, bundled Playwright Chromium, Windows, or Linux. No browser was
  downloaded.
- **Clean full validation (24 September 2026, commit `1ca1006`):**
  `npm ci --offline --no-audit --no-fund` added the locked dependencies without
  a browser download. `FCU_BROWSER_CHANNEL=chrome npm run validate` then passed
  in 157.19 seconds: 101/101 tests, build, history scan (248 worktree files,
  250 unique paths, 948 unique blobs) and `npm audit` with zero vulnerabilities.
  The run needs npm registry access only for the final audit.
- **Latest full validation (24 September 2026, commit `d978b06`):**
  `env LLM_API_KEY= FCU_BROWSER_CHANNEL=chrome npm run validate` passed with
  102/102 tests, build, history scan (255 worktree files, 257 unique paths,
  980 unique blobs) and `npm audit` with zero vulnerabilities. No provider key
  was configured and no GitHub workflow was triggered.
- One preceding clean full run passed 100/101 because a dashboard test saw a
  local HTTP `502`; the isolated test and the next two full suites passed. The
  test now reports captured HTTP 5xx paths before generic console errors, but
  the original request path and root cause were not captured. Keep this
  intermittent result visible; the passing reruns do not prove it impossible.
- Headed browser smoke: `FCU_BROWSER_CHANNEL=chrome npm run demo -- --headed
  --contact` passed on 24 September 2026 with the scripted local fixture. It
  performed seven browser actions, used zero model calls, completed the local
  contact workflow and exited `0`. The synthetic `.fcu/demo` data was removed.
  The full Chrome suite verifies the headless path. Both tests used Node
  `25.9.0`, macOS `26.6`, and Chrome `154.0.8037.57`.
- `FCU_BROWSER_CHANNEL=chrome npm run security:wss`: passed on 24 September 2026; system Chrome `154.0.8037.57` used default TLS validation to connect to `wss://ws.postman-echo.com/raw` and received the fixed synthetic payload. This is one external endpoint check, not proof for every WSS service. Postman documents this endpoint in its [Echo API guide](https://learning.postman.com/docs/developer/echo-api).
- An earlier `FCU_BROWSER_CHANNEL=chrome npm run validate` had been stopped
  during its per-file Git-history scan after 2 minutes 30 seconds; that scan
  checked only the checkout at the time. The batched historical-object scan now
  completes as part of the clean full validation above.
- ChatGPT subscription smoke: one synthetic plan completed on 23 September 2026
  using Codex CLI `0.156.1`; local budget estimates 7,022 input / 97 output
  tokens. The model ID and actual provider usage were not reported. No browser
  action ran. Claude subscription remains unverified because its local
  `claude --version` command fails with a Node `TypeError`.

Update this page only when a specific local test, dated live run, supported
runtime check, or public release provides new evidence. Keep failures and
untested combinations visible.
