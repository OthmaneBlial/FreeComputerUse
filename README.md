<h1><img src="docs/brand-mark.svg" alt="" width="40" height="40" align="absmiddle"> FreeComputerUse</h1>

![FreeComputerUse — a local-first browser agent that plans, acts and verifies with you in control](assets/readme/hero.svg)

<p align="center">
  <a href="https://www.npmjs.com/package/free-computer-use"><img alt="npm version" src="https://img.shields.io/npm/v/free-computer-use?style=flat-square&labelColor=18251f&color=c4e967"></a>
  <a href="https://github.com/OthmaneBlial/FreeComputerUse/releases/latest"><img alt="Latest GitHub release" src="https://img.shields.io/github/v/release/OthmaneBlial/FreeComputerUse?style=flat-square&labelColor=18251f&color=c4e967"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-c4e967?style=flat-square&labelColor=18251f"></a>
  <img alt="Node.js 22.13 or newer" src="https://img.shields.io/badge/Node.js-22.13%2B-43853d?style=flat-square&labelColor=18251f">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&labelColor=18251f">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-45ba4b?style=flat-square&labelColor=18251f">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#no-model-key-needed">Try it without a model</a> ·
  <a href="#watch-a-real-run">Watch the demo</a> ·
  <a href="https://github.com/OthmaneBlial/FreeComputerUse/releases/latest">Latest release</a> ·
  <a href="https://othmaneblial.github.io/FreeComputerUse/">Project site</a> ·
  <a href="SECURITY.md">Security</a>
</p>

**Your browser. Your model. Your call.** Give your browser a goal; the model proposes short action batches, and Playwright runs them locally. You approve website access and sensitive actions, then inspect what happened.

Use an API or a supported model CLI for open-ended tasks. For common page-reading jobs, skip model setup entirely: FreeComputerUse can read visible text and links with deterministic local strategies.

## No model key needed

Install the release and start the local dashboard:

```bash
npm install --global free-computer-use@0.2.0
FCU_BROWSER_CHANNEL=chrome agent doctor
FCU_BROWSER_CHANNEL=chrome agent ui
```

Open **http://127.0.0.1:4318**, enter a page URL and one of these goals, then approve access to that website:

| Goal | Result |
| --- | --- |
| `Read the page` | Extract visible page text. |
| `Extract the links` | List visible link labels and URLs. |
| `Extract the first 5 links` | Return a bounded list of the first five links. |
| `Extract the table` | Try the synthetic [practice revenue table](https://othmaneblial.github.io/FreeComputerUse/lab/reports.html). |

These narrow workflows use local strategies and make zero model calls. General tasks need a configured provider. The declared minimum is Node.js 22.13; the verified setup is macOS 26.6 on Apple Silicon, Node 25.9.0 and system Chrome 154.0.8037.57. Other OS/browser combinations and the declared Node minimum remain unverified. See the [support matrix](docs/SUPPORT_MATRIX.md).

## Watch a real run

[![FreeComputerUse: a real practice-table extraction from the published package](assets/readme/product-demo-poster.jpg)](assets/readme/product-demo.mp4)

[Watch the 22-second dashboard walkthrough](assets/readme/product-demo.mp4) · [Watch the short portrait cut](assets/readme/product-demo-portrait.mp4)

This recording uses the 0.1.0 package. It shows the npm install, local dashboard, explicit site approval and a verified synthetic table result: three rows, one browser action and zero model calls. The same practice workflow remains available. It is a deterministic demo, not a claim about arbitrary websites.

[![Recorded browser run: investigate a synthetic API incident and save a checked report](assets/readme/incident-demo.gif)](https://othmaneblial.github.io/FreeComputerUse/#watch)

One recorded task followed six pages to a checked incident brief: **21 successful actions, 10 model calls, one repaired failure**. The configured cost estimate was **$0.00650**. This is one synthetic run, not a general success-rate claim. [Watch the full recording](https://othmaneblial.github.io/FreeComputerUse/lab/media/incident-demo.mp4) · [Inspect the evidence](assets/readme/incident-evidence.json).

## How it works

1. **Observe** the page DOM and accessible controls.
2. **Plan** a bounded batch with the model you choose.
3. **Execute** browser actions locally with Playwright; direct navigation to a new origin asks for approval.
4. **Verify** results, repair only what failed, then replay compatible learned workflows later.

The model does not run shell commands or arbitrary JavaScript. Browser previews stay local; the task and selected page context go to your configured model provider. Screenshots are not sent.

## Quick start

Requires Node.js 22.13+, npm and an installed browser. The verified setup selects installed Chrome and avoids a separate Playwright browser download.

### Install from npm

```bash
npm install --global free-computer-use@0.2.0
FCU_BROWSER_CHANNEL=chrome agent doctor
FCU_BROWSER_CHANNEL=chrome agent ui
```

Open **http://127.0.0.1:4318**. Try a keyless goal above, or configure a provider for model-planned tasks.

### Run from source

```bash
git clone https://github.com/OthmaneBlial/FreeComputerUse.git
cd FreeComputerUse
npm ci
cp .env.example .env
chmod 600 .env
```

Set `FCU_BROWSER_CHANNEL=chrome` in `.env` to use installed Chrome. For model-planned tasks, add the provider details to your local `.env`; for example:

```dotenv
FCU_BROWSER_CHANNEL=chrome
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
```

```bash
npm run agent -- doctor
npm run dev
```

Then open **http://127.0.0.1:4318**, enter a starting URL and goal, and approve site access.

## Pick your model

Use a provider API key or sign in through the official CLI for a supported subscription. API usage and consumer subscriptions are separate billing products.

| Provider | Configuration |
| --- | --- |
| OpenAI, xAI Grok, DeepSeek, Mistral or another OpenAI-compatible API | `LLM_PROVIDER=openai-compatible`; set `LLM_API_KEY`, `LLM_MODEL` and `LLM_BASE_URL` |
| Google Gemini API | OpenAI-compatible mode with `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/` and your Gemini API key |
| OpenRouter | OpenAI-compatible mode with `LLM_BASE_URL=https://openrouter.ai/api/v1` and the chosen `provider/model` slug |
| Anthropic API | `LLM_PROVIDER=anthropic`; set `LLM_API_KEY` and `LLM_MODEL` |
| ChatGPT plan | Install Codex CLI, sign in with `codex login`, set `LLM_PROVIDER=codex-subscription` |
| Claude Pro/Max plan | Install Claude Code 2.1.248+, sign in with `claude auth login` (not Console), set `LLM_PROVIDER=claude-subscription` |

DeepSeek Flash is the measured default. Other provider routes are not all live-tested. Subscription modes use local CLI sign-in, need no API key, respect plan limits, and disable their local agent tools and MCP servers while planning. See [provider setup and limits](docs/PROVIDERS.md), the [support matrix](docs/SUPPORT_MATRIX.md) and [.env.example](.env.example).

## Connect an MCP host

Run FreeComputerUse as a local MCP server over `stdio` with `agent mcp`. It exposes bounded tools to start a task, inspect the page, follow and verify results, and stop a task. Site and sensitive-action approvals still need a human response in an MCP host that supports form elicitation. No HTTP endpoint is opened. See the [MCP setup and validation limits](docs/MCP.md).

## Security and privacy

- Normal mode asks before direct navigation to a new origin and blocks private or reserved DNS answers. A loopback-only proxy connects to the vetted numeric address for browser HTTP(S) and WebSocket traffic. Ultra mode and the low-level `allowExternal` option opt out of origin and private-address checks; Ultra mode is off by default.
- Sensitive actions have a separate confirmation gate. Read the [security boundaries](SECURITY.md) before using personal or sensitive data.
- Browser execution, profiles, history and downloads stay on your machine. Selected task and page context goes to the provider you choose; screenshots are not sent.
- Planner inputs use aliases for local profile and file values, not their contents. Local data is **not encrypted** and does not expire automatically. See [storage, export, retention and deletion](docs/LOCAL_DATA.md).
- Chromium profiles disable WebRTC UDP that the proxy cannot carry. Sites that require direct UDP for voice or video may fail.

## Evidence and limits

A focused public suite recorded **18 September 2026** passed 14/14 first-run tasks and 14/14 compatible learned repeats with independent checks. First runs used 18 model calls; repeats used zero. These single-trial sandbox results do not predict success on arbitrary websites. [Report](artifacts/benchmark-public.json) · [Method and limitations](docs/BENCHMARKS.md).

Provider, operating-system, browser and accessibility evidence stays bounded to the [support matrix](docs/SUPPORT_MATRIX.md). Contract tests do not certify a live provider; builds do not certify an untested platform.

## FAQ

**Can I try it without an API key?** Yes. Use `Read the page`, `Extract the links`, `Extract the first 5 links`, or the synthetic revenue-table task. These workflows make zero model calls.

**Does the model receive screenshots or browser profiles?** No. The selected task and page context go to your provider; screenshots and browser profiles stay local. Local data is not encrypted.

**Which platform is verified?** macOS 26.6 on Apple Silicon, Node 25.9.0 and system Chrome 154.0.8037.57. Check the [support matrix](docs/SUPPORT_MATRIX.md) for exact coverage and limits.

## Explore and contribute

- [Project site and task library](https://othmaneblial.github.io/FreeComputerUse/)
- [Latest GitHub release](https://github.com/OthmaneBlial/FreeComputerUse/releases/latest)
- [Useful browser-task examples](docs/USEFUL_EXAMPLES.md)
- [Architecture](docs/ARCHITECTURE.md) · [implementation notes](docs/IMPLEMENTATION.md)
- [Local validation commands](docs/LOCAL_VALIDATION.md) · [contributing](CONTRIBUTING.md) · [changelog](CHANGELOG.md)

Useful contributions: reproducible browser tasks, safer permission scopes and checks that make results easier to trust. Keep shared examples synthetic or read-only; remove credentials and personal data from traces.

[MIT License](LICENSE) · Built with TypeScript and Playwright.
