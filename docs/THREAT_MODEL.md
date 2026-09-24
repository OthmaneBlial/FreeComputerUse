# Threat model

**Reviewed 24 September 2026.** This describes controls visible in this checkout;
it is not a penetration-test report or a guarantee that a task is safe.

## Scope and assumptions

FreeComputerUse runs a Playwright browser and local dashboard under the current
OS account. The user chooses the starting website, provider, profile values,
downloads and whether to enable Ultra mode. The project does not defend against
malware or a person who already controls that OS account. It does not bypass
CAPTCHAs or website access controls.

The main assets are API credentials, provider CLI sessions, browser cookies and
local storage, profile values and file paths, downloaded files, SQLite run
history, extracted website content, and the integrity of actions and reported
results.

## Trust boundaries

1. **Web page to planner.** Page text is untrusted input. The provider returns a
   typed plan; Zod validation admits only the fixed action schema. No action
   executes arbitrary JavaScript or a shell command.
2. **Application to website.** `Agent` asks before its first document request to
   an origin. Playwright checks HTTP(S) requests, frames and WebSockets against
   the exact origin allowlist. A loopback-only Chromium DevTools Protocol
   connection attaches to each page target before navigation and checks
   redirect hops. Redirected documents ask for approval; redirected
   subresources require an approved origin. Non-HTTP(S) protocols and URLs with
   embedded user credentials are rejected before an agent trace is stored. A
   local Chrome 154 test verifies that a fast popup redirect is blocked before
   the unapproved target receives a request. Other browser builds are not yet
   verified.
   The exported low-level `Browser` denies network requests unless its caller
   provides an allowlist or explicitly sets `allowExternal`; Ultra mode opts into
   that unrestricted HTTP(S) policy and skips the private-address check too. In
   normal mode, a loopback-only proxy resolves named destinations and connects
   to the resulting numeric address for HTTP, HTTPS tunnels and WebSockets.
   Private/reserved answers and IPv4-embedded private NAT64 addresses are
   blocked. Explicit IP literals still require an exact allowlisted origin.
   Network-specific NAT64 prefixes and non-HTTP browser traffic are outside this
   address check.
3. **Planner to action.** By default, sensitive actions use a separate human
   confirmation path. The executor checks that an approved target remains
   connected and unchanged before the effect. The original goal's completion
   criteria cannot be weakened by a repair plan. `--confirmation never` opts
   out; Ultra mode also skips these prompts.
4. **Local dashboard to server.** The server binds to `127.0.0.1`; it checks the
   Host header, a random session cookie, exact Origin and a CSRF token on
   mutations. CSP limits scripts and connections to the local app origin.
5. **Application to local files.** Profile values and file paths are stored in
   the local vault. Upload actions require an explicit file alias. Downloads are
   resolved and confined to the configured download directory before serving.
6. **Application to provider.** Browser execution is local, but selected page
   content and task context are sent to the configured API or subscription CLI
   for planning. The provider can retain or process that content under its own
   terms. Provider choice is a data-sharing choice, not an offline mode.

## Threat register

