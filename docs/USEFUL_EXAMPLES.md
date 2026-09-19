# Useful browser examples

Open the [task library](https://othmaneblial.github.io/FreeComputerUse/lab/index.html),
choose **Real websites** or **Practice workflows**, expand a card, and copy its
goal. Paste its starting URL and goal into <http://127.0.0.1:4318>. Normal mode
waits for your website approval before navigating. Watch the actual browser
pointer, progressive typing and clicks; **Full screen** enlarges the browser and
keeps approvals and controls visible. **Execution log** opens the event stream.
**View result** presents facts and tables instead of raw JSON. Copy its summary
or save a standalone HTML report. Original site exports remain available under
Saved files only after a successful download. A stopped/failed task shows a
partial result. Toolbar arrows let you scroll the real page while idle or paused;
the agent brings action targets fully into view before clicking.

The practice site is a fictional Northstar workspace. Its filters, dialogs, file
exports and saved state operate in the browser. No messages, bookings, purchases,
real account creation or remote account changes occur.

## Three actual multi-page practice flows

These are separate HTML documents and browser navigations, rather than hidden
panels with a changed URL. Filters and shortlists survive navigation within the
flow. Starting pages use `workspace.html?view=…` under the lab URL.

| Flow | Document sequence | Result checked independently |
| --- | --- | --- |
| Product research | Catalogue → `product-details.html?id=trail` → catalogue → `product-comparison.html` | Wireless, in-stock keyboards under EUR 100; Trail K2 and Summit Air; battery, weight, prices and exported CSV bytes |
| Journey planning | Search → `journey-results.html` → route details dialog → `itinerary.html` | Paris–Lyon, 2026-10-15, two adults, step-free/refundable, at most one change; Flex Regional EUR 90; local saved itinerary and downloaded file |
| Invoice retrieval | Filtered invoices → `invoice-details.html?id=INV-2609-04` → download | Atlas Studio, September, overdue, Maya Chen; exactly one matching invoice; EUR 180 + EUR 60 = EUR 240 and the actual downloaded contents |

Three further practice cases exercise scoped analytics, dependent preferences
with review/save/reload, and finding the newest finance document before download.
They test realistic interactions within one page and dialogs.

## Quarter-close audit: six documents, one defensible decision

The new Northstar quarter-close case starts at
`workspace.html?view=close`. It moves through **six actual HTML documents**:

`scope → revenue → booked ledger → pending adjustment → policy → review`.

Choose **Q3 2026 / Direct**. The revenue report shows EUR 9,400, while the
posted ledger contains EUR 9,300. The EUR 100 difference matches ADJ-042, but
that adjustment is still pending. The policy says every non-zero difference
needs human review, even at EUR 100. A correct review draft must therefore use
**Needs review**, keep the adjustment separate from booked totals, and download
`northstar-close-review.txt`. Incorrect figures or a premature "Ready to close"
decision are rejected by the practice site.

The [authored-plan run](../artifacts/benchmark-complex-authored-close.json)
checks the selected scope, extracted source values, every document visit,
saved review state and actual downloaded file bytes. It also replays the
compatible workflow with no model provider. This validates execution and reuse.
The [separate live Flash trial](../artifacts/benchmark-complex-live-close.json)
completed with 24 successful actions, two repaired failures, 11 model calls,
30,841 tokens and a configured-price estimate of $0.00650. Its compatible
repeat passed with zero model calls. Earlier failures with tighter budgets and
the pre-fix export handling are preserved as separate reports; one controlled
success is not a general website success rate.

The longer case may need the current `48000` input-token / `14` model-call
ceilings. If an older local `.env` still has `20000` / `10`, adjust those two
values before trying it. These are maximums, not tokens spent by default;
the dashboard shows actual usage and the configured cap.

## Incident desk: compare the signal before writing a brief

Start at `workspace.html?view=incident`. The six-document sequence is
`alert queue → incident timeline → request metrics → deployments → runbook → local brief`.
Filter to **API Gateway / High / Last 24 hours** so INC-204 is isolated. The
timeline places deployment `dep-7c3` at 09:58 UTC and the alert at 10:04.
For `/v1/search`, the 429 rate rises from **0.4% to 12.4%**. The prior stable
deployment used `burst_limit=100`; `dep-7c3` uses `20`. The runbook asks for
**Needs engineer review**, not an automatic rollback or a claim of proven
causality. The final page rejects the wrong endpoint, figures, deployment or
decision. A valid local draft downloads as `northstar-incident-brief.txt`.

The [authored-plan report](../artifacts/benchmark-complex-authored-incident.json)
verifies filtered state, source extracts, all document visits, the saved draft
and actual file bytes, then repeats without a provider. The
[separate live Flash trial](../artifacts/benchmark-complex-live-incident.json)
passed with 23 successful actions, two repaired failures, 12 model calls,
35,968 tokens and a configured-price estimate of $0.00818. Its compatible
repeat used zero model calls. One controlled trial does not establish a
general success rate or prove that a real deployment caused a real incident.

## Ten researched tasks on real free websites

Research checks public sources and the task design. It does not by itself prove
that our agent completes a task. Trial results are recorded separately in the
[real-world report](../artifacts/benchmark-real-world.json). Untested cards say so.

| Need | Starting website and source | Why it is useful |
| --- | --- | --- |
| Audit a software dependency | [GitHub / Playwright](https://github.com/microsoft/playwright) | Inspect latest stable release, licence and security policy across documents |
| Shortlist a small local model | [Hugging Face / Qwen3](https://huggingface.co/Qwen/Qwen3-0.6B) | Compare cards, configs and sharded weight listings; distinguish weight size from total repository size |
| Check free hosting quotas | [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | Collect Workers, static-assets and D1 limits for a concrete prototype workload |
| Check browser compatibility | [MDN / structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone) | Compare three reference tables and follow a fallback guide; hydrated tables remain a stretch case |
| Compare laptops for two monitors | [Apple Mac comparison](https://www.apple.com/mac/compare/) | Change three model selectors and verify display limitations in support articles |
| Find a usable EV dataset | [Data.gov](https://catalog.data.gov/) | Search, filter and collect publisher/licence/resource metadata and the exact CSV URL |
| Prepare a statistics brief | [GOV.UK / National Travel Survey 2024](https://www.gov.uk/government/statistics/national-travel-survey-2024) | Navigate to the factsheet, extract measures and scope, return and collect its PDF URL |
| Compare accessible London routes | [TfL journey planner](https://tfl.gov.uk/plan-a-journey/) | Autocomplete, departure time, accessibility preferences and route legs; complete route generation remains untested |
| Find a suitable reading edition | [Wikisource / Jane Austen](https://en.wikisource.org/wiki/Author:Jane_Austen) | Follow the bibliography, compare editions, count chapter links and verify destinations |
| Inventory city-service data | [Data.gov / Philadelphia 311](https://catalog.data.gov/dataset/311-service-and-information-requests) | Compare two catalogue records, coverage, update fields and downloadable-resource URLs |

These external goals are for public reading/research. They do not authorize
messaging, buying, signing in or modifying real accounts. Large datasets and model
weights are inspected as links/listings, without downloads. Inline PDFs are
returned as URLs: clicking them is not advertised as a guaranteed download.
Sites that block automation are excluded; challenges are not bypassed.

Detailed source evidence: [consumer research](../research_useful_browser_tasks/findings_consumer.md)
and [professional research](../research_useful_browser_tasks/findings_professional.md).

## Run checks locally

```bash
npm run lab:build
npm run lab:serve                 # http://127.0.0.1:4319/lab/
npm run lab:smoke                 # 24 screens, desktop/mobile, console and overflow
npm run ui:results                # authored local journey: cards, cursor, visible controls
npm run benchmark:complex         # supplied action plans; no model-planning claim
npm run benchmark:complex -- --live  # real Flash planning; spends API tokens
npm run benchmark:real            # real GitHub/GOV.UK trials; spends API tokens
npm run validate                  # local checks only; GitHub CI is disabled
```

Each complex execution test checks state, extracted rows and file bytes, then
repeats a compatible learned workflow with no provider installed. Each live trial
reports correctness, model calls, tokens, cost estimates, repairs and repeat
outcomes. Historical failed trials remain visible; individual passes are not a
general success-rate claim.

The [aggregate authored report](../artifacts/benchmark-complex-authored.json)
covers all eight practice workflows. The two long cases also have separate
real-Flash reports linked above. Supplied action plans and real model plans are
not interchangeable evidence.
