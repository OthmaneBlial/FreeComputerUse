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

Measured 2026-10-25T13:44Z with real deepseek-flash (DeepSeek API), Node v25.9.0,
Playwright 1.63.0 and Chrome, on the local Play Console simulator
(`fixtures/playConsole.ts`, not Google software). Run it with
`npm run benchmark:procedures`. The report is in
[`artifacts/benchmark-procedures.json`](../artifacts/benchmark-procedures.json).
Costs use DeepSeek's peak prices ($0.30 per million input tokens on a cache
miss, $0.006 on a cache hit, $1.20 per million output tokens) and the cache hits
the API reported.

The task publishes a production release: open the app, Test and release,
Production, create a release, upload the bundle, add the notes, review, Save and
publish, then Send changes for review. The model explores the first run. Its
steps are saved as a procedure with three parameters (app, bundle, notes), and
every later run replays it with a new bundle and new notes. A run counts as
correct only if the simulator holds that version code in review. That is read
from the simulator's state, not from the agent's report.

| Run | Interface | Result | Model calls | Input / output tokens | Cost | Time |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 1. First run, the model explores | English | In review | 8 | 16,735 / 619 | $0.00208 | 45.8 s |
| 2. Replay with new values | English | In review | 0 | 0 | $0 | 2.7 s |
| 3. Replay after a minor UI change | English, variant 2 | In review | 4 | 8,601 / 192 | $0.00097 | 17.8 s |
| 4. Replay again | English, variant 2 | In review | 0 | 0 | $0 | 2.7 s |
| 5. Replay on a French interface | French | In review | 7 | 15,732 / 480 | $0.00221 | 31.6 s |
| 6. Replay again | French | In review | 0 | 0 | $0 | 2.8 s |
| 7. Back to the original interface | English | In review | 0 | 0 | $0 | 2.6 s |
| 8. French again | French | In review | 0 | 0 | $0 | 2.7 s |
| 9. English again | English | In review | 0 | 0 | $0 | 2.6 s |

All nine runs were correct. Together they used 19 model calls and cost $0.0053.

- **Replay:** zero model calls and zero tokens, against 17,354 tokens for the
  first run.
- **Minor UI change** (variant 2 renames "Next" to "Review release", changes a
  label, capitalisation and an id, and adds a banner): the model repaired only the
  broken steps. That took 4 calls and 50% of the first run's tokens. The repaired
  version then replayed with zero calls.
- **Another language:** the first French run repaired two steps, then planned
  the rest from the page, guided by the saved steps. That took 7 calls and 93% of
  the first run's tokens. The saved version then kept both targets for every step
  and both success texts ("In review" or "En cours d'examen"). Runs 6 to 9 switch
  languages with zero calls.
- **Approvals:** every run asked before Save and publish and before Send changes
  for review. A saved procedure does not pre-authorize them. The benchmark
  approves them automatically because the simulator is local.

Variance and earlier trials: three earlier full trials that day used 8 or 9
calls and 16,767 to 19,121 input tokens for the first run, 4 or 5 calls for the
minor UI change, and 7 or 8 calls for the first French run. Those trials also
exposed two bugs, both now fixed and covered by tests:

- French replays were marked failed although the release was in review. The
  re-plan had copied the English success text, and a correction of it was
  ignored.
- Switching back and forth between languages kept needing 3 to 5 calls, because
  versions were merged only when their steps had exactly the same shape.

Limits: this is one task on one simulator with one model. Each row is a single
trial. The times come from a laptop and include the simulator's 1.2 s bundle
processing. The real Play Console has not been tested.

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
