# Threat model

**Reviewed 23 September 2026.** This describes controls visible in this checkout;
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
2. **Application to website.** Normal mode asks before its first document
   request to an origin. Subsequent HTTP(S) requests, redirects, frames and
   WebSockets are checked against the exact origin allowlist. Additional origins
   need approval. Ultra mode deliberately bypasses those prompts and permits
   external HTTP(S) requests.
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
| A page, redirect, frame, fetch or WebSocket reaches an unapproved origin. | Browser routing checks every HTTP request and WebSocket against allowed origins; normal mode grants the starting origin only after approval; unsupported protocols and embedded URL credentials are rejected. | Cross-origin fetch and frame-grant cancellation tests in `tests/security.test.ts`. | DNS answers are not pinned to an IP, so DNS rebinding to a private address is not proven blocked. HTTP is also permitted. Test and mitigate these boundaries in Phase 2.2; do not approve untrusted origins. |
| A click or form submission causes a purchase, message, deletion or other irreversible change. | Under the default `sensitive` policy, explicit `sensitive` flags and submit actions are gated; common risky labels and form semantics are heuristically detected; the approved target is fingerprinted; uncertain effects stop automated repair. | `sensitiveReason` and executor tests cover changed targets and approval/rejection behavior. | Text heuristics cannot recognize every deceptive or ambiguous control. Prefer normal mode with `--confirmation always`; visually review the action before approval. |
| A remote site or another browser origin takes over the local dashboard. | Loopback binding, exact Host and Origin checks, random HttpOnly SameSite cookie, CSRF header, no CORS, restrictive CSP and bounded JSON request bodies. | Local UI tests cover missing session, cross-origin mutation rejection and successful same-origin control. | A process running as the same OS user can inspect or control local state. The dashboard is not a multi-user service; do not expose it through a tunnel or reverse proxy. |
| A profile path, upload alias or download receipt escapes its allowed directory. | Vault schemas reject prototype keys; upload values must be explicit `files.*` aliases; downloaded paths are checked with `realpath` and a directory boundary before serving. | `tests/actions.test.ts` covers upload alias confinement; `tests/results.test.ts` covers symlinked download rejection. | Files are not encrypted and a user can intentionally choose sensitive files. Profile saves currently overwrite the JSON file directly, so interruption can leave it invalid; make replacement crash-safe in Phase 2.3. Keep profiles and downloads in an OS-protected account. |
| Secrets or session data appear in provider prompts, traces, errors or screenshots. | Known vault values and `sk-`-shaped strings are redacted; environment credentials are stripped before subscription CLIs; traces and profiles are owner-only on supported filesystems; password/payment values are omitted from record extraction. | Provider key-error tests, CLI environment tests and security tests. | Redaction patterns cannot find every secret. Provider API requests intentionally contain task/page context. Local browser profiles, backups and history are plaintext; inspect before sharing and follow retention work in Phase 2.3. |
| A replay repeats an obsolete action or falsely reports success. | Replay has no model, checks current page/workflow compatibility, retains normal permission gates and verifies independent completion criteria. | Workflow and completion-oracle tests in `tests/agent.test.ts` and `tests/security.test.ts`. | Similar page structure does not prove identical intent. Review learned workflows and final results; Phase 4.1 adds more interrupted/incompatible-state cases. |
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

- Phase 2.2: test DNS resolution changes, private IPv4/IPv6 targets, redirects,
  WebSockets, symlinks and platform-specific path handling; implement only
  mitigations that close a reproduced boundary without breaking authorized
  local fixtures.
- Phase 2.3: make profile replacement crash-safe, document inspect/export/delete
  steps, verify retention behavior, and keep plaintext storage clearly disclosed.
- Phase 4.1: extend cancellation, timeout, malformed-state and workflow
  compatibility oracles before calling the security surface stable.
