# Changelog

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
