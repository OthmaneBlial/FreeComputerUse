# Release checklist

Use this checklist for every npm or GitHub release. npm and GitHub publication are separate steps. A local package build is not a public release.

## Before packaging

- [ ] Confirm the release version in `package.json`, `package-lock.json`, `CHANGELOG.md`, and the proposed Git tag.
- [ ] Review the versioned notes in `release-notes/`; remove any draft-only wording only after each external publication gate passes.
- [ ] Review the changelog against the exact commit; keep unverified providers, platforms, and workflows labelled accurately.
- [ ] Start from a clean checkout of that commit and record Node, npm, Playwright, and system browser versions.
- [ ] Run `npm ci` and `npm run validate` on the supported platform.
- [ ] Review `npm pack --dry-run --json`; confirm runtime files, UI assets, license, security guidance, README-linked docs, and images are present. Confirm `.env`, profiles, traces, browser data, caches, and user reports are absent.

## Verify the tarball

- [ ] Create the tarball with `npm pack` and record its SHA-256 and npm integrity value.
- [ ] Install that tarball into a new temporary directory, outside the checkout.
- [ ] With no `LLM_API_KEY`, run `agent --help` and `FCU_BROWSER_CHANNEL=chrome agent doctor`.
- [ ] Run the documented read-only practice workflow through the installed CLI and confirm its result, one browser action, and zero model calls.
- [ ] Start the installed dashboard and complete its sandbox workflow; check the browser console and responsive layout.
- [ ] Check the published installation instructions against the tarball and registry state. Do not present an unpublished package as installable from npm.

## Publish and verify npm

- [ ] Confirm the package name and version are not already published; check the registry owner and intended access.
- [ ] Publish only the reviewed version from the clean release commit. Do not publish credentials or local user data.
- [ ] Query the exact version from npm; record its tarball URL and integrity metadata.
- [ ] Download and install the registry tarball in a fresh temporary directory; repeat the CLI, doctor, and sandbox checks.
- [ ] Update installation instructions only after the registry install succeeds.

## GitHub release

- [ ] Create a version tag that points to the validated commit; verify the tag resolves to that commit.
- [ ] Publish reviewed notes from `release-notes/` and attach only artifacts that passed the target-specific install checks.
- [ ] Include SHA-256 checksums and platform requirements for every downloadable asset.
- [ ] Download each release asset again, verify its checksum, and repeat its installation smoke test.
- [ ] Verify the public release page, assets, links, and matching npm version before describing the release as complete.
