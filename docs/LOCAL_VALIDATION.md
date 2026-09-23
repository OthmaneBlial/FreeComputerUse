# Local validation only

The project has no GitHub CI workflow. The former validation workflow is disabled
on GitHub, and its source definition has been removed at the owner's request.
Do not enable or dispatch GitHub validation runs.

Run the checks locally:

```bash
npm run validate
```

This rebuilds the static lab under `docs/lab` while preserving the product landing page at `docs/index.html`, checks TypeScript, runs Chromium tests, builds the package, scans tracked files/history for recognizable secrets, and audits production dependencies.
Browser smoke tests and live-provider benchmarks are also run locally and are
separate opt-in commands because they can spend API tokens.

GitHub Pages is the existing host for the public static lab. Hosting publication
is separate from the removed CI checks.
