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

The published `v0.2.22` release commit
`96a7084410e1cccf3738a6d42c8d7a80213c30e0` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` from a clean detached worktree on
27 September 2026: 186/186 tests in 314.80 seconds, TypeScript checks, lab and
package builds, history scan (286 worktree files, 288 historical paths, 1,654
blobs), and `npm audit` with zero vulnerabilities. Environment: macOS `26.6`,
Apple Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`.
The exact tested package was published to npm and attached to the matching
GitHub release. Fresh-prefix candidate, registry and release-asset installs
passed CLI version/help, Chrome doctor, a public table task and MCP `stdio`
discovery. Package checksums, install details, and live Pages checks are in the
[v0.2.22 release notes](../release-notes/0.2.22.md). No live model-provider
request was made. The history pattern scan is not a complete security audit.

The post-release `main` commit `05705df` tightens learned workflow matching:
cache fingerprints include control destinations, form/region identity, select
labels and option values while ignoring transient checked/disabled state. Its
full local gate passed 188/188 tests in 281.85 seconds, type checks, lab/package
builds, history scan (286 worktree files, 288 historical paths, 1,658 blobs),
and `npm audit` with zero vulnerabilities. Environment: macOS `26.6`, Apple
Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. This
source change is newer than `v0.2.22` and is not in the published package. No
live model-provider request was made.

Earlier post-release `main` commit `758a3dd` keeps raw select option values out
of provider-facing context while retaining them for local workflow matching.
Its full local gate passed 189/189 tests in 336.41 seconds, type checks,
lab/package builds, history scan (286 worktree files, 288 historical paths,
1,666 blobs), and `npm audit` with zero vulnerabilities. No live model-provider
request was made.

Earlier validated source commit `b799222` on post-release `main` makes the
DOM-path selector fallback reject a same-name target if its tag, type,
associated form name, or link URL changed since observation. Its full local gate
passed 190/190 tests in 294.78 seconds, type checks, lab/package builds, history
scan (286 worktree files, 288 historical paths, 1,673 blobs), and `npm audit`
with zero vulnerabilities. No live model-provider request was made.

Latest fully validated source commit `0cf3dab` also rejects a same-name fallback
target when its observed region changes. Its full local gate passed 191/191
tests in 262.31 seconds, type checks, lab/package builds, history scan (286
worktree files, 288 historical paths, 1,679 blobs), and `npm audit` with zero
vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm
`11.12.1`, and system Chrome `154.0.8037.57`. This source is newer than
published `v0.2.22`. No live model-provider request was made. The history
pattern scan is not a complete security audit.

