# Export desk

Export sales intelligence for a supplier you already represent. The desk qualifies buyers in four steps and keeps the evidence next to the score.

1. **Search — Exa.** Buyer search still runs one Agent per country (10 companies). **Dump + API** is the other path: names from the Aduana file seed the list (logistics and global brands already out). [The Company Atlas](https://thecompanyatlas.com/mcp) (optional, Google OAuth, 50 credits/month across 36 markets) can match an HS 3305 customs line and fill the occupied-book partners in overlapping countries. Exa must still confirm each company on the web or it is dropped as a possible false dump record. Confirmed names then get a similar-importer search in that country. Atlas absence is not proof the dump is false. An Atlas line is not a Kanechom/LQ purchase. The dump never confirms a purchase.
2. **ICP and contacts — Firecrawl Agent.** Each company is read by `POST /v2/agent` for role, products, markets, and published email, website, phone, and WhatsApp. A blank field means it was not published.
3. **Activity, commerce, and best fit — Exa search + OpenAI.** Exa looks for news, product launches, new brands, and social posts from the last 18 months. A second pair of Exa Search queries looks for restock posts, trade-fair exhibitor lists, open-book language, and purchasing-hire ads. Restock on a public page can count as a buying fact. An Exa mention of “aduana” or a paid trade dump does not — those sources have false records and are not a bill of lading. A fair or a hiring post does not unlock best fit. Fit stays medium or low without published last purchase, stock, or sales.
4. **Refine and context — Parallel.** The default is one Task API call (`pro-fast`, falling back to `pro`, about $0.14 a call). It checks the OpenAI score, writes the market and competitor note with citations, and sets the final best fit. Choosing Decisions on that run calls `POST /v1/decisions` in `fast` mode instead, and only for that run.
5. **Commercial due diligence — on demand.** After the four stages finish, you pick companies and a brand (Kanechom and/or LQ). The desk scores six blocks with a fixed table, runs complementary Exa searches only for checklist gaps, and stores a dated report per brand. Opportunity does not add to Fit. Import is confirmed from published importer language or a last purchase on the page — not from a trade dump, an Exa customs mention, or the word “shipment” in an empty Parallel checklist. A paid trade CSV or dump (austsham, jap, hk, uz, ger, UAE, Panama) can be pasted under **Aduana** as an indication (logistics and global brands are flagged). It does not confirm purchase. Use **Dump + API** on Nova busca so Exa and Firecrawl confirm or reject each name, then search similar importers. There is no live subscription to ImportGenius, PANADATA, or TradeInData.

A local checklist still files page evidence beside those scores. It is shown only when neither OpenAI nor Parallel has scored the list. The worked example is in that state.

The worked example (Serra Alta, specialty coffee, Minas Gerais) is on the desk with no API keys. Its companies and citations are sample material.

## Implantar no Render (GitHub `exportsales2`)

O live https://exportsales.onrender.com/trade ainda dá **404** enquanto o GitHub `flavioperim304-byte/exportsales2` estiver truncado (sem `app/trade`, Dump+API, Atlas). Este ambiente não tem token de GitHub nem de Render: o overlay é o zip, depois um commit em `main` e **Manual Deploy**.

Não suba arquivo por arquivo no site do GitHub. Extraia o zip na **raiz** do repositório (se o Windows criar uma pasta `export-desk`, copie o conteúdo). Um único commit. Na raiz têm de existir `package.json`, `main.py`, `requirements.txt`, `app/trade/page.tsx`, `lib/dump-search.ts`, `lib/company-atlas.ts` e `components/`.

O mesmo repositório alimenta **dois** Web Services no Render. Não apague o repo. Não apague os discos.

| Serviço | URL | Runtime | Build | Start | Disco | Env |
| --- | --- | --- | --- | --- | --- | --- |
| `exportsales` | https://exportsales.onrender.com | Node 22 | `npm ci && npm run build` | `npx next start -H 0.0.0.0 -p $PORT` | 1 GB em `/opt/render/project/src/data` | `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `PARALLEL_API_KEY`, `RAG_API_URL=https://exportsales2.onrender.com`, `DATABASE_URL` (Internal Database URL do Postgres) |
| `exportsales2` | https://exportsales2.onrender.com | Python 3 | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | 1 GB em `/var/data` | `CHROMA_PATH=/var/data/chroma` |

1. Extraia `export-desk.zip` na raiz de `exportsales2` e faça push de **um** commit em `main`.
2. No Render, abra o serviço Node **`exportsales`** → **Manual Deploy → Deploy latest commit**.
3. Espere Live. `/trade` tem de abrir; `/qualify` mostra Dump + API; Fontes → Connect with Google registra o callback `https://exportsales.onrender.com/api/atlas/callback`.
4. Ligue o Postgres ao serviço Node `exportsales` e grave `DATABASE_URL` com a **Internal Database URL** (não a External). Fontes mostra “Postgres (leads) Connected”. `/leads` lista as empresas. Sem essa variável o desk continua em `data/runs.json`. Não cole a senha no GitHub.
5. Aduana no live começa vazia (os dumps desta máquina não vão no zip). Cole de novo em `/trade`. Não reenvie o CSV do Panamá se `/enviar` no Python ainda está verde.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Use `127.0.0.1`, not `localhost`. Port 4317 is left free because OpenTelemetry uses it. The process listens on `0.0.0.0` so the desktop port forward can reach it.

```bash
npm test
npm run lint
```

## Keys

A live qualification needs an Exa key. Firecrawl, OpenAI, and Parallel each run their own stage. A missing key skips that stage and the desk says so.

Set them in `api-keys.env` at the project root (next to `API-KEYS.txt` and `package.json`):

```bash
EXA_API_KEY=
FIRECRAWL_API_KEY=
OPENAI_API_KEY=
PARALLEL_API_KEY=
COMPANY_ATLAS_TOKEN=
```

`COMPANY_ATLAS_TOKEN` is optional. The desk can also store a Google OAuth session after **Fontes → Connect with Google**. `.cursor/mcp.json` already points Cursor at `https://thecompanyatlas.com/mcp`; toggle **thecompanyatlas** on under Settings → Tools & MCP and sign in with Google. That chat MCP is the same trial; the live Render run still needs the desk login.

A Dump + API run spends at most 12 Atlas credits: one HS 3305 rank per overlapping country (cap 4), a shipment search only when the rank missed dump names, then partner breakdown for matched registry ids. The free plan is 50 credits per calendar month, one credit per tool call, 10 shipment lines per call. Matching of party names to company ids is incomplete for 2026 lines. Limited markets (Panama, Kenya, Ethiopia, …) are thinner. Markets not in the 36 (UAE, Japan, Germany, Mexico, …) skip Atlas and stay on Exa + Firecrawl.

Or open [Sources](http://127.0.0.1:3847/sources) from the top bar (**Sources 0/4** means nothing is connected yet). Those values are written to `data/secrets.json` (mode 0600, gitignored) and are sent only to those four APIs. An environment variable wins over a saved key. The key routes return connection flags, never the key values.

Live runs are stored in Postgres when `DATABASE_URL` is set (Render Internal Database URL on the Node service). The desk creates `desk_runs` and `desk_leads` on first connect and copies existing `data/runs.json` into an empty database once. Without that variable, live runs stay in `data/runs.json`. Keys, Aduana dumps, and Chroma stay out of Postgres. Exa Agent and Parallel can each take several minutes. Leave the run open. If Parallel is still going after eight minutes, the desk keeps OpenAI’s score and attaches Parallel’s final best fit when you reopen the run.

Each live run spends one Exa Agent search per country (a second search only if that country returned fewer than 10 companies), one Firecrawl Agent read per lead, one Exa Search per lead for activity and two more for commercial signals, one OpenAI score, and one Parallel task. Ten countries means about 100 company reads. The qualification form shows the prompts and the page count before you start. Firecrawl Agent is given about 70 seconds per page; if it stays pending, the desk tries a fast scrape and then moves on so scoring is not blocked. After eight minutes the remaining pages are skipped.

An HS code on the brief asks [Comex Stat](https://api-comexstat.mdic.gov.br/docs) for Brazil’s export value (US$ FOB) and net kg to each search country for the last three years. Hair-care briefs use 3305. The search still runs if Comex Stat is slow or empty. If the API returns 429, the desk waits the requested 10 seconds, retries, and fills the volume later without stopping the run.

Set `RAG_API_URL` (for example `https://exportsales2.onrender.com`) so a live search compares each company to the Chroma index. Exa still finds names. The index only confirms or caps fit: a match adds a little, a miss keeps the company on the list but caps the evidence index at 48. The desk still runs if that URL is missing.

## FastAPI RAG (exportsales2)

This is a second Render Web Service (Python), not the Node dashboard. Do not delete the GitHub repo. Replace `main.py` in place, commit, then **Manual Deploy → Deploy latest commit**.

Keep the 1 GB disk at `/var/data` and `CHROMA_PATH=/var/data/chroma`. `/enviar` still takes the dashboard CSV. After this deploy, open `/perguntar` to query the index. You do not need to re-send the CSV if the 10 companies are already green.

On the **Node** dashboard service, add `RAG_API_URL=https://exportsales2.onrender.com` and deploy the desk files that call `/api/v1/match` (`lib/rag.ts`, `lib/pipeline.ts`, `lib/fit-probability.ts`, `lib/types.ts`, `lib/csv.ts`, `components/run-desk.tsx`). The env var alone does not show RAG. After that deploy, opening a finished run fills RAG on companies that still lack it.

## Deploy on Render

This desk is a long-running Node process, not a static site. On Render create a **Web Service** (not Static Site).

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npx next start -H 0.0.0.0 -p $PORT` |
| Node | 22 |
| Disk | 1 GB at `/opt/render/project/src/data` |

Render injects `PORT`. Do not hardcode 3847 in the start command. After a successful deploy the dashboard is already running: open the service and click the `https://….onrender.com` URL at the top. There is no separate Execute button.

Put the four keys in an Environment Group and link that group to this service. Do not prefix them with `NEXT_PUBLIC_`. Redeploy after linking the group. **Fontes** on the live site should read 4/4.

Saved Kanechom and LQ searches from another machine are not copied over. The first load shows the coffee example until you run **Nova busca** on Render.

`render.yaml` in this repo matches those settings. A starter Web Service plus a 1 GB disk is the plan this desk needs so a search can run for several minutes and keep `data/runs.json`.

## Deploy on Netlify

This is a Next.js 16 app. Netlify runs it with its OpenNext adapter. `netlify.toml` sets the build to `npm run build` and the publish directory to `.next`. Leave `@netlify/plugin-nextjs` unpinned so Netlify updates the adapter on each build.

Upload this repository as it is. Do not paste files out of a text dump. Those dumps start each file with a line like `===== tsconfig.json =====`, and Netlify stops on that line. `tsconfig.json` has to start with `{`. `app/globals.css` has to be in the repository next to `app/layout.tsx`. The config file is `next.config.mjs`.

1. Create a new empty Git repository and push this whole project to `main`.
2. In Netlify, add a site from that repository. The build command is `npm run build` and the publish directory is `.next`. Node 22 is set in `netlify.toml`.
3. Deploy. The API keys already live in the Netlify site environment. The desk is `/`. `/qualify` starts a search. `/sources` shows whether those keys are connected.

A live qualification writes `data/runs.json` on the server and keeps working after the HTTP response returns. On Netlify those files do not survive the next function call, and the pipeline stops when that call ends. The worked example still opens. For searches that run for several minutes, keep the desk on a long-lived Node process (`npm run start`) and put the four keys in the environment.