| Threat | Current controls in this checkout | Evidence | Residual risk and follow-up |
| --- | --- | --- | --- |
| A page uses prompt injection to redirect the task, reveal profile data or request an unsafe action. | Page content is marked untrusted; action plans use a fixed schema; profile values are resolved locally; default sensitive-action checks require confirmation; completion checks are independently verified. | Provider boundary tests; `tests/security.test.ts` covers approval, post-approval target replacement and trusted completion criteria. | A model can still misunderstand a task and page content can deceive a person. Avoid Ultra mode; in normal mode use `--confirmation always` for high-impact work. |
| A page, redirect, frame, fetch or WebSocket reaches an unapproved origin. | Playwright routing checks HTTP requests; a loopback-only Chromium DevTools Protocol connection intercepts page-target requests and redirect hops. A second loopback proxy applies origin policy to HTTP, HTTPS tunnels and WebSockets, resolves hostnames and dials the vetted numeric address. Normal mode approves document origins; redirected subresources need an approved origin. Private/reserved DNS answers and private IPv4 embedded in the NAT64 prefix discovered through `ipv4only.arpa` are blocked. The persistent profile sets `webrtc.ip_handling_policy=disable_non_proxied_udp`. Ultra/`allowExternal` opts out of origin and private-address checks. Unsupported protocols and embedded URL credentials are rejected at the dashboard and agent boundaries before a trace is stored. IPv6 literals are canonicalized for allowlist comparison while preserving exact ports. | `tests/security.test.ts` covers credentialed initial URLs, simulated public-to-loopback DNS rebinding before HTTP and TLS-tunnel connection, private IPv4/IPv6 DNS rejection before target receipt, synthetic DNS64 private/public IPv4 classification for each RFC 6052 prefix length, normal/Ultra separation, exact-port IPv6 origin matching, cross-origin fetch and plain WebSocket denial before server receipt, approved WebSocket forwarding, browser-originated approved WSS frame delivery and unapproved WSS denial before the target receives TCP, cleartext SSH-style CONNECT denial before dialing, WebRTC STUN UDP blocked before a local receiver, preservation of an unrelated browser preference, frame-grant cancellation, main-page redirect rejection/approval, default-deny behavior for a bare `Browser`, and popup redirect denial/approval. The local WSS fixture ignores errors from its generated certificate. Separately, `FCU_BROWSER_CHANNEL=chrome npm run security:wss` passed on 24 September: Chrome used default TLS validation with Postman Echo and received a fixed synthetic payload. This validates one endpoint/runtime only. The dashboard test confirms credentialed starting URLs and allowlist entries are rejected before an agent is created. Browser cases pass against installed Chrome `154.0.8037.57`. | Live NAT64 discovery is unverified: the current system resolver returned only IPv4 A records for `ipv4only.arpa`. Other non-HTTP traffic beyond the WebRTC STUN fixture and other browser builds remain unverified. Sites that need unproxied WebRTC UDP may fail. Explicit IP literals in normal mode still rely on exact origin approval. HTTP is also permitted. |
| A click or form submission causes a purchase, message, deletion or other irreversible change. | Under the default `sensitive` policy, explicit `sensitive` flags and submit actions are gated; common risky labels and form semantics are heuristically detected; the approved target is fingerprinted; uncertain effects stop automated repair. | `sensitiveReason` and executor tests cover changed targets and approval/rejection behavior. | Text heuristics cannot recognize every deceptive or ambiguous control. Prefer normal mode with `--confirmation always`; visually review the action before approval. |
| A remote site or another browser origin takes over the local dashboard. | Loopback binding, exact Host and Origin checks, random HttpOnly SameSite cookie, CSRF header, no CORS, restrictive CSP and bounded JSON request bodies. | Local UI tests cover missing session, cross-origin mutation rejection and successful same-origin control. | A process running as the same OS user can inspect or control local state. The dashboard is not a multi-user service; do not expose it through a tunnel or reverse proxy. |
| A profile path, upload alias or download receipt escapes its allowed directory. | Vault schemas reject prototype keys and unknown top-level settings; profile imports reject symlink files and save through a same-directory temporary file plus rename; upload values must be explicit `files.*` aliases; downloaded paths are checked with `realpath` and a directory boundary before serving. On macOS, profile/download files use POSIX `0600` and their directories use `0700`. | `tests/profile.test.ts` covers invalid import preservation, failed filesystem replacement preserving old bytes, symlink refusal and POSIX modes; `tests/actions.test.ts` covers upload alias confinement, download symlink rejection and download modes. | Files are not encrypted and a user can intentionally choose sensitive files. Windows/Linux permission behavior remains unverified. Keep profiles and downloads in an OS-protected account. |
| Secrets or session data appear in provider prompts, traces, errors or screenshots. | Known vault values and `sk-`-shaped strings are redacted; environment credentials are stripped before subscription CLIs; traces and profiles are owner-only on supported filesystems; password/payment values are omitted from record extraction. | Provider key-error tests, CLI environment tests and security tests. | Redaction patterns cannot find every secret. Provider API requests intentionally contain task/page context. Local browser profiles, backups and history are plaintext; inspect before sharing and follow retention work in Phase 2.3. |
| A replay repeats an obsolete action or falsely reports success. | Replay has no model, checks current page/workflow compatibility, retains normal permission gates and verifies independent completion criteria. The dashboard reuses its browser context across tasks but starts each task in a fresh tab. | Workflow and completion-oracle tests in `tests/agent.test.ts`, `tests/security.test.ts`, `tests/lab.test.ts` and `tests/ui.test.ts`; the serial suite passed 100/100 on system Chrome `154.0.8037.57` on 24 September 2026. | Similar page structure does not prove identical intent. Review learned workflows and final results. Standalone relaunch of Chrome with the same profile and bundled Playwright Chromium remain unverified. |
| A dependency, CLI or release artifact changes behavior or contains a vulnerability. | Lockfile, local production `npm audit`, pattern-based tracked-secret scan and explicit support matrix. GitHub Actions is intentionally disabled by owner instruction. | Local checks recorded in `docs/SUPPORT_MATRIX.md`; no remote workflow is claimed. | Scanners are incomplete; manual releases need repeatable local gates and artifact verification. Address in Phase 4.3 and Phase 6. |

## Response guidance

- Stop a run when the requested action, domain or expected result is unclear.
- In normal mode, use `--confirmation always` for workflows that can change
  accounts, publish, submit, transfer, delete, purchase or send messages.
- Do not put real credentials, private account content or real browser profiles
  into issue reports, screenshots or benchmark fixtures.
- Report a suspected vulnerability privately through GitHub's private
  vulnerability reporting when the feature is available.
- Treat any claim of local execution as distinct from local-only model
  processing: API mode sends context to the selected provider.

## Open security work

- Phase 2.2 boundary tests passed 39/39 on the verified target: macOS `26.6`,
  Node `25.9.0` and system Chrome `154.0.8037.57`; `npm run check` passed.
  The checked cases include redirects, DNS rebinding, private IPv4/IPv6,
  WebSockets, a rejected cleartext CONNECT tunnel, WebRTC STUN blocking,
  download confinement and profile symlink rejection. A separate trusted-TLS
  WSS smoke passed against one Postman Echo endpoint. Actual NAT64 discovery,
  other browser/OS builds, bundled Playwright Chromium and non-HTTP traffic
  beyond the tested WSS/STUN cases remain unverified. Do not infer compatibility
  for those targets from the local fixtures.
- Phase 2.3: document inspect/export/delete steps, verify retention and cleanup
  behavior, audit permissions for all persisted data, and keep plaintext storage
  clearly disclosed.
- The 24 September serial regression suite covers cancellation, synthetic
  provider timeout, malformed responses, interrupted profile writes, rejected
  incompatible replays, last-tab closure and all eight lab workflow replays.
  It passed 100/100 on system Chrome `154.0.8037.57`; this does not establish
  support for other OS/browser combinations or standalone same-profile Chrome
  relaunches.
