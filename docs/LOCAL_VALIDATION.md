# Local validation only

The project has no GitHub CI workflow. The former validation workflow is disabled
on GitHub, and its source definition has been removed at the owner's request.
Do not enable or dispatch GitHub validation runs.

Run the checks locally:

```bash
npm run validate
```

This rebuilds the static lab under `docs/lab` while preserving the product landing page at `docs/index.html`, checks TypeScript, runs Chromium tests, builds the package, scans tracked files/history for recognizable secrets, and audits production dependencies.
To avoid a Playwright browser download, set `FCU_BROWSER_CHANNEL=chrome` (or
`msedge`) when that browser is already installed. This is best-effort: Playwright
warns that non-bundled browsers may be incompatible with the installed Playwright
version. On 24 September 2026, the full suite passed serially with system Chrome:
`FCU_BROWSER_CHANNEL=chrome npm test` (97/97). The package test script pins
concurrency to one. `FCU_BROWSER_CHANNEL=chrome npm run validate` passed lab
generation, type checks, all tests and package build, then was stopped after
2 minutes 30 seconds in the full Git-history security scan. The checkout-only
scan passed for 245 tracked file versions; `npm audit --omit=dev
--audit-level=high` separately reported zero vulnerabilities. The history scan
and full umbrella command remain unverified; see the
[support matrix](SUPPORT_MATRIX.md).
Browser smoke tests and live-provider benchmarks are also run locally and are
separate opt-in commands because they can spend API tokens.

`FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` is a local no-provider first-run
smoke. It checks visible control names, text contrast (4.5:1 for normal text and 3:1
for large text), approval before site navigation, a sandbox extraction and
result, browser console output, and dashboard widths 320, 390, 768 and 1600 px.
It does not validate a live model provider or screen-reader behavior.

GitHub Pages is the existing host for the public static lab. Hosting publication
is separate from the removed CI checks.
