# Security model

See the [threat model](docs/THREAT_MODEL.md) for assets, trust boundaries,
verified controls, residual risks and prioritized follow-up work.

Report vulnerabilities privately through GitHub's private vulnerability reporting
when enabled. Never include credentials or real browser profile data in an issue.

## Permission model

Normal mode requires a human to approve each website origin before its first
document request. The grant covers the requested task in that browser session,
including subsequent pages on the same origin. New origins need another grant.
Rejecting an initial grant leaves the target website unvisited. Cached workflows
and replay do not bypass site grants or sensitive-action policy.

With the default `sensitive` policy, explicit submit actions and controls marked
sensitive are gated separately; label and form heuristics catch some additional
high-impact actions. Detection cannot identify every ambiguously named or
adversarial control. Use `--confirmation always` in normal mode when every
action needs review. `--confirmation never` and Ultra mode skip action prompts.

**Ultra mode is explicit, off by default.** It skips website/action approvals and
allows external HTTP(S) destinations. It does not add shell access, arbitrary
JavaScript execution, arbitrary local-file access, or remove step/token budgets.
The model still cannot read environment variables or supply an arbitrary upload
path. User restrictions and final completion criteria still apply.

## Execution and network boundary

- Every model plan/action/repair passes strict Zod validation.
- Browser operations use a fixed Playwright action API; there is no eval/exec DSL.
- Page text has an escaped untrusted-content boundary and cannot replace the
  original goal. Local warnings flag common injection phrases.
- In normal mode, local vault aliases require a goal authorizing profile, details,
  credentials, resume/CV or local files. Vault values cannot appear in navigation
  URL templates. Uploads require an explicit `{{files.alias}}` defined locally.
- HTTP(S) only; URL credentials are rejected. `Agent` grants origins after
  approval, while the low-level exported `Browser` denies all network requests
  unless the caller supplies `allowedOrigins` or explicitly opts into
  `allowExternal`. Cross-origin resources and WebSockets follow that policy.
  A loopback-only Chromium DevTools Protocol connection attaches to each page
  before its first navigation and checks redirect hops; redirected document
  navigations use the same approval callback, and redirected subresources need
  an approved origin. A local Chrome 154 test confirms an unapproved fast popup
  redirect is stopped before the target server receives it, then succeeds after
  approval. A loopback-only proxy resolves hostnames and connects to the vetted
  numeric address for HTTP, HTTPS tunnels and WebSockets. In normal mode,
  private/reserved and IPv4-embedded private NAT64 answers are blocked, including
  when the hostname is allowlisted. Explicit IP destinations still use exact
  origin permissions. Ultra mode and the low-level `allowExternal` option bypass
  origin and private-address checks. A synthetic public-to-loopback DNS change
  test confirms the proxy rejects the connection before the target receives it;
  system Chrome `154.0.8037.57` also passes approved and denied plain WebSocket
  tests. A separate local test completes a TLS WebSocket handshake and frame
  through the proxy; Chrome-originated WSS, network-specific NAT64 prefixes,
  non-HTTP browser traffic and other browser builds remain unverified. The
  DevTools endpoint is available only on loopback while the browser runs; a
  process under the same OS account is outside this boundary. Service workers
  are blocked.
- Selector ambiguity is rejected for mutations; collection extraction may select
  several nodes. Browser dialogs are dismissed by default.
- A failed click/submit with an uncertain outcome requires human review before
  repair. Replay has no provider and stops on incompatible state.

Prompt isolation, origin restrictions and approval gates reduce injection risk;
they do not mathematically establish that a model always follows the goal, nor
that an allowed website is trustworthy. Websites still run their own JavaScript
inside Chromium and can access data intentionally entered on them. No CAPTCHA or
security bypass is implemented. Do not automate a site without authorization.

## Local data

The default data directory, its contents, backup and deletion steps are listed
in [Local data](docs/LOCAL_DATA.md).

`.env`, `.fcu`, profiles, session cookies, localStorage, downloads and SQLite traces
are ignored by Git. The local environment/profile/history files use mode 0600;
state/profile directories use mode 0700 on supported filesystems. Profile JSON
imports are schema-checked, reject symbolic-link files and replace saved data
atomically. This is local storage with file permissions, **not encrypted
storage**. Browser session data and extracted website content can be sensitive;
use an OS-protected account/disk.

Known profile/file values are redacted from prompts, event logs and traces and
resolve locally during actions. Secret-looking key strings are also redacted.
Records extraction omits password/payment field values. These filters do not
identify every possible secret in arbitrary website content. Do not publish local
traces, browser profiles or screenshots from a real account.

## Dashboard boundary

The UI binds only to `127.0.0.1`; Host checks prevent simple DNS rebinding. API
requests require a random HttpOnly SameSite=Strict session cookie. Mutations also
require the exact local Origin and an unguessable CSRF header. No CORS access is
enabled. CSP restricts assets/connections to the same local origin. API keys are
never exposed through the UI or API. A process/user already controlling the local
OS account is outside this boundary; the loopback UI is not a multi-user service.

## Verification evidence

`npm test` includes rejection-before-network, normal/Ultra permission separation,
strict code rejection, upload alias confinement, origin restrictions, duplicate
selectors, concurrent token reservations, redaction, local UI authorization/CSRF,
approval and zero-provider replay. Public benchmarks use only read-only sandbox
tasks or browser-only simulations on the project-owned lab. They never send a
message, purchase, create an account or modify a real user's account.
