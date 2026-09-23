# Model providers

FreeComputerUse sends the page context and task to the configured model service.
Browser actions still run locally. A ChatGPT or Claude subscription connection
uses that provider's local CLI, but its model request is still processed by the
provider and subject to the plan's limits. A consumer subscription is separate
from API billing.

## API key setup

Copy `.env.example` to `.env`, restrict it to your account (`chmod 600 .env` on
macOS/Linux), then set `LLM_API_KEY`, `LLM_MODEL` and `LLM_BASE_URL`. Never
commit `.env` or paste a key into an issue, screenshot or log. Use the model ID
shown in the provider account or current provider documentation.

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
messages, `max_tokens` and JSON response format. The `json_schema` option is
available for providers/models that accept it; `json_object` is the broader
default. Provider compatibility does not guarantee every model accepts every
parameter or returns the expected response shape. These examples are not live
certifications; see the [support matrix](SUPPORT_MATRIX.md).

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

`doctor` launches the configured Playwright browser and reports the runtime.
`doctor --api` additionally makes a network request: API modes request `/models`
and look for the configured model; subscription modes check CLI authentication.
It does not make a model completion. An endpoint whose model-list response is
not compatible with this check can still require a separate provider-specific
smoke test; no vendor request is included in local tests.

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

Run `npm run agent -- doctor --api` to check the login. Planning runs an
ephemeral Codex request in a temporary directory, with a read-only sandbox,
structured output and Codex tools/MCP disabled. CLI compatibility can change;
the fake-CLI tests in this repository do not authenticate against OpenAI.

### Claude Pro or Max through Claude Code

Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started)
and authenticate with `claude auth login` using the Claude account, not Console
API credentials. Configure:

```dotenv
LLM_PROVIDER=claude-subscription
# Optional if `claude` is not on PATH:
# CLAUDE_CLI_PATH=/absolute/path/to/claude
```

The current project configuration documents Claude Code `2.1.248+`; verify the
minimum against the installed CLI before a release. `doctor --api` checks
first-party authentication. Planning uses print mode, disables local tools and
MCP, avoids session persistence, and limits the request to one turn. The
fake-CLI tests do not authenticate against Anthropic.

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
