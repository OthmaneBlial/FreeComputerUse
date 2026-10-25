# Measured validation

Provider-by-provider implementation, automated-test and live-evidence status is
tracked in the [support matrix](SUPPORT_MATRIX.md). This report records the
specific dated trials below; it does not establish general provider or website
compatibility.

Public suite measured 2026-09-18T16:52:19.246Z using real deepseek-flash, Node v25.9.0, Playwright 1.63.0.

14/14 public tasks passed their independent result checks. 14/14 compatible learned repeats passed with no provider installed and zero model calls. First runs used 30 successful browser actions, 18 model calls and 31,654 total tokens. Configured-price estimate: $0.006109 for those first runs.

| Scenario | Correctness | Actions | Calls | Tokens | Execution repairs | Learned repeat |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Product comparison / Books to Scrape | Pass | 1 | 1 | 3772 | 0 | Pass / 0 |
| Travel search / BlazeDemo | Pass | 4 | 1 | 1687 | 0 | Pass / 0 |
| Dashboard tables / The Internet | Pass | 1 | 1 | 2054 | 0 | Pass / 0 |
| Dropdown setting / The Internet | Pass | 1 | 1 | 1435 | 0 | Pass / 0 |
| Dynamic loading / The Internet | Pass | 3 | 1 | 1482 | 0 | Pass / 0 |
| Structured research / Quotes to Scrape | Pass | 1 | 1 | 2201 | 0 | Pass / 0 |
| Invoice download / public Northstar lab | Pass | 1 | 1 | 1470 | 0 | Pass / 0 |
| Revenue extraction / public Northstar lab | Pass | 1 | 1 | 1573 | 0 | Pass / 0 |
| Local preferences / public Northstar lab | Pass | 3 | 1 | 1657 | 0 | Pass / 0 |
| Persistent session / public Northstar lab | Pass | 1 | 1 | 1510 | 0 | Pass / 0 |
| Dynamic modal / public Northstar lab | Pass | 4 | 2 | 3123 | 0 | Pass / 0 |
| Embedded form / public Northstar lab | Pass | 3 | 1 | 1686 | 0 | Pass / 0 |
| Multiple tabs / public Northstar lab | Pass | 5 | 3 | 4936 | 1 | Pass / 0 |
| DOM repair / public Northstar lab | Pass | 1 | 2 | 3068 | 1 | Pass / 0 |

## Procedures and token savings

Measured on 25 October 2026 with Node v25.9.0, Playwright 1.63.0 and Chrome, on
the local Play Console simulator (`fixtures/playConsole.ts`, not Google
software). Run it with `npm run benchmark:procedures`. Each run of the script
adds a trial to `artifacts/benchmark-procedures-<model>.json`:
[DeepSeek](../artifacts/benchmark-procedures-deepseek-flash.json),
[Claude](../artifacts/benchmark-procedures-Claude-subscription.json),
[Codex](../artifacts/benchmark-procedures-Codex-subscription.json).
DeepSeek costs use its peak prices ($0.30 per million input tokens on a cache
miss, $0.006 on a cache hit, $1.20 per million output tokens) and the cache hits
the API reported.

The task publishes a production release: open the app, Test and release,
Production, create a release, upload the bundle, add the notes, review, Save and
publish, then Send changes for review. The model explores the first run. Its
steps are saved as a procedure with three parameters (app, bundle, notes), and
every later run replays it with a new bundle and new notes. A run counts as
correct only if the simulator holds that version code in review. That is read
from the simulator's state, not from the agent's report.

### DeepSeek (`deepseek-flash`), three trials

Each cell lists the three trials in order.

