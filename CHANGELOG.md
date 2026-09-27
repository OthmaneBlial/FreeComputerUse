# Changelog

## Unreleased

### Fixed

- Report the package version in the MCP server handshake so clients see the
  version they installed.

## 0.2.9 - 2026-09-27

### Fixed

- Give repeated state/action loops one bounded provider repair chance before
  stopping, without retrying the same loop indefinitely.

### Performance

- Check independent task completion conditions concurrently.

## 0.2.8 - 2026-09-27

### Fixed

- Keep compressed table summaries valid JSON, mark omitted rows and report
  truncation instead of presenting partial tables as complete.

## 0.2.7 - 2026-09-27

### Fixed

- Bound page title, URL, heading and warning summaries so oversized page
  metadata cannot consume planner context before interactive controls.

## 0.2.6 - 2026-09-27

### Fixed

- Keep unchanged controls and page data in follow-up planner context when a
  compact page diff would omit them. Use diffs only when they contain the full
  current snapshot needed by the next stateless provider call.

## 0.2.5 - 2026-09-27

### Changed

- Planner responses no longer repeat the task goal. The runtime keeps the
  validated original goal, preserving the 4,000-character limit while leaving
  more output budget for steps, actions and checks.

## 0.2.4 - 2026-09-27

### Fixed

- Enforce the shared 4,000-character task-goal limit in the agent API before
  browser startup or trace creation, matching CLI, dashboard and MCP behavior.

## 0.2.3 - 2026-09-27

### Fixed

- Accept planner goals up to the same 4,000-character limit as the dashboard
  and MCP task APIs.

## 0.2.2 - 2026-09-26

### Fixed

- Keep the planner page context within its configured character budget, including
  recent tabs and extracted evidence from earlier pages.
- Bound retained extraction previews and serialize only compact slices of
  structured results.

## 0.2.1 - 2026-09-26

### Changed

- “First/top N links” tasks now accept any available count up to the requested
  limit instead of failing when the page contains fewer links.
- The local HTTP proxy retries one bodyless GET/HEAD after a reused-socket
  reset; requests that could cause side effects are never replayed.
- The HTTP proxy drops requests canceled during DNS lookup and aborts in-flight
  upstream HTTP requests when the browser disconnects.

### Security

- Redact recognized GitHub, GitLab and Slack token prefixes from prompts, traces
  and history output.

## 0.2.0 - 2026-09-26

### Added

- Deterministic, provider-free extraction of visible page text and links.
- Bounded extraction of the first 1–1000 visible links, with exact-count
  verification.

### Changed

- Zero-timeout selector checks return immediately instead of waiting through a
  polling interval.

### Fixed

- Element verification evaluates all matching elements, avoiding a false
  failure when a later match satisfies the condition.

## 0.1.0

### Added

- Local Playwright browser workspace with explicit origin permissions, sensitive
  action confirmation, result checks and compatible workflow replay.
- API-key provider routes and local Codex / Claude Code subscription CLI routes.
- Local dashboard, command-line diagnostics, synthetic practice lab and public
  evidence reports.
- Support, provider, security, local-data and reproducible validation guides.

### Security and privacy

- Browser profiles, traces, workflows and downloads stay in local storage, which
  is not encrypted and has no automatic expiry.
- Provider support and tested platform limits are listed in
  [the support matrix](docs/SUPPORT_MATRIX.md).
