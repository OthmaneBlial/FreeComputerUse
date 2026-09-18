# Useful consumer and public-data browser tasks

Researched 18 September 2026 using five search queries and primary website opens.
Read-only Chromium inspection confirmed HTTP 200 and usable HTML controls on the
five starting websites below. This verifies current source access and visible
controls; **none of these full tasks has been run through our agent**. Numerical
route results and current catalog dates must be checked at execution time.

## 1. Compare real laptop specifications for a two-monitor desk

**Starting URL:** <https://www.apple.com/mac/compare/>

**Pasteable goal:**

```text
Compare MacBook Air 13-in. (M1, 2020), MacBook Air 13-in. (M2), and MacBook Air 13-in. (M3). Select them in the three comparison columns, then extract a table with model, display size and brightness, maximum unified memory, wireless-web battery life, camera resolution, weight in kg, and external display support. Verify the monitor limitation using the matching Apple Support technical specifications pages. Identify which of these models can use two external monitors and state the lid requirement. Include source links. Do not shop, contact a specialist, or purchase anything.
```

**Meaningful interaction:** three model selectors → scroll comparison sections →
open supporting technical specifications in tabs → compare and qualify limits.
Three native `select` elements (`selector-0`, `selector-1`, `selector-2`) appeared
after JavaScript initialization; options include all three requested models.