The `v0.2.21` release commit `86ef775919c5b73bdf5bda087c1ae0c1cf48786f`
preserves Unicode in dashboard JSON requests when a UTF-8 character crosses a
network chunk boundary. From a clean detached worktree on 27 September 2026,
`FCU_BROWSER_CHANNEL=chrome npm run validate` passed 183/183 tests in 280.28
seconds, TypeScript checks, lab and package builds, history scan (285 worktree
files, 287 historical paths and 1,623 blobs), and `npm audit` with zero
vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`,
npm `11.12.1`, and system Chrome `154.0.8037.57`. Release artifact and
publication checks are recorded in [v0.2.21 release notes](../release-notes/0.2.21.md).
No live model-provider request was made. The history pattern scan is not a
complete security audit.

The post-release `main` commit `b43b4a0` rejects malformed UTF-8 request bytes
instead of silently saving replacement characters. On 27 September 2026,
`FCU_BROWSER_CHANNEL=chrome npm run validate` passed 183/183 tests in 312.74
seconds, type checks, lab/package builds, history scan (285 worktree files, 287
historical paths and 1,627 blobs), and `npm audit` with zero vulnerabilities.
Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm `11.12.1`, and
system Chrome `154.0.8037.57`. This follow-up is newer than tag `v0.2.21` and
is not included in that release. No live model-provider request was made.

The preceding source commit `284a3c9` adds observed page-change telemetry and
provider-free workflow reuse after delayed SPA hydration. Its full local gate
passed 185/185 tests in 252.02 seconds, type checks, lab/package builds,
history scan (285 worktree files, 287 historical paths and 1,638 blobs), and
`npm audit` with zero vulnerabilities. These changes are included in `v0.2.22`.
No live model-provider request was made.

The preceding source commit `040743c` prevents a canceled TLS tunnel from
opening an upstream connection after DNS resolution. Its full validation passed
182/182 tests. The preceding source commit `2dda301` redacts URL- and
form-encoded local profile values.

The preceding source commit `b93df0a` invalidates approvals queued by a stopped
task, including when the dashboard resets the shared agent for a new task; its
full local gate passed 180/180 tests.

The preceding source commit `55b13f9` caches composed-tree visibility results
for each DOM observation. A synthetic page with 40 controls under 30 nested
wrappers needed 74 computed-style reads after the change, versus 10,970 before
it. This instrumented fixture is a regression measurement, not a general
website benchmark.

The published v0.2.20 release commit
`d7e800e961817625cdf72cbda974015996dacb7d` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` from a clean detached worktree on
27 September 2026: 178/178 tests in 451.13 seconds, type checks, lab and
package builds, history scan (284 worktree files, 286 historical paths, 1,589
blobs), and `npm audit` with zero vulnerabilities. Its package and publication
checksums are recorded in [release notes](../release-notes/0.2.20.md). No live
model-provider request was made.

The published v0.2.16 release commit
`43b481495bb6ea452365791e25c7e7bc0822f616` passed `npm ci` and
`FCU_BROWSER_CHANNEL=chrome npm run validate` from a clean detached Git
worktree on 27 September 2026: 176/176 tests in 208.46 seconds, type checks,
build, security scan (280 worktree files, 282 historical paths, 1,540 blobs),
and npm audit with zero vulnerabilities. Environment: macOS `26.6`, Apple
Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. No
live model-provider request was made.

The tested package has 135 files and is 1,168,490 bytes. SHA-256:
`09a56870a3efe140d7a967c0896806f754493f1171fa18f97b2d0576f7b3e616`.
npm shasum: `1f13ec278f18f92a12664c9b9dbcfb36cff2ae88`; integrity:
`sha512-NFgeJDhdogr0Fx8IBdykkFb9jlQ4MwvPVSHCnDj676SnfgsH3PPywut0H+UAZ5VQnaEF0FyCth+kbuuWpofbBA==`.
The npm registry and GitHub release tarballs match the candidate byte for byte;
the downloaded release asset passes its portable `.sha256` sidecar. Fresh-prefix
installs from the candidate, registry, and release asset passed CLI
version/help, Chrome `agent doctor`, the public three-row practice table (one
browser action, zero model calls in explicit `--ultra` mode), and MCP `stdio`
initialization with version `0.2.16` and all four tools. npm serves `0.2.16` as
`latest`.

GitHub Pages built the release commit from `main/docs`; the public homepage
returns HTTP 200 and displays `v0.2.16`. Playwright checked widths 320, 390,
768, and 1440 pixels with no horizontal overflow or browser console errors.

The published v0.2.15 release commit `fa705fe4a2792c8f91037e29e8d9431e135ef432`
passed `npm ci` and `FCU_BROWSER_CHANNEL=chrome npm run validate` from a clean
detached Git worktree on 27 September 2026: 174/174 tests in 234.42 seconds,
type checks, build, security scan (278 worktree files, 280 historical paths,
1,524 blobs), and npm audit with zero vulnerabilities. Environment: macOS
`26.6`, Apple Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome
`154.0.8037.57`. No live model-provider request was made.

