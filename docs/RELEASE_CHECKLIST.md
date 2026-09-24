# Release checklist

Use this checklist for every npm or GitHub release. npm and GitHub publication are separate steps. A local package build is not a public release.

## Before packaging

- [x] Confirm release version `0.1.0` in `package.json`, `package-lock.json`, `CHANGELOG.md`, and the verified `v0.1.0` tag.
- [x] Review the versioned notes in `release-notes/`; remove draft-only wording for the published npm package.
- [x] Review the changelog against the release candidate; keep unverified providers, platforms, and workflows labelled accurately.
- [x] Build from a clean archive and record Node 25.9.0, npm 11.12.1, Playwright 1.63.0, and Chrome 154.0.8037.57.
- [x] Run `npm ci` and `npm run validate` on the supported platform. Full validation passed at `3fa3d6f`; later candidate commits change release documentation and changelog only.
- [x] Review `npm pack --dry-run --json`; runtime files, UI assets, license, security guidance, README-linked docs, and images are present; `.env` (except `.env.example`), profiles, traces, browser data, caches, tests, and user reports are absent.

## Verify the tarball

- [x] Create the tarball with `npm pack` and record its SHA-256 and npm integrity value.
- [x] Install the candidate tarball into a new temporary directory outside the checkout; reproduce the published tarball from the registry as well.
- [x] With no `LLM_API_KEY`, run `agent --help` and `FCU_BROWSER_CHANNEL=chrome agent doctor`.
- [x] Run the read-only practice workflow through the installed CLI and confirm its result, one browser action, and zero model calls.
- [x] Start the installed dashboard and complete its sandbox workflow; browser checks show no console errors or responsive overflow.
- [x] Check the published installation instructions against the tarball and registry state.

## Publish and verify npm

- [x] Confirm the package name and version were not already published; verify the registry owner and public access.
- [x] Publish only the reviewed version. No credentials or local user data are in the package.
- [x] Query the exact version from npm; record its tarball URL and integrity metadata in `ROADMAP.md` and `release-notes/0.1.0.md`.
- [x] Download and install the registry tarball in a fresh temporary directory; repeat CLI, doctor, and sandbox checks.
- [x] Update installation instructions after the registry install succeeded.

## GitHub release

- [x] Create a version tag that points to the validated commit; verify the tag resolves to that commit.
- [x] Publish reviewed notes from `release-notes/` and attach only artifacts that passed target-specific install checks.
- [x] Include a SHA-256 checksum for the npm package asset; platform requirements are stated in the release notes.
- [x] Download each release asset, verify the package checksum, install it in a fresh temporary directory, and rerun the CLI, doctor, and sandbox task smoke.
- [x] Verify the public release page, both assets, download links, and matching npm version.
