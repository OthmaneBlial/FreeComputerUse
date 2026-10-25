# Model providers

FreeComputerUse sends a compressed page description and the task to one model
provider. Browser actions always run locally. Saved procedures replay without a
model; the model is only called to plan a new task or repair a step that no
longer matches the page.

| Id | Route | Key or sign-in | Default model | Usage counts |
| --- | --- | --- | --- | --- |
| `anthropic` | Claude Messages API | `ANTHROPIC_API_KEY` or stored key | `claude-opus-5-5` | Reported by the API |
| `deepseek` | DeepSeek API (OpenAI-compatible) | `DEEPSEEK_API_KEY` or stored key | `deepseek-flash` | Reported by the API |
| `openai` | OpenAI Chat Completions | `OPENAI_API_KEY` or stored key | none: set `OPENAI_MODEL` | Reported by the API |
| `openai-compatible` | Any compatible endpoint | `LLM_API_KEY` with `LLM_BASE_URL`, `LLM_MODEL` | `LLM_MODEL` | Reported by the API |
| `claude-subscription` | Claude Code CLI 2.1.310+ | `claude auth login` (Pro/Max) | the CLI's model, or `CLAUDE_MODEL` | Reported by the CLI when available |
| `codex-subscription` | Codex CLI | `codex login` (ChatGPT plan) | the CLI's model, or `CODEX_MODEL` | Estimated locally |

"Codex" here means the Codex CLI signed in with a ChatGPT plan. The OpenAI API
route (`openai`) is separate and uses an API key. FreeComputerUse also exposes
its own MCP server for MCP hosts; see [MCP setup](MCP.md). That is a third,
independent way to use it and does not choose a model.

## Choose and check a provider

```sh
npm run agent -- providers                     # status of every provider, never key values
npm run agent -- providers set-key anthropic   # paste the key; it is read from the terminal or stdin
npm run agent -- providers test anthropic      # one minimal real request
npm run agent -- run "…" https://example.com --provider deepseek --model deepseek-v4-pro
```

In the dashboard (`npm run dev`), the **Model** menu picks the provider for one
task, and **Providers and keys** shows each provider's status, a **Test
connection** button and a write-only key field. A stored key is never shown again.

`LLM_PROVIDER` sets the default. Generic `LLM_API_KEY`, `LLM_MODEL`,
`LLM_BASE_URL`, `LLM_RESPONSE_FORMAT` and `LLM_MAX_OUTPUT_TOKENS_PARAM` apply
only to that default provider. A key in the environment wins over a stored key.

## Keys

- `agent providers set-key <id>` stores the key in the macOS Keychain (service
  `free-computer-use`). On other systems, or with `FCU_SECRET_STORE=file`, it
  goes to `<FCU_DATA_DIR>/secrets.json` with mode 0600. The key is passed to the
  Keychain on stdin, never as a command argument.
- A `.env` file also works. The loader tightens it to 0600 and rejects symbolic
  links. Never commit it.
- Errors show the HTTP status, the provider's error code and a hint. Response
  bodies, prompts and keys are never printed or saved in traces.

## Errors, retries and fallback

- 408, 409, 429, 5xx and 529 (overloaded) are retried twice, honoring
  `retry-after` (capped at 30 s), or with exponential backoff and jitter. Retries
  share one budget reservation, so a retry is not counted as a new model call.
- 400, 401, 403 and 404 fail at once with a hint ("authentication failed; check
  the API key", "model not found", and so on).
- A Claude refusal (`stop_reason: refusal`) is reported as "Claude declined
  this request" and never parsed as a plan.
- `LLM_FALLBACK_PROVIDERS=deepseek,anthropic` tries those providers in order if
  the default fails. Cancellation, budget limits and human rejection never fall
  through to another provider.
- `LLM_ESCALATION_MODEL` (with optional `LLM_ESCALATION_PROVIDER`) moves a task
  to a stronger model after two repairs, so easy work stays on the cheaper model.

## Claude specifics

- Requests use the Messages API with the system policy marked for prompt
  caching. Current Claude models think adaptively, so the output reservation is
  8,000 tokens for plans and 1,024 for small checks.
- `LLM_EFFORT=low|medium|high|xhigh|max` sets `output_config.effort`.
- On `api.anthropic.com`, Opus 5, Opus 5.5, Sonnet 5.5 and Fable 5.1 requests
  ask for server-side fallback when the model is overloaded.
- The Claude subscription route runs Claude Code with `--safe-mode`, which
  disables local tools, hooks, plugins and MCP but keeps your sign-in.
  `--bare` would skip the sign-in, which is why older versions of this route
  reported "Not logged in".

## Vision fallback

Off by default: the model gets a text description of the page and no images.
With `FCU_VISION=1`, a step that is still failing after two repairs is
repaired with a JPEG of the visible viewport attached. Inputs, text areas,
selects and editable regions are masked in the image, so typed values and
profile data are not sent as pixels. The model can then answer with a point
target `{"x":…,"y":…}`. The point resolves to the element under it, so
site rules and sensitive-action approvals still apply. A click lands on that
exact spot, which makes buttons drawn on a canvas usable.

Image input is sent to `anthropic`, `deepseek` and `openai`. The model must accept
images: `deepseek-flash` does, `deepseek-v4-pro` does not. CLI subscription routes and
`openai-compatible` never receive a screenshot. A step that needed a point is not
saved into a procedure or a learned workflow.

## Endpoints for `openai-compatible`

| Service | `LLM_BASE_URL` |
| --- | --- |
| xAI | `https://api.x.ai/v1` |
| Gemini (OpenAI compatibility) | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Mistral | `https://api.mistral.ai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

The app appends `/chat/completions` and requests JSON output. `json_schema`
output converts the action schema to a strict schema. Compatibility does not
guarantee every model accepts every parameter.

## Verified on 25 October 2026

Each line is one real minimal request made with `providers test` on this
machine. A connection test proves sign-in and a valid response, not every
browser task.

| Provider | Result |
| --- | --- |
| `deepseek`, `deepseek-flash` | Passed in 938 ms; 64 input and 5 output tokens reported |
| `claude-subscription`, Claude Code 2.1.310 | Passed with `claude-opus-5-5`; 599 input and 9 output tokens reported by the CLI |
| `codex-subscription`, Codex CLI 0.164.0 | Passed in 4,561 ms; usage estimated |
| `deepseek`, vision fallback | A canvas-only START button task completed: 5 calls, 9,325 input and 216 output tokens; the screenshot repair returned the point that worked |
| `anthropic` (API key) | **Not tested live**: no key was available. Covered by request-contract tests (headers, caching, retries, refusals) against a local server. |
| `openai` (API key) | **Not tested live**: covered by request-contract tests only. |

Browser-task measurements with real model calls are in
[BENCHMARKS.md](BENCHMARKS.md#procedures-and-token-savings).

## Official references

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) and [Claude Code CLI](https://code.claude.com/docs/en/cli-usage)
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) and [Codex CLI](https://github.com/openai/codex)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