The tested package has 135 files and is 1,167,926 bytes. SHA-256:
`e7b877504571b28d37d454910cc3c6a6a3c7834a4d68a8147d2b70d1cc5ca177`.
npm shasum: `3772db0bd49c5e289a76867f4148fb94ddb18e18`; integrity:
`sha512-CG96TPuKajlsAJKpRmdwPZ+ipQczZe+mrb3n4uAd5kZ+uZH1j4VrqH7at+47rHsS26ekOAuHmrK9kVJOAwGxLg==`.
The npm registry tarball and GitHub release asset match the candidate byte for
byte; the downloaded release asset passes its `.sha256` sidecar. Fresh-prefix
installs from the candidate and registry passed CLI version/help, Chrome
`agent doctor`, the public three-row practice table (one browser action, zero
model calls in explicit `--ultra` mode), and MCP `stdio` initialization with
version `0.2.15` and all four tools.

GitHub Pages built the same commit from `main/docs` and returned HTTP 200. The
homepage passed 320, 390, 768, and 1440 px overflow checks with no browser
console errors; the release link names `v0.2.15`.

The v0.2.14 candidate working tree based on main commit `c480e65` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 27 September 2026: 167/167
tests in 213.15 seconds, type checks, build, security scan (277 worktree files,
279 historical paths, 1,483 blobs), and npm audit with zero vulnerabilities.
Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm `11.12.1`, and
system Chrome `154.0.8037.57`. No live model-provider request was made. The
fresh-prefix candidate install passed `agent --version`, `agent --help`, Chrome
`agent doctor`, the public synthetic table task (three rows, one browser action,
zero failed actions, zero model calls in explicit `--ultra` mode), and an MCP
`stdio` handshake reporting
version `0.2.14` with all four tools. This was the pre-release working-tree
pass; clean-archive and publication checks follow.

The published v0.2.14 release commit `f1ae2cbae491c062074aa259c19836b3b46523f8`
passed `npm ci` and `FCU_BROWSER_CHANNEL=chrome npm run validate` from a clean
worktree on 27 September 2026: 167/167 tests in 197.54 seconds, type checks,
build, security scan (278 worktree files, 280 historical paths, 1,495 blobs),
and npm audit with zero vulnerabilities. Environment: macOS `26.6`, Apple
Silicon, Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. No
live model-provider request was made.

The 1,166,332-byte package has 135 files and excludes tests and `.env` data.
SHA-256: `9bd0fb1cc1543d48409f441ed5fc4973ae7a73aeaa3c71dfb465bdf502456242`.
npm shasum: `a76c5e3b71535d402e63fad63284b9a3219e0457`; integrity:
`sha512-Ou0OZmQXrDVWKDeQZhF6SpgIN9Ot4ZPxehrVuz51i2mgZo9zgczkKJLxMjQXGyCuaK4QkVcC0VcBBcsIqQt0Yg==`.
The npm registry and GitHub release asset each match the candidate byte for
byte. Fresh-prefix installs from both sources passed version/help, Chrome
doctor, the synthetic three-row table task with one browser action and zero
model calls in explicit `--ultra` mode, and the MCP version/tool handshake.
Pages built the same commit, served HTTP 200, and passed 320/390/768/1440 px
overflow checks plus task-tab, filter, and copy-goal checks with no console
errors. The pattern scan is not a complete security audit.

The v0.2.12 release candidate, based on main commit `f0e1f55`, passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 27 September 2026: 149/149
tests in 219.63 seconds, type checks, build, security scan (275 worktree files,
277 historical paths, 1,392 blobs), and npm audit with zero vulnerabilities.
Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm `11.12.1`, and
system Chrome `154.0.8037.57`. No live model-provider request was made.

The candidate installed into a fresh global npm prefix and passed CLI
version/help, Chrome `agent doctor`, the public synthetic practice-table task
(three rows, one browser action, zero failed actions, zero model calls), and an
MCP `stdio` handshake reporting version `0.2.12` with all four tools.

The post-release browser-reference hardening, on the working tree based on main
commit `4add090`, passed `FCU_BROWSER_CHANNEL=chrome npm run validate` on 27
September 2026: 149/149 tests in 189.83 seconds, type checks, build, security
scan (275 worktree files, 277 historical paths, 1,386 blobs), and npm audit
with zero vulnerabilities. This source follow-up is not included in the
published v0.2.11 package. Environment: macOS `26.6`, Apple Silicon, Node
`25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`.

