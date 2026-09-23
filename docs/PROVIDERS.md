# Model providers

FreeComputerUse sends the page context and task to the configured model service.
Browser actions still run locally. A ChatGPT or Claude subscription connection
uses that provider's local CLI, but its model request is still processed by the
provider and subject to the plan's limits. A consumer subscription is separate
from API billing.

## API key setup

Copy `.env.example` to `.env`, restrict it to your account (`chmod 600 .env` on
macOS/Linux), then set `LLM_API_KEY`, `LLM_MODEL` and `LLM_BASE_URL`. The local
environment loader also strips group/other permission bits before reading a
regular `.env` file on macOS/Linux and rejects symlinks. Never commit `.env` or
paste a key into an issue, screenshot or log. Use the model ID shown in the
provider account or current provider documentation.

The default route is OpenAI Chat Completions-compatible:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=https://api.deepseek.com
LLM_RESPONSE_FORMAT=json_object
```

Set the endpoint for the service you chose:

| Service | `LLM_BASE_URL` | Notes |
| --- | --- | --- |
| OpenAI API | `https://api.openai.com/v1` | Use an API key and model enabled for that API project. |
| xAI / Grok API | `https://api.x.ai/v1` | Use an xAI API key and model ID from the xAI API. |
| Gemini API | `https://generativelanguage.googleapis.com/v1beta/openai/` | This is Google's OpenAI-compatible endpoint. |
| DeepSeek API | `https://api.deepseek.com` | The repo default model is `deepseek-flash`; model aliases may change. |
| Mistral API | `https://api.mistral.ai/v1` | Choose a model available to your API account. |
| OpenRouter | `https://openrouter.ai/api/v1` | Set `LLM_MODEL` to an available `provider/model` slug. |

The application appends `/chat/completions` and sends a bearer key, chat
messages, a completion limit and JSON response format. It uses
`max_completion_tokens` for `api.openai.com` and `max_tokens` for other
OpenAI-compatible endpoints. Set `LLM_MAX_OUTPUT_TOKENS_PARAM` to override that
choice for an endpoint with different requirements. The `json_schema` option
converts optional fields to required nullable fields, `oneOf` to `anyOf`, and
record selectors to a bounded list that is restored after the response;
`json_object` remains the broader default. Provider compatibility does not
guarantee every model accepts every parameter or returns the expected response
shape. These examples are not live certifications; see the
[support matrix](SUPPORT_MATRIX.md).

For Anthropic Messages API, switch to its native route:

```dotenv
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_RESPONSE_FORMAT=json_object
```

Anthropic mode sends `POST /messages` with `x-api-key`, the Messages API version,
`system`, one user message and `max_tokens`. JSON is requested in the prompt and
then validated locally. `json_schema` is rejected because the action schema has
dynamic record keys.

### Check an API configuration

```sh
npm run agent -- doctor
npm run agent -- doctor --api
```

`doctor` launches the configured Playwright browser and reports the runtime; it
makes no provider request. Success exits with status 0. A failed check prints a
short corrective error and exits nonzero. `doctor --api` additionally makes a
network request: API modes request `/models` and look for the configured model;
subscription modes check CLI authentication. It does not make a model
completion. An endpoint whose model-list response is not compatible with this
check can still require a separate provider-specific smoke test. Local CLI tests
use only a loopback server and fake provider responses.

## Existing ChatGPT or Claude subscriptions

These modes require the official CLI to be installed and already authenticated.
They do not use an API key and do not bypass account or plan limits.

### ChatGPT through Codex CLI

Install [OpenAI Codex CLI](https://github.com/openai/codex), authenticate with
`codex login` using ChatGPT, then configure:

```dotenv
LLM_PROVIDER=codex-subscription
# Optional if `codex` is not on PATH:
# CODEX_CLI_PATH=/absolute/path/to/codex
```

Run `npm run agent -- doctor --api` to check the CLI version and login. Planning
runs an ephemeral Codex request in a temporary directory, with a read-only
sandbox, structured output and Codex tools/MCP disabled. The adapter maps action
unions and optional fields to Codex's strict output schema, represents record
selectors as a list for the model, then restores the local action shape before
Zod validation.

A live smoke passed on 23 September 2026 with Codex CLI `0.156.1` and an existing
ChatGPT login. One bounded request produced a valid plan for synthetic page
content. The local budget estimated 7,022 input and 97 output tokens; the CLI
route did not report a model ID or provider token usage. No browser action ran.
This verifies one plan completion on the installed CLI/account only.

### Claude Pro or Max through Claude Code

Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started)
and authenticate with `claude auth login` using the Claude account, not Console
API credentials. The [CLI reference](https://code.claude.com/docs/en/cli-usage)
documents `claude --version` and `claude auth status`. Configure:

```dotenv
LLM_PROVIDER=claude-subscription
# Optional if `claude` is not on PATH:
# CLAUDE_CLI_PATH=/absolute/path/to/claude
```

The project requires Claude Code `2.1.248+`; `doctor --api` checks and reports
the CLI version before checking first-party authentication. If the CLI cannot
start or report a version, update it before troubleshooting account login.
Planning uses print mode, disables local tools and MCP, avoids session
persistence, and limits the request to one turn. The fake-CLI tests do not
authenticate against Anthropic.

## Current evidence

Offline request-contract results and unverified vendor combinations are listed
in the [support matrix](SUPPORT_MATRIX.md). Do not treat a successful `doctor
--api` model-list lookup as proof that a completion, structured output or a
browser task works. Live completions should be run explicitly against a
sandboxed task, with the provider, model, date and budget recorded.

## Official provider references

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [xAI API reference](https://docs.x.ai/developers/rest-api-reference/inference) and [OpenAI-compatible endpoint examples](https://docs.x.ai/developers/tools/advanced-usage)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) and [JSON output](https://api-docs.deepseek.com/guides/json_mode/)
- [Mistral migration guide](https://docs.mistral.ai/resources/migration-guides)
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
