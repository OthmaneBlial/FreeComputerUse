# FreeComputerUse

**An autonomous browser agent that spends tokens on thinking, not clicking.**

TypeScript and Playwright. A model plans batches of validated browser actions;
local code extracts the DOM, executes, verifies, and reuses successful workflows.
Screenshots are an optional fallback, not the main observation loop.

## Development status

This repository is being built incrementally. The initial commit contains the
project configuration and [implementation contract](docs/IMPLEMENTATION.md).
Runnable milestones and measured results will be documented as they pass checks.
No external-model results are claimed and no API credentials are included.

## Configuration

Node 22.13 or newer is required. Install dependencies with `npm ci` and Chromium
with `npx playwright install chromium`. Copy `.env.example` to `.env` locally,
then set your model, endpoint and API key. `.env` and local browser state are
excluded from Git.

MIT licensed.
