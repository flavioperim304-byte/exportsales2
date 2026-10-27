# Meridian

Export sales intelligence for a supplier you already represent. Meridian qualifies buyers in four steps and keeps the evidence next to the score.

1. **Search and enrichment — Exa.** Company search for buyers of the supplier’s products in the target markets, with page text, highlights, and a short summary.
2. **Data extraction — Firecrawl.** Each company page is read into a buyer profile: role, what they buy and sell, markets, certifications, and quotes.
3. **Market context — Parallel.** One deep-research task (`pro-fast`, falling back to `pro`) on the shortlist: category outlook, competitor suppliers, and a fit note per lead with citations.
4. **ICP classification.** A fixed rubric scores product fit, buyer role, geography, must-haves, commercial readiness, competitive opening, and evidence quality. Exclusions and peer exporters in the same origin are disqualified even when the wording overlaps. Every point is tied to a passage.

The worked example (Serra Alta, specialty coffee, Minas Gerais) is on the desk with no API keys. Its companies and citations are sample material.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

```bash
npm test
npm run lint
```

## Keys

A live qualification needs an Exa key. Firecrawl and Parallel are optional: a missing key skips that stage and the score says the evidence was not collected.

Set them in `.env.local`:

```bash
EXA_API_KEY=
FIRECRAWL_API_KEY=
PARALLEL_API_KEY=
```

Or paste them in **Sources** on the desk. Those values are written to `data/secrets.json` (mode 0600, gitignored) and are sent only to the three APIs. An environment variable wins over a saved key.

Live runs are stored in `data/runs.json`. Parallel deep research can take several minutes. Leave the run open; if it is still going after eight minutes, Meridian scores the evidence it already has and attaches the report when you reopen the run.

Each live run spends Exa search calls, one Firecrawl scrape per lead (JSON extraction), and one Parallel task.
