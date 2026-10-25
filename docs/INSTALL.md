# Install and permissions

## Requirements

- Node.js 22.13 or newer, and npm.
- A Chromium browser. An installed Chrome or Edge works with
  `FCU_BROWSER_CHANNEL=chrome` (or `msedge`). Otherwise run
  `npx playwright install chromium` once.
- A model provider for new tasks: an API key, or a signed-in Claude Code or Codex
  CLI. See [Providers](PROVIDERS.md). Saved procedures replay without one.

Tested platforms and versions are listed in the [support matrix](SUPPORT_MATRIX.md).

## Install

From npm:

```sh
npm install --global free-computer-use
FCU_BROWSER_CHANNEL=chrome agent doctor
```

From source:

```sh
git clone https://github.com/OthmaneBlial/FreeComputerUse.git
cd FreeComputerUse
npm ci
cp .env.example .env && chmod 600 .env
npm run agent -- doctor
```

From source, put `npm run agent --` in front of the commands below, as in
`npm run agent -- ui`.

## Configure a provider

Store a key (it is read from the terminal and never echoed):

```sh
agent providers set-key anthropic     # or deepseek, openai
agent providers test anthropic        # one minimal real request
```

Or put the settings in `.env`. A minimal example:

```sh
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
FCU_BROWSER_CHANNEL=chrome
FCU_DATA_DIR=.fcu
# Optional limits for one task
FCU_MAX_LLM_CALLS=40
FCU_MAX_DURATION_MS=600000
```

[`.env.example`](../.env.example) lists every setting. For a Claude Pro/Max or ChatGPT plan, sign in
with `claude auth login` or `codex login` and set `LLM_PROVIDER` to
`claude-subscription` or `codex-subscription`.

## Launch

| What | Command |
| --- | --- |
| Dashboard on http://127.0.0.1:4318 | `agent ui` (`--port 5000`, `--headed` to also show the browser window) |
| One task in the terminal | `agent run "Find the pricing page" https://example.com --headed` |
| Saved procedures | `agent procedures`, `agent procedures run "<request>"` |
| Teach a procedure | `agent procedures teach <url> --name "..."` |
| MCP server for an MCP host | `agent mcp` |
| Check the setup | `agent doctor`, then `agent doctor --api` for one real provider request |

## System permissions

FreeComputerUse drives its own browser through Playwright. It does not control
your desktop, mouse or other apps, so it needs **no** Accessibility, Screen
Recording or Input Monitoring permission on macOS, and no equivalent elsewhere.

| Resource | What it uses | Notes |
| --- | --- | --- |
| Keychain (macOS) | Generic passwords under the service `free-computer-use` | Used by `providers set-key` and the dashboard key field. macOS may ask you to allow access. Set `FCU_SECRET_STORE=file` to use a private file instead. |
| Files | `FCU_DATA_DIR` (default `.fcu`), mode 0700 | Browser profile, history, procedures, downloads, and the file key store (0600). `.env` is tightened to 0600. |
| Network | Dashboard on `127.0.0.1` only | The browser goes through a local guard proxy. Each new site needs your approval, and private network addresses are blocked unless you allow them. |
| Files you upload | Paths you give as a `{{files.alias}}` profile entry or a file parameter | Only those files can be attached. Their paths are never sent to the model. |

What leaves your machine: the task and a compressed text description of the
page go to the provider you chose. Screenshots are not sent. See
[Local data](LOCAL_DATA.md) for storage and deletion, and the
[threat model](THREAT_MODEL.md).

## Next steps

- [Teach a procedure](TEACH.md)
- [Google Play releases](GOOGLE_PLAY.md)
- [Troubleshooting and known limits](TROUBLESHOOTING.md)
