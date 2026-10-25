# Troubleshooting and known limits

Start with `agent doctor`, then `agent providers` and
`agent providers test <id>`. Add `--debug` to `agent run` to log every
observe, plan, act, verify and repair event.

## Providers

| Symptom | Cause and fix |
| --- | --- |
| `authentication failed; check the API key` (401/403) | Wrong or revoked key. A key in the environment or `.env` wins over a stored key, so check both. Store a new one with `agent providers set-key <id>`. |
| `model not found` (404) | The account cannot use that model. Set `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`, `OPENAI_MODEL` or `--model`. `openai` has no default model. |
| 429, 5xx or 529 after retries | Rate limit or overload. Requests are already retried twice. Set `LLM_FALLBACK_PROVIDERS=deepseek,anthropic` to try another provider. |
| `Claude declined this request` | Claude refused the task. Rephrase it or use another provider. |
| `Not logged in` with `claude-subscription` | Run `claude auth login` with Claude Code 2.1.310 or newer. Older versions of this route used `--bare`, which skips the sign-in. |
| `macOS Keychain did not store the API key` | Keychain access was refused. Allow it, or set `FCU_SECRET_STORE=file`. |
| Budget limit reached | A `FCU_MAX_*` limit stopped the task. Raise it in `.env`, or pick a cheaper model. |

## Browser

| Symptom | Cause and fix |
| --- | --- |
| The browser does not start | Set `FCU_BROWSER_CHANNEL=chrome` for an installed Chrome, or run `npx playwright install chromium`. |
| `Destination resolves to a private or reserved address` | Private network addresses are blocked. For a site on your own network you trust, pass `--allow-external`. |
| The run pauses on a sign-in, CAPTCHA or "Verify it's you" page | Expected. Press **Take control**, complete it yourself, then **Resume agent**. The agent never fills these in. |
| `Human approval needs a terminal or the local UI; action rejected.` | A sensitive step needed approval without an interactive terminal. Use `agent ui`, or run in a terminal. |
| An upload does nothing while teaching | Choose the file in the menu under the preview first, then click the upload control. Files come from the local profile (**Local profile**). |

## Procedures

| Symptom | Cause and fix |
| --- | --- |
| A request does not find the procedure | Check with `agent procedures find "<request>"`. A procedure is only offered for its own site, so clear **Starting page** or set it to that site. A procedure without parameters needs the same request words. Add request words to the parameters, or use more words from the procedure's name and description. |
| A value is read wrongly from the request | Put it in quotes, or follow it with the parameter's name ("version 1.5"). Pass `--param name=value` in the terminal. |
| `Missing parameter(s): notes` | Without a terminal, missing values cannot be asked. Pass `--param notes="..."`. |
| `This procedure expects another starting state` | A precondition, such as being signed in, failed. Prepare the page and press **Resume agent**. |
| A step fails after the website changed | With a provider, the model repairs that step and the fix is saved as a new version. Without one, turn on **When stuck, pause and ask me to show the step** and do the step yourself. |
| A repair made things worse | **Procedures → View / edit → Restore** an earlier version, or `agent procedures restore <id> <version>`. |

## Known limits

- **Provider evidence.** The Anthropic API and OpenAI API routes are covered by
  request-contract tests against a local server and have not been tested live
  with a real key. Codex CLI usage is estimated. See [Providers](PROVIDERS.md#verified-on-25-october-2026).
- **Vision is a last resort and opt-in.** By default the model only sees a text
  description of the page. With `FCU_VISION=1`, the third and later repairs in a
  task add a viewport screenshot and the model can click a point. Steps that
  needed a point are not saved into procedures or learned workflows, because a
  point can hit something else next time. Only the visible viewport is sent.
- **Other interface languages.** A procedure works in a second language without
  the model only if its steps have `|` alternatives, written by you or merged
  after a successful run there. A merge only happens when the new run has the
  same steps in the same order.
- **Recording.** Teach mode records clicks, checkboxes, selections, typed text,
  uploads, Enter in a field and address-bar navigation. It does not record
  drag and drop, hovering, other keys or canvas drawing. Write those steps, or
  let the model plan them.
- **Request matching** is word-based, with English and French synonyms. Other
  languages need request words on the parameters, or an id with
  `agent procedures run <id>`.
- **Google Play.** The release procedure has run only against the local
  simulator, not the real Play Console. See [Google Play releases](GOOGLE_PLAY.md).
- **One task at a time** per dashboard. Local data, except keys stored in the
  Keychain, is not encrypted. See [Local data](LOCAL_DATA.md).
- **Approvals cannot be pre-granted.** Sensitive steps ask on every run, even in
  a procedure you recorded. Only Ultra mode (`--ultra`) skips them, and
  you have to turn it on explicitly.
