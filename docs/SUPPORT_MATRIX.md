# Support matrix

Updated 27 September 2026. This matrix separates code that exists, automated
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
| MCP host integration | Local `stdio` server, MCP TypeScript SDK `2.0.0`; tools start, inspect, follow/verify and stop a browser task. | Fresh-prefix v0.2.20 npm registry install reports server version `0.2.20` and exposes all four tools over `stdio`; candidate, registry and GitHub release archives match byte for byte. Earlier evidence: MCP Inspector 2.8.0 displayed site approval and a decline reached no fixture; the published `free-computer-use@0.2.0` package launched on Node `22.13.0` and exposed all four tools. | The v0.2.0 published-package smoke covers launch and tool discovery, not task execution through that version. Other desktop hosts remain unverified; approvals require form elicitation. |
| Node.js | `package.json` declares an install floor of Node `>=22.13.0`; this does not certify every release in that range. | The v0.2.20 clean release commit passed 178/178 tests on Node `25.9.0`, including type checks, build, history scan and `npm audit`. Runtime: macOS `26.6`, Apple Silicon, npm `11.12.1` and system Chrome `154.0.8037.57`. Earlier full gates: v0.2.19 178/178, v0.2.18 177/177, v0.2.17 177/177, v0.2.16 176/176 and v0.2.9 143/143. | Other Node releases and Windows/Linux have not been validated. Node `22.13.0` emits the expected experimental `node:sqlite` warning. |
| Browser engine | Playwright `1.63.0`; defaults to its matching Chromium. Optional `FCU_BROWSER_CHANNEL` selects installed Chrome/Edge to avoid a browser download. | System Chrome `154.0.8037.57` passed the v0.2.20 serial 178/178 suite on Node `25.9.0`, after v0.2.19 178/178, v0.2.18 177/177, v0.2.17 177/177, v0.2.16 176/176, v0.2.9 143/143, v0.2.8 141/141, v0.2.7 140/140, v0.2.6 139/139 and v0.2.5 138/138. | Matching Playwright Chromium is absent. Playwright warns that non-bundled browsers may be incompatible. Other browser builds and operating systems remain unverified. No browser was downloaded. |
| Browser task behavior | DOM observation, bounded action plans, origin/action approvals, result checks and compatible workflow replay are implemented. A loopback-only Chromium DevTools Protocol connection attaches to page targets before navigation and checks redirect hops. A second loopback proxy enforces origin policy for HTTP(S)/WebSocket traffic, blocks private/reserved DNS answers and checks private IPv4 embedded in prefixes learned through `ipv4only.arpa`. The persistent Chromium profile disables WebRTC UDP that the proxy cannot carry. Explicit IP literals need exact origin approval. Ultra/`allowExternal` opts out of origin and private-address checks. Closing the active page cancels its run and pending approval. | On 24 September, the dashboard was changed to reuse one `Agent` and Chromium context between tasks, opening a fresh tab for each task. Regression checks confirm dashboard replay keeps the same context, all eight lab workflows replay in that context, and the persistent network proxy reapplies private-address policy when the mode changes. The v0.2.9 regression suite proves one repair attempt for a repeated state/action signature and a hard stop if the same signature repeats. Post-release regression test `85cfc36` preserves first/top-N semantics: return any available count from zero through the requested maximum. The historical live GitHub audit failure has not been rerun with a model. Previous security cases cover popup redirects, simulated DNS rebinding, reserved ranges, normal/Ultra behavior and approved/blocked WebSockets. A Chrome-originated WSS fixture returns a frame through the proxy; its generated local certificate is ignored. A separate opt-in `security:wss` smoke connected to Postman Echo with Chrome’s normal TLS validation and received its synthetic message. Synthetic DNS64 fixtures cover all six RFC 6052 prefix lengths; actual NAT64 discovery remains unverified. A local STUN receiver got no WebRTC UDP packets. | Universal website success is not established. Before context reuse, relaunching Chrome `154.0.8037.57` with the same profile caused a `SIGSEGV` on 23 September; standalone profile relaunch remains unverified. Matching Playwright Chromium is absent; no browser was downloaded. Live NAT64 discovery, other trusted WSS endpoints, other browser builds, Windows/Linux and WebRTC services needing direct UDP remain unverified. |
| Vision and canvas | Local screenshots/preview exist. | Screenshot paths are documented as local. | Images are not sent to the model; model vision and visual-only/canvas control are not implemented. |
| npm package | The ESM package exposes a library and global `agent` command. | Published `free-computer-use@0.2.20` is `latest`; registry integrity and shasum match the tested candidate, and candidate, registry and GitHub release tarballs are byte-identical. Fresh-prefix CLI, doctor, public table task and MCP checks are recorded in [v0.2.20 release notes](https://github.com/OthmaneBlial/FreeComputerUse/blob/main/release-notes/0.2.20.md). | Package task and runtime were checked on macOS `26.6`/Apple Silicon with system Chrome `154.0.8037.57`; other OS/browser combinations remain unverified. |
| GitHub release / archive | Public releases provide a versioned npm tarball and `.sha256` checksum sidecar; no standalone native executable is offered. | Public release `v0.2.20` tag resolves to validated commit `d7e800e`; its downloaded tarball passes its SHA-256 check and matches the tested candidate and npm copy byte for byte. See the [v0.2.20 release notes](https://github.com/OthmaneBlial/FreeComputerUse/blob/main/release-notes/0.2.20.md). | Archive requires Node.js, npm and a supported installed browser. |
| GitHub Pages site | Static product homepage, lab and scenario library are served from `main /docs`. | The public homepage displays `v0.2.20`, returns HTTP 200, and passes 320/390/768/1440 px overflow checks with no browser console errors. The branch source serves the release after Actions were disabled; workflow history remains at the earlier build. See the v0.2.20 release notes. | This verifies one desktop Chromium environment. Windows/Linux, other browsers and assistive-technology hardware remain unverified. |
| GitHub Actions | No project CI workflow files are tracked in the checkout. | Repository-level GitHub Actions are disabled. Before disablement, the only listed workflow was GitHub's Pages branch deployment. The `main /docs` source serves the updated `v0.2.20` homepage and support matrix; `docs/.nojekyll` is tracked. | Actions run history stops at the last pre-disable Pages workflow (`edd0cab`), so hosted build logs are no longer available. |

## Validation snapshot for this implementation session

- Release `v0.2.20` prevents rejected asynchronous event-listener promises,
  like synchronous listener exceptions, from escaping task event delivery. Its
  clean release commit `d7e800e961817625cdf72cbda974015996dacb7d` passed
  `FCU_BROWSER_CHANNEL=chrome npm run validate` with 178/178 tests in 451.13
  seconds, type checks, lab and package builds, history scan (284 worktree
  files, 286 historical paths and 1,589 blobs), and `npm audit` with zero
  vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`,
  npm `11.12.1`, and system Chrome `154.0.8037.57`. Its 135-file npm tarball
  is 1,172,261 bytes with SHA-256
  `6f4b48aa500cb83a3d7b12a110077e13831d6263905bf337ef20f7adbce024e4`; npm
  shasum is `efb6853bfe9a9fe4c480df09ffbf8849336918f8` and integrity is
  `sha512-NIiHnoXNq5O3FqsbhB7MDfZiLufCzT8SfX28jFz+cwfiMLa5nwCAs3cL2fHeSNt2L6FM94Onkcn5sHU70hZIkA==`.
  npm reports v0.2.20 as `latest`; registry integrity and shasum match, and
  registry, candidate and GitHub release tarballs are byte-identical. Fresh
  prefix registry CLI version/help, Chrome doctor, and the public three-row
  practice-table task passed; the task used one browser action, zero failed
  actions and zero model calls. Its MCP server reports version `0.2.20` and
  all four tools. The release asset passes its SHA-256 sidecar check. The Pages
  homepage serves v0.2.20 with HTTP 200, passes 320/390/768/1440 px overflow
  checks and has no browser console errors. Repository Actions are disabled;
  hosted run history remains at the earlier Pages build `edd0cab`. No live
  model request was made. The history pattern scan is not a complete security
  audit.
- Release `v0.2.19` isolates event-listener exceptions from local task execution.
  Its clean detached commit `cb10dbc57911ffb7acb296166f8948fd1e38fa8e` passed
  `FCU_BROWSER_CHANNEL=chrome npm run validate` with 178/178 tests in 327.53
  seconds, type checks, lab and package builds, history scan (283 worktree
  files, 285 historical paths and 1,579 blobs), and `npm audit` with zero
  vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`,
  npm `11.12.1`, and system Chrome `154.0.8037.57`. Its 135-file npm tarball
  is 1,171,465 bytes with SHA-256
  `c0ff0ac948551bf74c10898bd16e1a7bbaeb7928b54a680cd19c54a89cc8e349`; npm
  shasum is `27a423642b30fed5001eeac0e7d3ca9fe63a6746` and integrity is
  `sha512-pYEXzlbMJQvt3hXUIb1Qov39OvIJ/ZrIt1e9ga5QvEkwRiA3zsuBcADd5C0KoL5ugA5vBqwbrjpXCk0mFwLRTg==`.
  npm reports v0.2.19 as `latest`; registry integrity and shasum match, and the
  downloaded registry tarball is byte-identical to the candidate. Fresh-prefix
  candidate, registry and GitHub release-asset installs passed CLI version/help,
  Chrome doctor, and the three-row public table task with one browser action,
  zero failed actions and zero model calls; candidate and registry MCP servers
  report version `0.2.19` and all four tools. The release asset passes its SHA-256
  sidecar check. The Pages homepage serves v0.2.19 with HTTP 200, passes
  320/390/768/1440 px overflow checks, and has no browser console errors after
  Actions were disabled. The latest Actions run history remains the earlier
  Pages build at `edd0cab`. No live model request was made. The history pattern
  scan is not a complete security audit.
- Release `v0.2.18` fixes visible-descendant observation, blocked background
  text in dialog repair context, and open-shadow content in targeted repair
  fragments. Its clean detached commit
  `edd0cabd2116ca623225c38518bd4fd08228b4ac` passed
  `FCU_BROWSER_CHANNEL=chrome npm run validate` with 177/177 tests in 225.30
  seconds, type checks, lab and package builds, history scan (282 worktree
  files, 284 historical paths and 1,567 blobs), and `npm audit` with zero
  vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`,
  npm `11.12.1`, and system Chrome `154.0.8037.57`. Its 135-file npm tarball
  is 1,170,583 bytes with SHA-256
  `af5788917b48e8d7ec7a1987c7f930058addbb0e6de70dde366f863b16cae208`; npm
  shasum is `96d3efc993a846f8cb5b482179a40f724af50134` and integrity is
  `sha512-7I43GQl0WVl6e4gTPfuAHd0rWNKWXVbjPV+fuBAGrP4nUOHpx93vI5D6RovqTKL3XTx9D94fS5FoS01yPCrOxg==`.
  npm reports v0.2.18 as `latest`; its registry metadata matches, and the
  downloaded registry tarball is byte-identical to the candidate. Fresh-prefix
  candidate, registry and GitHub release-asset installs passed CLI version;
  candidate and registry installs also passed CLI help, and all three passed
  Chrome doctor and the three-row public table task with one browser action,
  zero failed actions and zero model calls; candidate and registry MCP servers
  report version `0.2.18` and all four tools. The release asset passes its SHA-256
  sidecar check. Pages built the release commit; the public homepage returns
  HTTP 200, displays `v0.2.18`, passes 320/390/768/1440 px overflow checks, and
  has no browser console errors. After Actions were disabled, a later `main`
  push made the updated support matrix available from the branch Pages source;
  GitHub's workflow history remains at the earlier Pages build. No live model
  request was made. The history pattern scan is not a complete security audit.
- Release `v0.2.17` includes accurate DOM byte metrics for nested open shadow
  roots and UTF-8 text. Its clean detached commit
  `25ebff9a9ecdcc22764c18a7873e4a442f57086f` passed
  `FCU_BROWSER_CHANNEL=chrome npm run validate` with 177/177 tests in 208.47
  seconds, type checks, lab and package builds, history scan (281 worktree
  files, 283 historical paths and 1,552 blobs), and `npm audit` with zero
  vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`,
  npm `11.12.1`, and system Chrome `154.0.8037.57`. Its 135-file npm tarball
  is 1,169,031 bytes with SHA-256
  `64e38d2432de4f79f623565580d1b6f1a39b39d7ed74205a5f177223b4caa8bd`; npm
  integrity is
  `sha512-WMtY7t8WxYkiV0QVUEoHBXqETre7kozqyRMub4VJ/PYSr4mcXUWAEWOXXPmH/vQFDFGck7VrNPpSF0QBt5tEPA==`.
  Candidate, registry and GitHub release tarballs match byte for byte. Fresh
  prefix CLI, doctor, three-row public table extraction, and MCP checks pass
  from all three copies. The table task used one browser action, zero failed
  actions and zero model calls. Pages built the release commit; the live
  homepage returns HTTP 200, displays `v0.2.17`, and passes 320/390/768/1440 px
  overflow checks with no console errors. No live model request was made. The
  history pattern scan is not a complete security audit.
- Release `v0.2.16` applies composed-tree visibility rules to assigned slot
  ancestry in observation, repair context, and text/table/link/record extraction.
  Its clean detached Git worktree passed `FCU_BROWSER_CHANNEL=chrome npm run validate`
  with 176/176 tests in 208.46 seconds, type checks, build, history scan (280
  worktree files, 282 historical paths and 1,540 blobs), and `npm audit` with
  zero vulnerabilities on 27 September 2026. Environment: macOS `26.6`, Apple
  Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. The
  npm tarball and GitHub release asset match the tested candidate byte for byte;
  fresh-prefix CLI, doctor, synthetic table, and MCP checks pass from the
  candidate, registry, and GitHub release asset. Pages displays the same
  version and passed 320/390/768/1440 px overflow and console checks. The
  pattern scan is not a complete security audit.
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