**Expected output / independent oracle:** check each returned row against a
separate deterministic extraction of [M1 specs](https://support.apple.com/en-us/111883),
[M2 specs](https://support.apple.com/en-us/111867), and
[M3 specs](https://support.apple.com/en-us/118551). M1: 13.3-inch, 400 nits,
16 GB maximum, 720p camera, 1.29 kg. M2/M3: 13.6-inch, 500 nits, 24 GB maximum,
1080p camera, 1.24 kg. All list up to 15 hours wireless web. M3 lists a second
external display up to 5K/60Hz when the lid is closed; M1/M2 list one external
display. Treat battery figures as manufacturer test claims.

**Access / permission / blockers:** free comparison and documentation, no login.
Approve `www.apple.com`; separately approve `support.apple.com` when opened.
Region banners, delayed selectors, similarly named columns, extremely long DOM,
and comparison cells implemented outside a semantic table need testing. Keep the
result focused on specifications; do not click Shop or Chat.

## 2. Find the right real open dataset before downloading huge files

**Starting URL:** <https://catalog.data.gov/>

**Pasteable goal:**

```text
Find Washington State's Electric Vehicle Population Data. Search for electric vehicle population, open the filters, restrict organization type to State Government and require a downloadable file. Open the matching Washington dataset and extract its title, publishing organization, publisher, scope description, last-updated date, access level, license, and every offered resource format. Collect the exact CSV download URL and the source landing-page URL without downloading the dataset. Include a source link for every field.
```

**Meaningful interaction:** search → open filter accordions → apply two filters
→ wait for updated results → choose authoritative dataset → inspect resources
and metadata. The current catalog has search, sort, filter accordions and
“Only show datasets with a downloadable file”; map drawing is unnecessary.

**Expected output / independent oracle:** the
[authoritative catalog record](https://catalog.data.gov/dataset/electric-vehicle-population-data)
identifies State of Washington, publisher `data.wa.gov`, public access and
ODbL 1.0. Formats are JSON, XML, CSV, KML, KML and GEOJSON: preserve the two KML
resources because their underlying MIME types differ. CSV URL:
`https://data.wa.gov/api/v3/views/f6w7-q2d2/export.csv?accessType=DOWNLOAD`.
Validate normalized output against the record's Complete Metadata section in a
separate read. Compare the date with the live record rather than freezing it.

**Access / permission / blockers:** free metadata without login. Approve
`catalog.data.gov`; collecting an external URL needs no navigation approval,
but opening `data.wa.gov` requires separate website approval. Large metadata JSON
cells, filter result refreshes and similar dataset names need careful handling.
Do not download the unbounded whole CSV or use the canvas map.

## 3. Prepare an evidence-backed travel statistics brief and small PDF

**Starting URL:** <https://www.gov.uk/government/statistics/national-travel-survey-2024>

**Pasteable goal:**

```text
Prepare a short research brief for England's National Travel Survey 2024. Open the HTML factsheet and extract average annual trips, miles and travel hours per person, average cycling trips, and the share of households owning at least one car. Include the publication date, population/geographic scope and sources. Return to the publication page, find the 2024 factsheet PDF and save only that PDF locally. Avoid the Excel/ODS ZIP archives, subscriptions, feedback forms and surveys.
```

**Meaningful interaction:** distinguish publication year from data year → open
HTML factsheet → extract multiple sections → return → choose correct small PDF.

**Expected output / independent oracle:** the
[HTML factsheet](https://www.gov.uk/government/statistics/national-travel-survey-2024/nts-2024-factsheet)
and [two-page PDF](https://assets.publishing.service.gov.uk/media/68e8f5af57038b5739b98656/NTS_Factsheet_2024.pdf)
support 922 trips, 6,082 miles, 362 hours, 15 cycling trips and 78% of households
owning at least one car. Publication: 27 August 2025; data: England 2024.
An independent PDF text check plus actual saved-file receipt verifies output.
The PDF header currently reports `application/pdf`, 605,506 bytes (the page
labels it 591 KB), and filename `NTS_Factsheet_2024.pdf`.

**Access / permission / blockers:** free/no login. Approve `www.gov.uk` and the
document origin `assets.publishing.service.gov.uk`; explicitly authorize this
one small public-file save. The PDF uses **Content-Disposition: inline**: a
click may open Chromium's PDF viewer instead of raising a Playwright download.
Our current DOM-only agent cannot inspect PDF-viewer canvas content. Until public
inline-resource saving works, use the same goal ending with “collect the PDF URL
without downloading it.” Cookie banner is visible; do not subscribe or send
feedback. Check 2024 specifically; 2025 is already the latest collection release.

## 4. Compare accessible London journeys using real route preferences

**Starting URL:** <https://tfl.gov.uk/plan-a-journey/>

**Pasteable goal:**

```text
Plan a public transport journey from London Waterloo station to King's Cross St Pancras station, leaving tomorrow at 09:00 London time. Select the station suggestions rather than similarly named streets. First find the fastest route with no accessibility requirement, then repeat with full step-free access and a maximum walk of 10 minutes. Expand the itinerary details and extract departure, arrival, duration, interchange count, transport lines, walking segments, and any accessibility or disruption warnings for the first two alternatives in each search. Include the requested date/time and result source URLs. Do not book, buy, save favourites, or save preferences.
```

**Meaningful interaction:** location autocomplete selection → departure/date/time
→ expand preferences → first search → expand legs → change accessibility/walking
constraints → repeat and compare. HTML exposes From/To, Leaving/Arriving, mode,
accessibility radio options, route preference and maximum-walk controls.

**Expected output / independent oracle:** two correctly scoped sets of real
itineraries. Check the submitted controls/result URL and independently extract
expanded result cards from the live page, matching each returned leg, duration
and warning. Do not pin a fabricated route or duration; the network changes.

**Access / permission / blockers:** free planner, no login or ticket purchase.
Approve `tfl.gov.uk`; route search is within read-only research scope. Separate
origin approval may be needed if the browser navigates elsewhere. Autocomplete,
hidden preference sections, date semantics, delayed route responses and live
disruption changes make this an advanced candidate. Form/source verified only;
successful full route generation has not been verified here. Use textual routes,
not map gestures. “Save these preferences” stays unchecked.

## 5. Verify a public-domain reading edition instead of trusting a book title

**Starting URL:** <https://en.wikisource.org/wiki/Author:Jane_Austen>

**Pasteable goal:**

```text
Find Jane Austen's Pride and Prejudice and compare the available 1813 first edition with the 1817 third edition. Open both edition pages in tabs. Extract a table containing edition, publication year, volume count, chapter count, and a link to Chapter 1. Check that each Chapter 1 link opens readable English text. Provide the publisher information shown on the versions/title pages and the source URLs. Do not edit pages, sign in, create an account, donate, or download a whole book.
```

**Meaningful interaction:** author bibliography → work's versions page → two
edition tabs → count chapters across volume groups → follow Chapter 1 → return.

**Expected output / independent oracle:** the
[versions page](https://en.wikisource.org/wiki/Pride_and_Prejudice) labels the
1813 first edition as three volumes and the 1817 third edition as two, published
by T. Egerton, Whitehall. The [1813 edition](https://en.wikisource.org/wiki/Pride_and_Prejudice_(1813))
has chapter groups 23 + 19 + 19 = 61; the
[1817 edition](https://en.wikisource.org/wiki/Pride_and_Prejudice_(1817))
has 33 + 28 = 61. Independently count chapter links inside article content by
volume, not every navigation link. Verify chapter destination belongs to the
selected edition and contains readable prose. This checks actual edition identity
and usable reading links, not search-result labels alone.
Read-only Chromium extraction independently counted 61 chapter links on each
edition page and confirmed distinct first-chapter destinations:
`/wiki/Pride_and_Prejudice_(1813)/Volume_1/Chapter_1` and
`/wiki/Pride_and_Prejudice_(1817)/Chapter_1`.

**Access / permission / blockers:** free public text and metadata, no login.
Approve `en.wikisource.org` only; external exports are out of scope. Version
disambiguation, repeated Chapter 1 labels, content-side navigation and a very long
chapter page need testing. Attribute Wikisource when reusing its metadata.

## Priorities and exclusions

Start actual agent trials with Data.gov and the GOV.UK HTML brief; then Apple and
Wikisource; keep TfL as advanced dynamic-page validation. Preserve precise task
oracles and measure correctness, calls/tokens, repair and compatible repeats.

Raspberry Pi's official product pages are useful source material but returned a
Cloudflare HTTP 403 challenge in our Chromium inspection; do not claim current
automated access. Open Library timed out and Library of Congress returned 403 via
the source tool, so neither is labeled verified accessible. Exclude Project
Gutenberg's interactive website: its
[robot access policy](https://www.gutenberg.org/policy/robot_access.html) expressly
restricts automated website access. Do not bypass challenges, permissions or
website access policies. Safe simulations can reproduce these interaction types
with explicit source attribution, without claiming a real-site task passed.