| Run | Interface | Correct | Model calls | Input + output tokens | Cost |
| --- | --- | :---: | ---: | ---: | ---: |
| 1. First run, the model explores | English | 3 of 3 | 9, 8, 8 | 19,521, 17,360, 17,433 | $0.0025, $0.0021, $0.0021 |
| 2. Replay with new values | English | 3 of 3 | 0, 0, 0 | 0 | $0 |
| 3. Replay after a minor UI change | English, variant 2 | 3 of 3 | 3, 4, 4 | 6,456, 8,839, 8,786 | $0.0007, $0.0010, $0.0010 |
| 4. Replay again | English, variant 2 | 3 of 3 | 0, 0, 0 | 0 | $0 |
| 5. Replay on a French interface | French | 3 of 3 | 6, 8, 7 | 13,970, 18,613, 16,085 | $0.0020, $0.0026, $0.0022 |
| 6. Replay again | French | 3 of 3 | 0, 0, 0 | 0 | $0 |
| 7. Back to the original interface | English | 3 of 3 | 0, 0, 0 | 0 | $0 |
| 8. French again | French | 3 of 3 | 0, 0, 0 | 0 | $0 |
| 9. English again | English | 3 of 3 | 0, 0, 0 | 0 | $0 |

All 27 runs were correct. A trial used 18 to 20 model calls and cost $0.0052 to
$0.0057. A first run took about 46 s; a replay took 2.6 to 2.8 s.

### Claude (Claude Code subscription, `claude-opus-5-5`), one trial

| Run | Correct | Model calls | Input + output tokens |
| --- | :---: | ---: | ---: |
| 1. First run, the model explores | Yes | 9 | 39,055 |
| 3. Replay after a minor UI change | Yes | 4 | 17,709 |
| 5. Replay on a French interface | Yes | 7 | 30,378 |
| 2, 4, 6, 7, 8 and 9. Every other replay | Yes | 0 | 0 |

All nine runs were correct, with 20 model calls in total. Claude Code reports
more input tokens than DeepSeek for the same task, because its count includes
the CLI's own instructions. A subscription has no per-token price here.

### Codex (Codex CLI with a ChatGPT plan)

With the default 60 s per call, the first run failed twice. Most calls answered
in 5 to 9 s, but about one call in five waited 2.5 minutes or more. Reasoning
effort was `none` and token counts were normal, so the wait was on the service
side, and the retry of a stalled call waited too.

With `FCU_CLI_TIMEOUT_MS=300000` and a 30-minute task limit, one trial
(`gpt-6.1-sol`, reasoning effort `none`):

| Run | Correct | Model calls | Input + output tokens |
| --- | :---: | ---: | ---: |
| 1. First run, the model explores | Yes | 12 | 110,810 |
| 3. Replay after a minor UI change | Yes | 3 | 27,707 |
| 5. Replay on a French interface | Yes | 9 | 83,292 |
| 2, 4, 6, 7, 8 and 9. Every other replay | Yes | 0 | 0 |

All nine runs were correct, with 24 model calls in total. Codex CLI reports
more input tokens than DeepSeek for the same task, because its count includes
the CLI's own instructions.

### What the numbers show

- **Replay:** zero model calls and zero tokens, against 17,000 to 20,000 tokens
  for a first run.
- **Minor UI change** (variant 2 renames "Next" to "Review release", changes a
  label, capitalisation and an id, and adds a banner): the model repaired only
  the broken steps. That took 3 or 4 calls and 37% to 51% of the first run's
  tokens. The repaired version then replayed with zero calls.