The v0.2.11 release candidate, based on main commit `e502c08`, passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 27 September 2026: 145/145
tests in 190.03 seconds, type checks, build, security scan (274 worktree files,
276 historical paths, 1,374 historical blobs) and npm audit with zero
vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm
`11.12.1`, and system Chrome `154.0.8037.57`. No live model-provider request
was made.

The release candidate installed into a fresh global npm prefix and passed CLI
version/help, Chrome `agent doctor`, the public synthetic practice-table task
(three rows, one browser action, zero failed actions, zero model calls), and an
MCP `stdio` handshake reporting server version `0.2.11` and all four tools.

The v0.2.10 release candidate passed `FCU_BROWSER_CHANNEL=chrome npm run
validate` on 27 September 2026: 144/144 tests in 187.23 seconds, type checks,
build, security scan (273 worktree files, 275 historical paths, 1,354 blobs)
and npm audit with zero vulnerabilities. The installed candidate also passed
CLI version/help, Chrome doctor, a read-only practice-table task and MCP
initialization/tool discovery. No live model request was made.

Post-release main commits `5dfe985` and `85cfc36` fix the MCP initialization
version and guard the existing “up to N” extraction contract, including empty
results when no items are available. The
`FCU_BROWSER_CHANNEL=chrome npm run validate` gate passed on 27 September 2026:
144/144 tests in 198.18 seconds, type checks, build, security scan (273
worktree files, 275 historical paths, 1,351 blobs) and npm audit with zero
vulnerabilities. The end-to-end regression confirms an empty first-N link result
can complete under the bounded extraction strategy. A smoke test against the
compiled distribution confirmed the MCP server handshake reports the package
manifest version. These main commits are newer than the published v0.2.9
artifacts; no package or release was published for the MCP version fix.
Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm `11.12.1`, system
Chrome `154.0.8037.57`; no live model request was made.

The v0.2.9 source commit `c3aebba` passed `FCU_BROWSER_CHANNEL=chrome npm run
validate` on 27 September 2026: 143/143 tests in 223.69 seconds, type checks,
build, security scan (272 worktree files, 274 historical paths, 1,326 blobs)
and npm audit with zero vulnerabilities. Environment: macOS `26.6`, Apple
Silicon, Node `25.9.0`, npm `11.12.1` and system Chrome `154.0.8037.57`. No
live model request was made. A clean archive of the same commit passed the
same test, type-check and build gates; its history-backed security scan passed
with 273 worktree files, 275 historical paths and 1,334 blobs, and npm audit
reported zero vulnerabilities.

The published 1,160,807-byte npm `0.2.9` package contains 135 files. Its
registry tarball and GitHub release asset match the tested candidate byte for
byte; SHA-256 is
`5a2a4f08ad0719edb4b00fcb3f35a54bdbeda4e075cad3e3f430e3efacdb4048`, and npm
integrity is
`sha512-OoLB7RP3sl86MbYJ+4N7gFwJJPhIwLOC9Vh1V2aTGQvxA/hK+UnwL+P3NH9dihET1u3yFskXWOkd5SRm1/lRdQ==`.
npm reports `0.2.9` as `latest`. Fresh-prefix installs from both downloaded
artifacts passed `agent --version`, `agent --help` and Chrome `agent doctor`;
the read-only public practice-table task returned three rows with one browser
action, zero failed actions and zero model calls in explicit `--ultra` mode.
The GitHub release checksum passed.

GitHub Pages built v0.2.9 from commit `c3aebba`; the homepage returned HTTP
200. Playwright confirmed the release copy and four v0.2.9 links, no horizontal
overflow at 320/390/768/1440 px, and no console errors. No workflow was enabled
or dispatched.

