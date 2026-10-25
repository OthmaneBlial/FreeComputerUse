# Architecture

FreeComputerUse is a local Node.js process. The model proposes bounded browser
actions; the local policy and executor decide whether and how those actions run.
There is no hosted application server or background cloud sync in this design.

```mermaid
flowchart LR
  CLI[CLI] --> CONFIG[Config]
  UI[Local dashboard] --> API[Loopback HTTP API]
  API --> AGENT[Agent]
  CLI --> AGENT
  AGENT --> OBS[DOM observer and compressor]
  OBS --> PROVIDER[API provider or local CLI]
  PROVIDER --> SCHEMA[Validated action plan]
  SCHEMA --> POLICY[Origin and action policy]
  POLICY --> EXEC[Playwright executor]
  EXEC --> BROWSER[Local browser]
  BROWSER --> VERIFY[Result verifier]
  AGENT --> STORE[Local SQLite traces and procedures]
  API --> PROFILE[Local profile vault]
  BROWSER --> REC[Teach recorder]
  REC --> STORE
  STORE --> REPLAY[Procedure replay with parameters]
  REPLAY --> POLICY
  KEYS[Keychain or private key file] --> PROVIDER
```

## Request path

1. `src/cli/index.ts` loads environment configuration and starts a task, the
   local dashboard, or a diagnostic. `src/config.ts` resolves provider settings,
   token limits and the dedicated local data directory.
2. `src/agent/Agent.ts` coordinates observation, planning, execution, repair,
   independent completion checks and trace updates. `Control` carries approval,
   pause, resume and stop signals.
3. `Observer`, `DomExtractor` and `PageCompressor` collect a bounded DOM-based
   page description. `LLMProvider` adapters return a structured plan; Zod
   schemas validate it before `Executor` can act.
4. `policy.ts` applies site-origin and sensitive-action rules. `Browser.ts`
   attaches Chromium request guards, and `NetworkGuardProxy.ts` checks proxied
   HTTP(S)/WebSocket destinations. `Executor` performs the fixed action set;
   it does not evaluate model-supplied JavaScript or shell commands.
5. `Verifier` checks task-specific completion evidence. `WorkflowEngine` stores
   compatible learned workflows and replays them without another model request,
   while retaining the regular permission checks.

## Providers

`src/llm/providers.ts` holds the provider registry: one entry per route
(Claude API, DeepSeek, OpenAI, any OpenAI-compatible endpoint, Claude Code and
Codex CLIs) with its default model, key names and connection test.
`FlashProvider` speaks the Claude Messages API and Chat Completions, with
retries, prompt caching for Claude and explicit error hints. The two
subscription adapters run the signed-in CLIs without local tools. Keys come
from the environment or `SecretStore` (macOS Keychain, or a 0600 file), never
from traces or procedures. `ProviderChain` adds fallback and escalation around the selected provider.
Details: [Providers](PROVIDERS.md).

## Procedures and teaching

A procedure is a workflow row in `history.sqlite` with a name, a description,
typed parameters (`text`, `file`, `secret`), a start URL, preconditions, a
completion check, up to ten earlier versions and its run history.

- **Creating one.** `src/teach/Recorder.ts` records trusted clicks, typing,
  selections, uploads and navigation in the browser as semantic targets (role,
  name, label, stable id); secret and file values become parameters. Written
  steps go through `src/teach/steps.ts`. A completed run can also be saved.
  All three paths end in `WorkflowEngine.saveSteps`, which replaces literal
  values with `{{params.name}}` and validates the result.
- **Finding one.** `WorkflowEngine.find` scores a request against the
  procedure's name, description, keywords and steps, with English and French
  synonyms, and reads parameter values from the request. The dashboard and
  CLI ask only for missing values.
- **Replaying one.** `Agent.runProcedure` validates the values, resolves them
  locally through `VariableResolver`, and executes the steps without a model.
  `SelectorEngine` tries the recorded target, then its alternatives. With
  `FCU_VISION=1`, late repairs add a masked viewport screenshot and may answer
  with a point target that is never saved. A step
  that still fails goes to the model for a one-step repair, or, with teach on
  failure, to a human demonstration. After two repairs, the rest is planned
  from the current page in one request. A successful run is saved as a new
  version that keeps old targets as alternatives. Sensitive steps still
  go through the normal approval prompt on every run.

## Local surfaces and data

- `src/server/index.ts` serves the dashboard only on loopback and checks its
  session cookie, Host, Origin and CSRF token. `src/ui/` contains the browser UI.
- `ProfileStore` stores explicitly configured aliases; `TraceStore` stores run
  history, learned workflows and procedures in SQLite. Browser profiles and downloads use
  the same configured data directory. Details, retention and deletion are in
  [Local data](LOCAL_DATA.md).
- API mode sends the page context needed to plan to the selected provider.
  Subscription modes invoke the corresponding local provider CLI. Provider
  routes and evidence are in [Providers](PROVIDERS.md) and the
  [support matrix](SUPPORT_MATRIX.md).
- `lab/` is a set of deterministic local practice pages. `docs/` is the GitHub
  Pages source and contains the public landing page and lab copy. It is not the
  agent runtime.

## Change boundaries

Changes to a trust boundary need negative tests plus a matching allowed-path
test. Changes to a provider need contract tests and updated support evidence.
Changes to local storage need import-failure, permission and cleanup checks.
Run `npm run check` for types and `npm run validate` for the complete local
gate; the validation policy intentionally does not use GitHub Actions.