- **Another language:** the first French run repaired two steps, then planned
  the rest from the page, guided by the saved steps and checks. That took 6 to 8
  calls, about as many tokens as a first run. The saved version then kept both
  targets for every step and both success texts ("In review" or "En cours
  d'examen"). Runs 6 to 9 switch languages with zero calls.
- **Approvals:** every run asked before Save and publish and before Send changes
  for review. A saved procedure does not pre-authorize them. The benchmark
  approves them automatically because the simulator is local.

### Bugs these trials found, now fixed and covered by tests

- French replays were marked failed although the release was in review. A
  re-plan had copied the English success text and its correction was ignored.
  With Claude, a repair handed over to new plans without a re-plan, so the
  translated text never reached the saved check.
- Switching back and forth between languages kept needing 3 to 5 calls, because
  versions were merged only when their steps had exactly the same shape.
- A single hung Codex CLI call failed a whole run; it is now retried once.

Earlier trials on older code that day also had one DeepSeek run stopped by the
repeated-action guard after the release was already in review. It was reported
as failed, not as done. That did not recur in the trials above.

Limits: one task on one simulator. Three DeepSeek trials, one Claude trial and
one Codex trial are a small sample. The times come from a laptop and include the simulator's
1.2 s bundle processing. On the real Play Console, only the signed-out start has
been checked (see [Google Play](GOOGLE_PLAY.md)).

## Local integration suite

Measured 2026-09-18T16:52:23.922Z: 6/6 tasks and 6/6 provider-free learned repeats passed. First runs used 31 actions, 10 model calls and 16,392 tokens. Cases include synthetic search, contact form, travel wizard, product filtering, a multi-page application with upload/approval, and changed-control recovery.

## Method and limitations

Every scenario requires deterministic final conditions plus an independent oracle for extracted data, field values, saved settings, file bytes or browser/session outcome. Runtime completion alone is not accepted as task correctness. A repeat uses the same goal and compatible starting page; no general site-transfer claim is made. Website approvals remain enabled and are explicitly handled by the harness for its selected sandbox origin.

External sites are read-only scraping/automation sandboxes. Forms, settings, session login and injected DOM changes use our own synthetic lab. No messages to people, purchases, real accounts or real account changes occur. The session case manually seeds a fake session, then checks persistent cookies and localStorage after browser restart without logging in again.

One measured trial per case. Individual failures during development led to fixes for table row extraction, downloads, popup timing, schema correction and the demo cookie's expiry; these results describe the final trial, not all development attempts or a general success rate. The live JSON reports remain the source of truth. Execution repair counts do not include provider schema-correction calls; those calls are included in total calls/tokens.

Costs use configured peak rates ($0.30/M uncached input, $0.006/M cached input, $1.20/M output), verified against the [provider pricing page](https://api-docs.deepseek.com/quick_start/pricing/) on 2026-09-18. These are conservative estimates, not billing receipts; off-peak charges can be lower. Context reduction varies by site. Decorative CSS intentionally enlarged the original local/static fixtures used for the earlier measurements above; the redesigned public lab now uses shared styling. No screenshot-agent baseline, benchmark savings percentage or universal success rate was measured.

## Complex styled workflows and real-world research

The new lab has six complex browser-only practice cases. Three use separate HTML
documents: product details/comparison, journey results/itinerary, invoice details.
Local execution tests supply validated action plans, check independent data/state/
download oracles, and repeat all six without a provider. This validates execution
and reuse, not model planning.

Real Flash trials are in [the complex report](../artifacts/benchmark-complex-live.json)
and the dated subset reports beside it. Outcomes vary across trials; failures from
strict schema validation, guessed controls, intermediate criteria and budget
limits remain recorded. Do not substitute an earlier pass for a later failure.
All listed cases have independent correctness checks; a runtime completion alone
does not establish correctness.

[Real-world trials](../artifacts/benchmark-real-world.json) run the full sourced
GitHub and GOV.UK goals without supplied plans. GOV.UK completed and repeated
without a provider. The GitHub audit remained unsuccessful in the recorded trial,
including a repeated extraction loop. Other researched website goals are source
checks, not completed-agent evidence. See [the examples guide](USEFUL_EXAMPLES.md).

Reproduce with npm run benchmark -- --live and npm run benchmark:public. Both opt into API spend. Public selection: npm run benchmark:public -- --only=travel. Reports: [public](../artifacts/benchmark-public.json), [local](../artifacts/benchmark-live.json), [earlier demo measurements](../artifacts/demo-measurements.json).