The v0.2.8 source commit `62db2c9` passed `FCU_BROWSER_CHANNEL=chrome npm run
validate` on 27 September 2026: 141/141 tests in 193.06 seconds, type-check,
build, security scan (271 worktree files, 273 historical paths, 1,307
historical blobs; no recognized credentials or private-state paths), and npm
audit with zero vulnerabilities. Environment: macOS `26.6`, Apple Silicon,
Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. No live model
request was made.

The published 1,159,879-byte npm `0.2.8` package contains 135 files. Its
registry tarball and GitHub release asset match the candidate byte for byte;
SHA-256 is
`ed08de727df51f6861b4ad61a306974ecc04e290524c8fc93f9bcb2d90c429c4`, and npm
integrity is
`sha512-KvWe7PxJZac41zu/86sPVL3D5PIoxEVqv5KbPfpdPQpsuoDbnjlWZGfCWuNQxHYCo9XWEzk8FyW1M/PsNsWkaA==`.
npm reports `0.2.8` as `latest`. A fresh-prefix install from the registry
tarball reports `agent --version` as `0.2.8`; `agent doctor` passes Chrome
launch. The read-only public practice-table task returns three rows with one
browser action, no failed actions and zero model calls. The GitHub release
checksum passes, and its two downloaded assets match the tested package and
checksum file.

GitHub Pages built the v0.2.8 site from commit `62db2c9`; the homepage returned
HTTP 200. Playwright confirmed the release copy and four v0.2.8 links, no
horizontal overflow at 320/390/768/1440 px, and no console errors. No workflow
was enabled or dispatched.

The v0.2.7 source commit `1f1d698` passed `FCU_BROWSER_CHANNEL=chrome npm run
validate` on 27 September 2026: 140/140 tests in 181.90 seconds, type-check,
build, security scan (270 worktree files, 272 historical paths, 1,293
historical blobs; no recognized credentials or private-state paths), and npm
audit with zero vulnerabilities. Environment: macOS `26.6`, Apple Silicon,
Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. No live model
request was made.

The published 1,159,154-byte npm `0.2.7` package contains 135 files. Its
registry tarball and GitHub release asset match the candidate byte for byte;
SHA-256 is
`6475e541625d21cf8104aca6b9c371664b55b07986f29bd9b7599af3903e52bc`, and npm
integrity is
`sha512-0oopdeOZChCMFU2P60/SPQOyerYRsgV4rXhTWxdcsB9GapGRz0qnFfHekffMZVZfpsqT5y/BK91bueMoxd0w2A==`.
npm reports `0.2.7` as `latest`. A fresh-prefix install from the registry
tarball reports `agent --version` as `0.2.7`; `agent doctor` passes Chrome
launch. The read-only public practice-table task returns three rows with one
browser action, no failed actions and zero model calls. The GitHub release
checksum passes, and its two downloaded assets match the tested package and
checksum file.

GitHub Pages built the v0.2.7 site from commit `1f1d698`; the homepage returned
HTTP 200. Playwright confirmed the release copy and four v0.2.7 links, no
horizontal overflow at 320/390/768/1440 px, and no console errors. No workflow
was enabled or dispatched.

The v0.2.6 source commit `c4aacf1` passed `FCU_BROWSER_CHANNEL=chrome npm run
validate` on 27 September 2026: 139/139 tests in 220.32 seconds, type-check,
build, security scan (269 worktree files, 271 historical paths, 1,279
historical blobs; no recognized credentials or private-state paths), and npm
audit with zero vulnerabilities. Environment: macOS `26.6`, Apple Silicon,
Node `25.9.0`, npm `11.12.1`, and system Chrome `154.0.8037.57`. No live model
request was made.

