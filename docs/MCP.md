# MCP integration

FreeComputerUse can run as a local Model Context Protocol server over `stdio`.
It does not open an HTTP listener. A compatible MCP host starts the process and
exposes four tools:

| Tool | Purpose |
| --- | --- |
| `start_task` | Start one user-requested task with the configured provider and normal safety policy. |
| `inspect_page` | Read the latest observed page for a task; does not navigate or act. |
| `follow_task` | Follow progress and receive a human approval request when needed; reports the verified result. |
| `stop_task` | Stop an active task without changing permissions. |

`start_task` accepts only a goal and an HTTP(S) URL. It does not accept an
approval policy, Ultra mode, arbitrary action list or permission override. The
existing Agent handles site access and sensitive-action approvals. The MCP
server asks the host to collect a human decision through form elicitation; it
has no `approve` tool. Missing, invalid, declined or expired responses reject
the pending operation. Approval expires after ten minutes, and only one browser
task can run at a time.

The host must support local `stdio` servers and form elicitation. Page content
is untrusted. FreeComputerUse sends task/page context to the provider configured
in its local environment; results also pass through the MCP host. Browser
profiles, history and downloads stay in the configured local data directory.
Do not add API keys to an MCP config or share the MCP process with an
untrusted host.

## Run from a source checkout

Use Node.js 22.13 or later, npm and an installed browser. The checked platform
is macOS 26.6 on Apple Silicon with Node 25.9.0 and system Chrome 154.0.8037.57.
Other platforms and browser combinations remain unverified.

```sh
git clone https://github.com/OthmaneBlial/FreeComputerUse.git
cd FreeComputerUse
npm ci
npm run build
```

Add the local command to the MCP host's server configuration. Replace both
paths with the absolute path to your checkout:

```json
{
  "mcpServers": {
    "free-computer-use": {
      "command": "node",
      "args": ["/absolute/path/FreeComputerUse/dist/cli/index.js", "mcp"],
      "cwd": "/absolute/path/FreeComputerUse",
      "env": {
        "FCU_BROWSER_CHANNEL": "chrome",
        "FCU_DATA_DIR": "/absolute/path/free-computer-use-data"
      }
    }
  }
}
```

The `.env` file is read from `cwd`; follow [provider setup](PROVIDERS.md) to
configure a provider. The `FCU_DATA_DIR` must be a dedicated local directory,
not the workspace or a shared system directory. Restart the host after changing
its MCP configuration.

When asked to approve a site or sensitive action, inspect the displayed origin
and operation. Explicitly confirm only actions you intended. A refusal stops
the pending action. To stop a running task, call `stop_task`.

## Validation status

The local tests use the official TypeScript MCP client SDK. They cover bounded
tool discovery, task execution against synthetic local pages, site and
sensitive-form approvals, refusal before the site receives a request, malformed
URL rejection, and the modern `stdio` transport. A live UI check also connected
the built CLI to MCP Inspector 2.8.0 over `stdio`, displayed the site's form
elicitation and declined it. The task failed safely with zero model calls and
zero requests to the local fixture. This verifies the reference client only;
compatibility with other desktop agent hosts remains unverified. The npm
package is not published; use the source checkout until a public installation
is verified.
