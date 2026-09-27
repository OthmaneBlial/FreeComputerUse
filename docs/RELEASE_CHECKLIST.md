# Release checklist

Use this for npm and GitHub releases. Publishing to npm, creating a GitHub
release, and deploying Pages are separate checks.

## Candidate

- Confirm the version is absent from npm, Git tags, and GitHub releases.
- Keep `package.json`, lockfile, changelog, README, install guides, site copy,
  and release notes on the same version.
- From a clean archive of the intended commit, install dependencies and run
  `FCU_BROWSER_CHANNEL=chrome npm run validate`. Record runtime versions and
  gate results without secrets or user data.
- Review `npm pack --dry-run --json`; ensure the package contains required
  runtime files and excludes tests, caches, `.env` data, profiles, traces and
  local user reports.
- Pack the candidate. Record its SHA-256 and npm integrity, then install that
  exact tarball into a fresh prefix.
- Verify `agent --version`, `agent --help`, Chrome `agent doctor`, and the
  read-only public practice-table task with no model key. For MCP releases,
  connect over `stdio`, check the server version and list its tools.

## npm

- Publish only the reviewed version after candidate checks pass.
- Query that exact version from npm. Download the registry tarball and compare
  it byte for byte with the tested candidate; confirm its integrity metadata.
- Repeat the fresh-prefix CLI, doctor, task, and applicable MCP checks against
  the downloaded registry tarball.

## GitHub release

- Create an annotated version tag at the validated release commit and confirm
  it resolves to that commit.
- Publish the reviewed release notes and attach the tested npm tarball with a
  SHA-256 checksum file.
- Download both release assets; verify the checksum and byte match, then repeat
  fresh-prefix CLI, doctor, task, and applicable MCP checks from the asset.
- Verify the public release page, version, assets, and npm link.

## GitHub Pages

- Verify the latest Pages build corresponds to the intended `main` commit and
  completes successfully.
- Check the live homepage returns HTTP 200, points to the release, and has no
  horizontal overflow at 320, 390, 768 and 1440 pixels or browser console errors.