The published 1,158,540-byte npm `0.2.6` package contains 135 files. Its
registry tarball and GitHub release asset match the candidate byte for byte;
SHA-256 is
`48ec15c3f539822c6843db7883ae971614e233f97f39d0e08305baaa202962f5`, and npm
integrity is
`sha512-qM/pIBHpSzFeFqpRTkQhrn5LZCADQ3L2+BvMCXVqcf9ldlQYwK4Ax0YuO5PwGM2guQasZdS58eaVfMK2v3+KNQ==`.
npm reports `0.2.6` as `latest`. A fresh-prefix install from the registry
tarball reports `agent --version` as `0.2.6`; `agent doctor` passes Chrome
launch. The read-only public practice-table task returns three rows with one
browser action, no failed actions and zero model calls. The GitHub release
checksum passes, and its two downloaded assets match the tested package and
checksum file.

GitHub Pages built the v0.2.6 site from commit `c4aacf1`; the homepage returned
HTTP 200. Playwright confirmed the release copy and four v0.2.6 links, no
horizontal overflow at 320/390/768/1440 px, and no console errors. No workflow
was enabled or dispatched.

The v0.2.5 code passed `FCU_BROWSER_CHANNEL=chrome npm run validate` on 27
September 2026: 138/138 tests in 177.90 seconds, type-check/build, security
scan (268 worktree files, 270 historical paths, 1,261 historical blobs; no
recognized credentials or private-state paths), and npm audit with zero
vulnerabilities. Environment: macOS `26.6`, Apple Silicon, Node `25.9.0`, npm
`11.12.1`, and system Chrome `154.0.8037.57`. The planner test confirms a
4,000-character non-English goal stays in trusted context, is restored to the
internal plan, and is not repeated in provider output; a 4,001-character goal
is rejected before another provider call. No live model request was made.

The 1,157,706-byte package has SHA-256
`d6021ee2748160060e8e998f6f3fb5fbee7ba677abec2dd3756ee73eb19fc20f` and npm
integrity
`sha512-Hbov0RLOwhQCAKLfpz2OuHq4L1qGCmCCz9YIycWdCRkVLyrjb/2HEcQL0VUOWtitlXMEsimdd5JNit31cWvUAw==`;
it contains 135 files. npm reports `0.2.5` as `latest`. The downloaded npm
registry tarball and GitHub release asset match the candidate byte for byte. A
fresh npm prefix reports `agent --version` as `0.2.5`, `agent doctor` passes
Chrome launch, and the public practice-table task returns three rows with one
browser action, no failed actions and zero model calls. The GitHub release's
downloaded checksum passes.

The v0.2.5 GitHub Pages build completed at commit `871b6bbab955bded9f47eccd06f0bf3702a19211`;
the homepage returned HTTP 200. Playwright confirmed the new release copy and
four v0.2.5 links, no horizontal overflow at 320/390/768/1440 px, and no
console errors. The published page screenshot was inspected.

