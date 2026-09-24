# Contributing

Thanks for helping make browser automation safer and easier to verify. Keep
changes focused, preserve the local permission model, and include evidence for
behavior changes.

## Development setup

The package declares Node.js `>=22.13.0`; only the environment in the
[support matrix](docs/SUPPORT_MATRIX.md) is currently validated. Install Node,
npm and a browser Playwright can launch. To use an already installed Chrome
without downloading a browser, set `FCU_BROWSER_CHANNEL=chrome`.

```sh
git clone https://github.com/OthmaneBlial/FreeComputerUse.git
cd FreeComputerUse
npm ci
cp .env.example .env
chmod 600 .env
```

Run `npm run agent -- doctor` to check the local runtime, then `npm run dev` and
open `http://127.0.0.1:4318`. The deterministic practice task works without a
provider key. See [provider setup](docs/PROVIDERS.md) before opting into a live
provider request.

## Before opening a pull request

```sh
npm run check
FCU_BROWSER_CHANNEL=chrome npm test
npm run validate
```

`npm run validate` is the full local gate and includes the serial tests, build,
security scan and production dependency audit. It needs registry access for the
audit. The ordinary test suite uses local fixtures and does not call a model.
The optional live benchmarks can spend API tokens; do not run them in a change
that only needs deterministic coverage. See [local validation](docs/LOCAL_VALIDATION.md)
for the exact scope and known limits.

For browser behavior, add a focused regression test using the existing fixture
helpers. Check both the denied case and an authorized case where applicable.
For UI changes, run `FCU_BROWSER_CHANNEL=chrome npm run ui:smoke` or
`npm run lab:smoke` and inspect any changed screenshots. Do not include real
browser profiles, cookies, API keys or personal data in fixtures or reports.

Use the existing TypeScript, Playwright and Zod patterns. Explain any new
dependency and keep provider/network tests opt-in. GitHub Actions is disabled
by owner instruction; do not add or dispatch workflows.

## Issues and security reports

Use the repository's bug or feature form. Include a small reproduction and
versions, but remove API keys, tokens, cookies, private URLs and personal data
from logs and screenshots. Report vulnerabilities privately through GitHub's
private vulnerability reporting when it is enabled; do not file them as public
issues.

## Review and support policy

Pull requests target `main` and should state the problem, behavior change,
validation run and remaining limitation. There are no published releases or
release branches yet, so `main` is the only maintained line. After the first
release, the latest stable release and current `main` are the supported lines;
older releases have no promised maintenance window. There is no LTS policy.
