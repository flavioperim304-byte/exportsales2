# Meridian

Export sales intelligence for a supplier you already represent. Meridian qualifies buyers in four steps and keeps the evidence next to the score.

1. **Search and enrichment — Exa.** One company search per target country, asking for 10 buyers of the supplier’s products, with page text, highlights, and a short summary. The query is built from the brief, so it changes when the supplier, the buyer, the must-haves, or the prompt instructions change.
2. **Data extraction — Firecrawl.** Each company page is read into a buyer profile: role, what they buy and sell, markets, certifications, and quotes.
3. **Best fit — Parallel.** One deep-research task (`pro-fast`, falling back to `pro`) assigns high, medium, or low for each supplier, names the best fit (`supplier`, `both`, or `neither`), and writes what still needs confirmation. It also returns the category outlook, competitor suppliers, and citations. Those levels are not a confirmed order.
4. **Evidence checklist.** A fixed rubric files product fit, buyer role, geography, must-haves, commercial readiness, competitive opening, and evidence quality beside Parallel’s score. It does not choose the best fit. Exclusions and peer exporters in the same origin are still marked from the brief. Every point is tied to a passage. Until Parallel returns, the desk shows this checklist and labels it as such.

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

Set them in `api-keys.env` at the project root (next to `API-KEYS.txt` and `package.json`):

```bash
EXA_API_KEY=
FIRECRAWL_API_KEY=
PARALLEL_API_KEY=
```

Or open [Sources](http://127.0.0.1:4317/sources) from the top bar (**Sources 0/3** means nothing is connected yet). Those values are written to `data/secrets.json` (mode 0600, gitignored) and are sent only to the three APIs. An environment variable wins over a saved key.

Live runs are stored in `data/runs.json`. Parallel assigns best fit and can take several minutes. Leave the run open; if it is still going after eight minutes, the desk keeps the evidence checklist and attaches Parallel’s score when you reopen the run.

Each live run spends one Exa search per country (a second search only if that country returned fewer than 10 companies), one Firecrawl scrape per lead, and one Parallel task. Ten countries means about 100 page reads. The qualification form shows the prompts and the page count before you start.