The v0.2.4 candidate committed as `0570fe9`, based on `main` at `5d38ae6`, passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 27 September 2026: 137/137
tests in 223.73 seconds, type-check/build, security scan (267 worktree files,
269 historical paths, 1,239 historical blobs; no recognized credentials or
private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Apple Silicon, Node `25.9.0`, and system Chrome `154.0.8037.57`.
The agent-boundary regression confirms a 4,001-character goal is rejected
before browser launch or trace creation. No live model-provider request was
made.

Published v0.2.4 is `latest` on npm with integrity
`sha512-+FLUn2Zk4qaoArQeW+lPfEIHK+Rr56Z7shUQG7pSTwLKaYPkt4SOUObj/Kdfc9ormgRhtxnQjuWRgjvJIIWcQQ==`.
The registry tarball and GitHub release asset match byte for byte (SHA-256
`7ad563d54697c05b6a5f8478207ed1823ee776fd6b62cd8cf959225c223435f0`); the
downloaded GitHub checksum passes. A fresh npm prefix reports `agent --version`
as `0.2.4`; `agent doctor` passes Chrome launch, and 4,001-character CLI input
is rejected before browser launch. The public practice-table task returned
three rows with one browser action, no failed actions and zero model calls.
GitHub Pages built commit `0570fe9697dce183f5b6baa0c7d1b456b7ad66ba`; the
homepage returned HTTP 200. Playwright confirmed the v0.2.4 release copy and
links, no horizontal overflow at 320/390/768/1440 px, and no console errors.

The v0.2.3 release-candidate working tree based on `main` at `7fcff07` passed
`FCU_BROWSER_CHANNEL=chrome npm run validate` on 27 September 2026: 136/136 tests
in 182.55 seconds, type-check/build, security scan (266 worktree files, 268
historical paths, 1,221 historical blobs; no recognized credentials or
private-state paths), and npm audit with zero vulnerabilities. Environment:
macOS `26.6`, Apple Silicon, Node `25.9.0`, and system Chrome `154.0.8037.57`.
No live model-provider request was made. The v0.2.3 lab smoke passed 34 pages,
758 accessible controls, eight practice cards, keyboard interaction, responsive
widths 320/390/768/1440, and no console errors.

Published v0.2.3 is `latest` on npm with integrity
`sha512-iRODgQYXxZ8EZVI9+gyNoS9+Sd5CYt3VD7u86onOYgBf7RdC4Xxkm7zyxJoFy8DG+iNBTaScyulBfGIOz5ES0A==`.
The registry tarball and GitHub release asset match the tested package byte for
byte (SHA-256
`3f2134fee673dfc2cac1abfab3965409a5f3383e74fc4e48804fa9c29e0dfac6`); the
downloaded GitHub checksum passes. A fresh npm prefix reports `agent --version`
as `0.2.3`; `agent doctor` passes Chrome launch. The public practice-table task
returned three data rows with one browser action, no failed actions and zero
model calls. GitHub Pages built commit `11b6a2974374eece42ca5cee5f8db137e084e85f`;
the homepage returned HTTP 200. Playwright confirmed the 0.2.3 release copy and
links, no horizontal overflow at 320/390/768/1440 px, and no console errors.

The source and tests committed as `8d91e65` and tagged `v0.2.2`, based on `main`
at `5a59f40`, passed `FCU_BROWSER_CHANNEL=chrome npm run validate` on 26
September 2026: 135/135 tests in 216.39 seconds, type-check/build, security scan
(265 worktree files, 267 historical paths, 1,202 historical blobs; no
recognized credentials or private-state paths), and npm audit with zero
vulnerabilities. Environment:
macOS `26.6`, Apple Silicon, Node `25.9.0`, and system Chrome `154.0.8037.57`.
No live model-provider request was made. `FCU_BROWSER_CHANNEL=chrome npm run
lab:smoke` also passed: 34 pages, 755 accessible controls, eight practice cards,
keyboard interaction, responsive widths 320/390/768/1440, and no console errors.

npm reports `0.2.2` as `latest`. The registry tarball SHA-256 matches the
validated candidate byte for byte; it installed in a fresh prefix and passed
`agent doctor` plus the public practice-table workflow (three data rows, one
browser action, zero model calls). The public GitHub release tarball matches
the same bytes and passes `SHA256SUMS`. GitHub Pages reports a successful build
at `8d91e65`; the updated homepage returns HTTP 200, its task tabs and filters
work, and Playwright found no console errors or overflow at 320/390/768/1440 px.

Commit `ea1ebae` passed `FCU_BROWSER_CHANNEL=chrome npm run validate` on 26
September 2026: 134/134 tests in 180.99 seconds, type-check and build, security
scan (264 worktree files, 266 historical paths, 1,183 unique historical blobs;
no recognized credentials or private-state paths), and npm audit with zero
vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system Chrome
`154.0.8037.57`. No live model-provider request was made.

The v0.2.1 release candidate at `a9b2362` passed the same gate from a clean Git
clone on 26 September 2026: 134/134 tests in 179.76 seconds, type-check/build,
security scan (265 worktree files, 267 historical paths, 1,197 unique historical
blobs; no recognized credentials or private-state paths), and npm audit with
zero vulnerabilities. Environment: macOS `26.6`, Node `25.9.0`, and system
Chrome `154.0.8037.57`. No live model-provider request was made.

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
