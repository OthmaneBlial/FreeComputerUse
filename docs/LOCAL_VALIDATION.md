# Local validation only

The project has no GitHub CI workflow. The former validation workflow is disabled
on GitHub, and its source definition has been removed at the owner's request.
Do not enable or dispatch GitHub validation runs.

## Full local gate

Use a clean checkout with Git history, Node `>=22.13.0`, npm, and an installed
Chrome or Edge browser. No provider key is needed. From the checkout root:

```bash
npm ci
FCU_BROWSER_CHANNEL=chrome npm run validate
```

`npm ci` installs package dependencies; it does not download a browser. The
installed-browser channel is best-effort because Playwright may not match that
browser build. Use `FCU_BROWSER_CHANNEL=msedge` if Edge is installed instead.

`npm run validate` runs these checks in order:

1. `lab:build` regenerates `docs/lab` and preserves the product landing page at
   `docs/index.html`.
2. `check` type-checks source, tests, fixtures, and scripts.
3. `test` runs the serial unit, provider-contract, CLI, and browser suite against
   local fixtures; it does not make live model-provider calls.
4. `build` compiles the package and copies its UI assets.
5. `security` scans tracked worktree files and unique blobs and paths reachable
   from Git refs for known credential patterns and private-state paths. This is
   a pattern scan, not a complete security audit.
6. `npm audit --omit=dev --audit-level=high` checks production dependencies and
   needs registry access.

A passing run exits with code `0`, all tests passing, a `Security scan passed`
summary, and no high-severity production dependency findings. Test totals and
scan counts vary with repository contents. Keep the terminal output with the
commit hash and environment when recording a validation result; never record API
keys, cookies, or user data.

On 24 September 2026, a clean checkout completed `npm ci --offline
--no-audit --no-fund` without a browser download, then passed the complete gate
on macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57` at commit
`1ca1006`: 101/101 tests in 151.35 seconds, 157.19 seconds total, build passed,
the scan checked 248 worktree files plus 250 unique historical paths and 948
unique blobs, and npm audit reported zero vulnerabilities. The latest full
validation at commit `d978b06` passed 102/102 tests, build, the security scan
(255 worktree files, 257 historical paths, 980 blobs) and npm audit with zero
vulnerabilities, using an empty `LLM_API_KEY`. The latest run on `main` at
commit `aa9500d` passed 106/106 tests in 190.06 seconds, build, security scan
(260 worktree files, 262 historical paths, 1,014 blobs) and npm audit with zero
vulnerabilities. The latest run on `main` at commit `3fa3d6f` passed 106/106
tests in 161.24 seconds, build, security scan (260 worktree files, 262
historical paths, 1,020 blobs) and npm audit with zero vulnerabilities. Both
runs used macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`; the
test gate made no live provider calls and triggered no GitHub Actions workflow.
An earlier run had been stopped after 2
minutes 30 seconds in the former per-file history scan; the batched object scan
and deleted-secret regression test resolved that bottleneck.

The latest full validation on `main`, commit `1bfb8f7` (24 September 2026),
passed `FCU_BROWSER_CHANNEL=chrome npm run validate`: 106/106 tests in 158.82
seconds, build, security scan (263 worktree files, 265 historical paths, 1,036
unique historical blobs; no recognized credentials or private-state paths),
and `npm audit` with zero vulnerabilities. Environment: macOS `26.6`, Node
`25.9.0`, and system Chrome `154.0.8037.57`. The tests use local fixtures and
provider contracts; no live model-provider request was made. GitHub Actions
remained untouched.

The published npm tarball was fetched with `npm pack free-computer-use@0.1.0`
and installed into a new temporary npm prefix. Its SHA-256 matched the
published checksum. With `LLM_API_KEY` empty and an isolated `FCU_DATA_DIR`,
`agent --version`, `agent --help`, and `agent doctor` passed; the doctor launched
system Chrome. `agent run 'Extract the table'
https://othmaneblial.github.io/FreeComputerUse/lab/reports.html --ultra`
completed the public synthetic practice task with the three expected rows, one
browser action, and zero model calls. This CLI smoke used explicit Ultra mode;
the separate final dashboard video demonstrates normal site approval.

One earlier clean run failed 100/101 on a transient dashboard `502`; the first
assertion reported only Chrome’s generic console message. The test now asserts
captured HTTP 5xx paths before generic console errors. A focused rerun and two
subsequent complete suites passed, but the original failure did not recur, so
its source remains unknown. See the [support matrix](SUPPORT_MATRIX.md) for
platform limits.

Live-provider benchmarks are separate, opt-in commands and may spend API
tokens: `npm run benchmark -- --live`, `npm run benchmark:public`,
`npm run benchmark:complex -- --live`, and `npm run benchmark:real`. The
`security:wss` smoke makes a network request to Postman Echo but uses no model
key. None of these commands is part of `npm run validate`.

`FCU_BROWSER_CHANNEL=chrome npm run security:wss` is an optional live network
check. It uses installed Chrome to connect to Postman Echo over WSS, relies on
Chrome’s default TLS validation, and sends one fixed synthetic string. It does not
use a model key and is excluded from `npm run validate`; endpoint availability
can change.

`FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` is a local no-provider first-run
smoke. It checks visible control names, text contrast (4.5:1 for normal text and 3:1
for large text), approval before site navigation, a sandbox extraction and
result, browser console output, and dashboard widths 320, 390, 768 and 1600 px.
It does not validate a live model provider or screen-reader behavior.

GitHub Pages is the existing host for the public static lab. Hosting publication
is separate from the removed CI checks.
