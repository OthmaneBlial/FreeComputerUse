# Useful professional browser tasks

Source research performed 2026-09-18 using five searches and primary-site opens.
The pages below were accessible through the research browser without signing in.
This verifies sources and designs tasks; **none of these workflows was run through
our agent**. Search widgets, hydration, bot challenges and browser rendering remain
separate agent-validation questions. All proposed tasks are read-only.

## 1. Evaluate a dependency before adopting it — preferred

Starting URL: <https://github.com/microsoft/playwright>

Ready-to-paste goal:

> Audit Playwright from its public GitHub repository. Open Releases and identify
> the latest stable release, its date and its first three major changes. Then open
> LICENSE and the Security policy. Extract the version, date, change headings,
> license name and security-reporting route, with source URLs. Do not download
> release assets, sign in, star, fork, post or send a report.

Visible interaction sequence: repository → Releases → release detail → Code →
LICENSE → Security → policy; scroll within each document; extract several pieces
of evidence. This resembles a real dependency adoption review.

Expected output snapshot: v1.63.0; September 4; headings covering test locks,
locating across frames and visible-only locators; Apache 2.0; vulnerabilities
should be reported through Microsoft’s security channel rather than public issues.
The public policy identifies a reporting form and an email; reading these is not
authorization to use them. [Release](https://github.com/microsoft/playwright/releases/tag/v1.63.0),
[license](https://github.com/microsoft/playwright/blob/main/LICENSE),
[policy](https://github.com/microsoft/playwright/security/policy).

Independent oracle: compare extracted fields against release detail headings/date,
the LICENSE title and policy instructions; record retrieval date, since “latest”
changes. Require distinct page visits and extraction receipts, not merely a final
page containing a keyword.

Free/no-login: public repository reading. Permission scope: `https://github.com`
only; linked documentation and reporting sites are outside this task. Blockers:
GitHub has repeated nav labels, optional signed-out prompts and failing compare
menus; use the release permalink and skip comparison UI.

## 2. Shortlist small local models without downloading them — preferred

Starting URL: <https://huggingface.co/Qwen/Qwen3-0.6B>

Ready-to-paste goal:

> Compare Qwen/Qwen3-0.6B, Qwen/Qwen3-1.7B and
> HuggingFaceTB/SmolLM2-360M-Instruct. Open each model card, its Files tab and
> config.json when needed. Extract parameter count, license, stated context or
> max_position_embeddings, and safetensors weight-file sizes. Identify the model
> with the smallest displayed weight footprint. Keep repository total size
> separate from weight size. Do not download weights, run inference, sign in or
> create an account.

Visible sequence: model-card sections → Files → config → next model in a tab →
repeat; inspect sharded weights, then compare. It answers an actual device/disk
planning question and is materially more complex than a dropdown exercise.

Expected snapshot:

| Model | Parameters | License | Context/config | Displayed safetensors weights |
| --- | --- | --- | --- | --- |
| Qwen3-0.6B | 0.6B | Apache 2.0 | 32,768 | 1.5 GB |
| Qwen3-1.7B | 1.7B | Apache 2.0 | 32,768 | shards: 3.44 GB + 622 MB |
| SmolLM2-360M-Instruct | 360M | Apache 2.0 | max_position_embeddings: 8,192 | 724 MB |

SmolLM2’s repository displays 5.02 GB because it contains other artifacts; this
must not be presented as its single weight-file size. Smallest weights do not
establish accuracy, speed or real RAM needs. [Qwen 0.6B card](https://huggingface.co/Qwen/Qwen3-0.6B),
[files](https://huggingface.co/Qwen/Qwen3-0.6B/tree/main),
[Qwen 1.7B card](https://huggingface.co/Qwen/Qwen3-1.7B),
[files](https://huggingface.co/Qwen/Qwen3-1.7B/tree/main),
[SmolLM2 card](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct),
[files](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/tree/main),
[config](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/blob/main/config.json).

Independent oracle: card fields plus the actual Files rows/config property;
assert sharded-file coverage and correct separation from repository size.
Free/no-login: these three cards/file listings were public and ungated.
Permission: `https://huggingface.co` only; no CDN/model download origins are needed.
Blockers: dynamic card navigation and prominent inference/install controls; avoid
the inference provider panel and never turn code snippets into executable actions.

## 3. Check browser compatibility before shipping a feature

Starting URL:
<https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>

Ready-to-paste goal:

> Research structuredClone, ResizeObserver and CSS container-type on MDN. Open
> each reference, use its Browser compatibility section, and extract first
> supported desktop Chrome, Firefox and Safari versions. For a product targeting
> Chrome 100, Firefox 100 and Safari 15.4, identify which feature exceeds any
> target. Follow the container-query guide and extract one fallback approach.
> Include source URLs. Read documentation only; do not run examples or post.

Visible sequence: compatibility anchor → expand table details if needed → docs
navigation/search → second reference → third reference → related guide → fallbacks.

Expected support table: structuredClone 98/94/15.4; ResizeObserver 64/69/13.1;
container-type 105/110/16. The target comparison therefore flags container-type.
The guide describes grid/flex alternatives. [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone),
[ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver),
[container-type](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/container-type),
[guide](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries).

Independent oracle: MDN’s separately retrieved compatibility JSON:
[structuredClone](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/_globals/structuredClone.json),
[ResizeObserver](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ResizeObserver.json),
[container-type](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/container-type.json).
Use each main feature’s `__compat.support`, not experimental subfeatures.
Free/no-login: public docs. Permission: `https://developer.mozilla.org`; the JSON
oracle is a validator input, not an extra browser-task origin. Blocker: the text
research renderer omitted compatibility table contents; the real hydrated table
must be checked before claiming agent support. Long nav lists and expanded rows
will stress page compression. Treat this as a stretch example.

## 4. Discover datasets for a city-service analysis

Starting URL:
<https://catalog.data.gov/dataset/311-service-and-information-requests>

Ready-to-paste goal:

> Compare the Philadelphia “311 Service and Information Requests” dataset with
> New York’s “311 Service Requests from 2020 to Present” in Data.gov. Extract
> publisher, access level, coverage, update information, CSV resource names and
> their URLs, plus any displayed license or terms link. For Philadelphia include
> the 2025 and 2026 CSV resources. Capture links without opening Download. Do not
> download the datasets, contact publishers, submit requests or sign in. Mark
> missing license information as not stated.

Visible sequence: read description → resource list → metadata/Access & Use →
open second dataset in tab → extract and reconcile fields. The output is a useful
data-source inventory rather than a simulated data grid.

Verified facts: both access levels are public; Philadelphia starts December 8,
2014 and lists yearly CSVs plus a terms URL; its page warns that the dataset is
very large. NYC covers 2020 to present, has a CSV export URL and showed a September
15, 2026 update. Do not treat public access as a universal reuse license.
[Philadelphia](https://catalog.data.gov/dataset/311-service-and-information-requests),
[NYC](https://catalog.data.gov/dataset/311-service-requests-from-2010-to-present).

Independent oracle: compare extracted resource URLs against each page’s complete
metadata/harvest record and compare missing fields explicitly. No need to fetch
the data itself. Permission: `https://catalog.data.gov` only; publisher/license
URLs are returned as strings. Free/no-login: verified public catalog pages.
Blockers: many repetitive Download labels and oversized CSVs. Search URL
`/dataset/?q=311&res_format=CSV` failed in the research renderer, so catalog search
and filtering are **unverified**; use these verified landing URLs for the first
trial and only add search after browser validation.

## 5. Audit whether a web prototype fits free hosting limits — preferred

Starting URL:
<https://developers.cloudflare.com/workers/platform/limits/>

Ready-to-paste goal:

> Audit Cloudflare’s free Workers plan for a prototype expecting 60,000 Worker
> requests/day, 8 ms CPU/request, 40 external subrequests/request, 80 MB memory,
> 6,000 static files of 1 MiB each, and one 100 MB D1 database with 200,000 rows
> read and 10,000 rows written/day. Navigate from Workers limits to pricing,
> Static Assets billing and D1 limits. Extract each applicable free limit and
> source URL, then flag anything outside a limit. Explain whether static-asset
> requests are treated separately. Read public documentation only; do not open
> a dashboard, create an account, deploy, subscribe or change settings.

Visible sequence: limits table/anchors → pricing/D1 section → static-asset billing
page → D1 limits page → reconcile numbers. This produces a concrete deployment
planning checklist with four source documents.

Expected limit snapshot: 100,000 requests/day; 10 ms CPU; 128 MB memory; 50 external
subrequests; 20,000 static files, 25 MiB each; D1 500 MB/database, 5 GB account
storage, 5 million rows read/day and 100,000 written/day. Static-asset requests are
free/unlimited when served directly; invoking a Worker uses Worker quotas.
The supplied workload fits the listed numeric limits; that is an inference from
estimates and does not prove runtime capacity or a zero bill for other services.
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[static-assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Independent oracle: separately extract the named Free-column rows from all four
documents and evaluate each numeric workload/limit pair; distinguish rows scanned
from rows returned. Free/no-login: public documentation reading. Permission:
`https://developers.cloudflare.com` only. Blockers: very long navigation lists,
similar billing tables and login/deploy links. The browser should never follow
dashboard links or interpret the workload as permission to provision resources.

## Priority for product examples

1. GitHub dependency audit: useful to this product’s own audience; four distinct
   pages, honest security research and a precise result oracle.
2. Hugging Face model shortlist: aligns with the low-cost/local-model idea and
   gives meaningful card/file/tab navigation; catches deceptive repo-size totals.
3. Cloudflare free-plan audit: a practical business/developer planning task across
   four styled documentation pages; source-grounded numeric checks.

MDN is a valuable stretch trial once hydrated compatibility tables are checked.
Data.gov is suitable for metadata discovery, but catalog search is not yet
verified and downloading its full datasets is intentionally excluded.
