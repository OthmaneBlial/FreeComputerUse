<h1><img src="docs/brand-mark.svg" alt="" width="40" height="40" align="absmiddle"> FreeComputerUse</h1>

![FreeComputerUse — a local-first browser agent that plans, acts and verifies with you in control](assets/readme/hero.svg)

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-c4e967?style=flat-square&labelColor=18251f"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&labelColor=18251f">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-45ba4b?style=flat-square&labelColor=18251f">
  <img alt="Local-first" src="https://img.shields.io/badge/local--first-browser_runs-c4e967?style=flat-square&labelColor=18251f">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://othmaneblial.github.io/FreeComputerUse/">Project site</a> ·
  <a href="https://othmaneblial.github.io/FreeComputerUse/lab/index.html">Try the task lab</a> ·
  <a href="SECURITY.md">Security</a>
</p>

**Your browser. Your model. Your call.** Tell it what done looks like, then stay in control of every step.

FreeComputerUse is a local-first AI browser automation agent. A model plans small action batches; TypeScript and Playwright execute and verify them in your browser. Compatible workflows can be learned once and replayed later with **zero model calls**.

## Watch a real run

[![A real browser run: investigate a synthetic API incident and save a checked report](assets/readme/incident-demo.gif)](https://othmaneblial.github.io/FreeComputerUse/#watch)

One goal led through six pages to a verified incident brief: **21 successful actions, 10 model calls, one repaired failure**. The configured cost estimate was **$0.00650**. This is one recorded synthetic task, not a general success-rate claim. [Watch the full recording](https://othmaneblial.github.io/FreeComputerUse/lab/media/incident-demo.mp4) · [Inspect the evidence](assets/readme/incident-evidence.json).

## How it works

1. **Observe** the page’s DOM and accessible controls.
2. **Plan** a bounded batch with the model you choose.
3. **Execute** browser actions locally with Playwright; direct navigation to a new origin asks for approval.
4. **Verify** results, repair only what failed, then reuse compatible learned workflows.

The model does not run shell commands or arbitrary JavaScript. Browser previews stay local; the goal and selected page context are sent to your configured model provider.

## Quick start

Requires **Node.js 22.13+**, npm and an installed browser. The verified first-run setup is macOS 26.6 (Apple Silicon), Node 25.9.0 and system Chrome 154.0.8037.57. The declared Node minimum and other OS/browser combinations remain unverified. This setup selects installed Chrome and avoids a separate Playwright browser download; see the [support matrix](docs/SUPPORT_MATRIX.md) for the full-suite limitation.

```bash
git clone https://github.com/OthmaneBlial/FreeComputerUse.git
cd FreeComputerUse
npm ci
cp .env.example .env
chmod 600 .env
```

Set `FCU_BROWSER_CHANNEL=chrome` in `.env` to use the verified installed-Chrome path without downloading a browser binary.

For model-planned tasks, configure a provider in `.env`. The browser sandbox task below works without a model key:

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

Open **http://127.0.0.1:4318**, enter a starting URL and goal, then approve site access.

**Try it without an API key:** open [the practice revenue table](https://othmaneblial.github.io/FreeComputerUse/lab/reports.html) and run the goal `Extract the table`. This narrow workflow has a deterministic local strategy; general tasks need a model provider.

## Pick your model

Use a provider API key, or sign in through the official CLI for a supported subscription. API usage and consumer subscriptions are separate billing products.

| Provider | Configuration |
| --- | --- |
| OpenAI, xAI Grok, DeepSeek, Mistral or another OpenAI-compatible API | `LLM_PROVIDER=openai-compatible`; set `LLM_API_KEY`, `LLM_MODEL` and `LLM_BASE_URL` |
| Google Gemini API | OpenAI-compatible mode with `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/` and your Gemini API key |
| OpenRouter | OpenAI-compatible mode with `LLM_BASE_URL=https://openrouter.ai/api/v1` and the chosen `provider/model` slug |
| Anthropic API | `LLM_PROVIDER=anthropic`; set `LLM_API_KEY` and `LLM_MODEL` |
| ChatGPT plan | Install Codex CLI, sign in with `codex login`, set `LLM_PROVIDER=codex-subscription` |
| Claude Pro/Max plan | Install Claude Code 2.1.248+, sign in with `claude auth login` (not Console), set `LLM_PROVIDER=claude-subscription` |

The provider API routes have not all been live-tested here; DeepSeek Flash is the measured default. Subscription modes use the local CLI sign-in, need no API key and respect plan limits. Their local agent tools and MCP servers are disabled while planning. See [provider setup and limits](docs/PROVIDERS.md), the [support matrix](docs/SUPPORT_MATRIX.md) and [.env.example](.env.example) for route-specific setup, tests and live-evidence status.

## Control and privacy

- Normal mode asks before direct navigation to a new origin and blocks hostnames resolving to private or reserved address ranges, including private IPv4 embedded in a discovered NAT64 prefix. A loopback-only proxy connects to the vetted numeric address, closing the DNS lookup-to-connection rebinding gap for browser HTTP(S) and WebSocket traffic. Explicit IP destinations require an exact origin grant. Ultra mode and the low-level `allowExternal` option opt out of origin and private-address checks. Chrome 154 tests cover redirect denial, simulated DNS rebinding, approved/blocked plain WebSockets, and approved/blocked browser-originated WSS. The WSS fixture uses a generated local certificate and ignores its certificate error only in the test; a separate opt-in smoke verifies Chrome TLS and an echo against one public WSS endpoint. Other WSS endpoints, live network-specific NAT64 discovery and other browser builds remain unverified. Sensitive actions have a separate confirmation gate. Ultra mode is explicit and off by default.
- Browser execution, profiles, history and downloads stay on your machine. Page context needed for a plan goes to the chosen model provider; screenshots are not sent.
- The planner receives aliases for local profile and file values, not their contents. Local storage is **not encrypted**.
- Chromium profiles disable WebRTC UDP that the proxy cannot carry. Sites needing direct UDP for voice/video may fail; the local Chrome STUN fixture confirms no direct packet reached its receiver. Other WebRTC and non-HTTP behavior remains under validation.
- Runs record actions, checks, repairs, token estimates and workflow reuse so you can inspect what happened.

Read [the security boundaries](SECURITY.md) before using personal or sensitive data.
See [where local data is stored and how to inspect, export or delete it](docs/LOCAL_DATA.md).

## Evidence

In a focused public suite recorded **18 September 2026**, 14/14 first-run results and 14/14 compatible learned repeats passed independent checks. First runs used 18 model calls; repeats used zero. These single-trial sandbox results do not predict success on arbitrary websites. [Report](artifacts/benchmark-public.json) · [Method and limitations](docs/BENCHMARKS.md).

## Explore and contribute

- [Project site and task library](https://othmaneblial.github.io/FreeComputerUse/)
- [Useful browser-task examples](docs/USEFUL_EXAMPLES.md)
- [Implementation notes](docs/IMPLEMENTATION.md)
- [Local validation commands](docs/LOCAL_VALIDATION.md)

Useful contributions: reproducible browser tasks, safer permission scopes and checks that make results easier to trust. Keep shared examples synthetic or read-only; remove credentials and personal data from traces.

[MIT License](LICENSE) · Built with TypeScript and Playwright.
