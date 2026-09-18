# Implementation notes

The eight MVP milestones are implemented: browser runtime, Flash integration,
verification/repair, metrics/diffs, workflow/replay, CLI, local UI, and validation.
The workspace and repository retain the name FreeComputerUse.

## Runtime decisions

The model produces strictly validated JSON actions, never code. The runtime owns
selectors, local variables, browser state, permission gates and final verification.
Known narrow tasks use local strategies; compatible learned tasks reuse semantic
actions. New page content needs another batch; ordinary clicks do not.

Semantic references are stable for each live document and frame. Selector ranking
prefers role/name, label, placeholder, test ID, ID/name, text, CSS and observed DOM
path. Multiple matches fail for mutations. Extraction permits collections.

Plans and repairs have separate strict schemas. Repair preserves the successful
prefix and pending compatible actions. Invalid provider JSON gets at most one
schema correction, counted as another call. Execution repair, action/state loops,
navigation loops, step count and provider token admissions are bounded separately.
User-owned final criteria cannot be removed by model repair. Completion proves
those checks, not arbitrary semantic correctness; benchmark oracles also inspect
actual data and browser outcomes.

## Data and reuse

The profile sends alias names instead of values. Runtime resolution is local;
known values are redacted from serialized prompts/traces. SQLite stores private
run metadata, plans, actions, timing, provider usage and compatible workflows.
Successful actions are converted to semantic descriptors. Matching uses exact
origin/path, normalized intent and an initial control fingerprint. Changed tasks
or incompatible structures are not assumed to be the same workflow.

Replay disables the provider even if one is configured. It stops on failure.
Site and sensitive-action approvals still apply. Persistent browser contexts retain
localStorage and unexpired persistent cookies; session-only cookies can expire on
browser shutdown according to site policy. The public lab uses synthetic persistent
cookies to validate a restart without another simulated login.

## Progressive context and visual boundary

Observation exposes overview/controls/regions and bounded visible text/tables.
Batch transitions and repairs can use DOM diffs. Repeated failures escalate to
accessibility and a sanitized component HTML fragment. The UI preview and explicit
CLI screenshot are local. Images are not sent to the provider. Vision control,
canvas execution, multi-model routing and named external site adapters are planned.

The dashboard executes mouse movement over multiple real Playwright mouse events,
types short text progressively, and scrolls in increments. Trusted pointer telemetry
travels over the authenticated event stream; a cursor and click ring are drawn in
the dashboard, without injecting code into websites or including typed values.
Preview requests are serialized and refresh continuously while a task runs.
Cursor projection accounts for image scaling, letterboxing and iframe coordinates;
document IDs hide stale cursors on navigation. Approval guards are checked again
after movement, and pause/stop checkpoints interrupt movement and typing. Native
input types, passwords and long text retain direct entry. CLI/benchmark execution
keeps its original pace unless visual interaction is explicitly enabled.

## Evidence

`npm test` runs actual Chromium against deterministic local pages. Real provider
measurements are stored in `artifacts/demo-measurements.json`,
`artifacts/benchmark-live.json` and `artifacts/benchmark-public.json`. Scripted
fixture-provider runs are explicitly distinguished from model performance.
Public tasks use scraping/automation sandboxes and our browser-only simulation
lab; no real people, messages, payments or account mutations are involved.
See `README.md` and `SECURITY.md` for scope, installation and security limitations.
