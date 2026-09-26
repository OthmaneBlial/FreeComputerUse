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

## Recent local gate results

Commit `ea1ebae` passed `FCU_BROWSER_CHANNEL=chrome npm run validate` on 26
September 2026: 134/134 tests in 180.99 seconds, type-check and build, security
scan (264 worktree files, 266 historical paths, 1,183 unique historical blobs;
no recognized credentials or private-state paths), and npm audit with zero
vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system Chrome
`154.0.8037.57`. No live model-provider request was made.

The v0.2.0 release candidate, based on main commit `26fc0c6` with the version,
README, changelog and homepage updates, passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 130/130
tests in 260.51 seconds, type-check and build, security scan (263 worktree
files, 265 historical paths, 1,145 unique historical blobs; no recognized
credentials or private-state paths), and npm audit with zero vulnerabilities.
Environment: macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`.
Tests used local fixtures and provider contracts; no live model-provider request
was made. GitHub Actions remained untouched.

The working tree based on `main` commit `d4470c8` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 130/130
tests in 189.74 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,142 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `79229c5` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 130/130
tests in 193.59 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,138 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `1700fcd` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 129/129
tests in 207.75 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,133 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `58843bc` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 128/128
tests in 198.61 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,130 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `8094c49` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 127/127
tests in 220.32 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,127 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `59a192d` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 127/127
tests in 201.58 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,124 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `9ec470c` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 126/126
tests in 207.97 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,121 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `8bc55af` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 125/125
tests in 177.40 seconds, type-check and build, security scan (263 worktree files,
265 historical paths, 1,118 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The working tree based on `main` commit `7263431` passed the same gate on
26 September 2026: 124/124 tests in 216.20 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,114 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

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

The latest full validation on `main`, commit `7c1da12` (26 September 2026),
passed `FCU_BROWSER_CHANNEL=chrome npm run validate`: 109/109 tests in 202.84
seconds, type-check and build, security scan (263 worktree files, 265 historical
paths, 1,046 unique historical blobs; no recognized credentials or private-state
paths), and `npm audit` with zero vulnerabilities. Environment: macOS `26.6`,
Node `25.9.0`, and system Chrome `154.0.8037.57`. The tests use local fixtures
and provider contracts; no live model-provider request was made. GitHub Actions
remained untouched.

The working tree based on `main` commit `4b489ba` passed the same gate on
26 September 2026: 117/117 tests in 207.39 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,067 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `6985896` passed the same gate on
26 September 2026: 117/117 tests in 213.84 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,070 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `bf200cf` passed the same gate on
26 September 2026: 117/117 tests in 223.48 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,073 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `568e47d` passed the same gate on
26 September 2026: 117/117 tests in 181.53 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,076 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `4551869` passed the same gate on
26 September 2026: 118/118 tests in 165.19 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,078 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `038eb7a` passed the same gate on
26 September 2026: 120/120 tests in 196.98 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,082 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `22f82eb` passed the same gate on
26 September 2026: 121/121 tests in 169.93 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,089 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `d4f35a4` passed the same gate on
26 September 2026: 121/121 tests in 182.45 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,093 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `7c44c38` passed the same gate on
26 September 2026: 121/121 tests in 171.18 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,096 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `c8eb331` passed the same gate on
26 September 2026: 121/121 tests in 167.40 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,099 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `6db2e16` passed the same gate on
26 September 2026: 122/122 tests in 170.12 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,102 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `f6bacdf` passed the same gate on
26 September 2026: 123/123 tests in 187.58 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,105 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `e68ffe3` passed the same gate on
26 September 2026: 123/123 tests in 202.84 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,108 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `4a67ae7` passed the same gate on
26 September 2026: 123/123 tests in 196.61 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,111 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

On 26 September 2026, the working tree based on `main` commit `50e7a0e` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate`: 112/112 tests in 239.66 seconds,
type-check and build, security scan (263 worktree files, 265 historical paths,
1,047 unique historical blobs; no recognized credentials or private-state paths),
and `npm audit` with zero vulnerabilities. Environment: macOS `26.6`, Node
`25.9.0`, and system Chrome `154.0.8037.57`. Tests used local fixtures and
provider contracts; no live model-provider request was made. GitHub Actions
remained untouched.

The working tree based on `main` commit `4fb4fa1` passed the same gate on
26 September 2026: 113/113 tests in 230.32 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,054 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `1daf581` passed the gate on
26 September 2026: 114/114 tests in 184.96 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,058 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `facee50` passed the gate on
26 September 2026: 115/115 tests in 210.84 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,061 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree based on `main` commit `96830ab` passed the gate on
26 September 2026: 116/116 tests in 221.44 seconds, type-check and build,
security scan (263 worktree files, 265 historical paths, 1,064 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. Tests used local fixtures and provider contracts; no live
model-provider request was made. GitHub Actions remained untouched.

The working tree later committed as `03c8ea7` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 26 September 2026: 133/133
tests in 180.21 seconds, type-check and build, security scan (264 worktree files,
266 historical paths, 1,175 unique historical blobs; no recognized credentials
or private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Node `25.9.0`, and system Chrome `154.0.8037.57`. Tests used local
fixtures and provider contracts; no live model-provider request was made.
GitHub Actions remained untouched.

The same working tree passed the gate on Node `22.13.0`: 133/133 tests in
177.86 seconds, type-check and build, the same history scan and npm audit with
zero vulnerabilities. Environment: macOS `26.6`/Apple Silicon and system Chrome
`154.0.8037.57`. Node emitted its expected experimental `node:sqlite` warning.
GitHub Actions remained untouched.

The published npm tarball was fetched with `npm pack free-computer-use@0.1.0`
and installed into a new temporary npm prefix. Its SHA-256 matched the
published checksum. With `LLM_API_KEY` empty and an isolated `FCU_DATA_DIR`,
`agent --version`, `agent --help`, and `agent doctor` passed; the doctor launched
system Chrome. `agent run 'Extract the table'
https://othmaneblial.github.io/FreeComputerUse/lab/reports.html --ultra`
completed the public synthetic practice task with the three expected rows, one
browser action, and zero model calls. This CLI smoke used explicit Ultra mode;
the separate final dashboard video demonstrates normal site approval.

An earlier dashboard run received `400 /api/preview` after an optional browser
screenshot failed. Preview capture failures now return `204` with no frame, and
a regression test injects a capture failure. The dashboard test records all
unexpected HTTP 4xx and 5xx paths before reporting generic browser console
errors. It treats a `502 /api/preview` during background polling as transient,
then requires a later preview fetch to return `200`; the UI retries preview
fetches automatically. The local proxy's underlying connection error is not
exposed. See the [support matrix](SUPPORT_MATRIX.md) for platform limits.

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
