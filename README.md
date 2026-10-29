# Export desk

Export sales intelligence for a supplier you already represent. The desk qualifies buyers in four steps and keeps the evidence next to the score.

1. **Search — Exa Agent.** One agent run per target country, locked to search mode (`effort: medium` on `POST /agent/runs`). It returns up to 10 companies and their websites. It does not score them. The query is built from the brief.
2. **ICP and contacts — Firecrawl Agent.** Each company is read by `POST /v2/agent` for role, products, markets, and published email, website, phone, and WhatsApp. A blank field means it was not published.
3. **Score and best fit — OpenAI.** A structured score assigns high, medium, or low for each supplier and a preliminary best fit (`supplier`, `both`, or `neither`). That is not a confirmed order.
4. **Refine and context — Parallel.** The default is one Task API call (`pro-fast`, falling back to `pro`, about $0.14 a call). It checks the OpenAI score, writes the market and competitor note with citations, and sets the final best fit. Choosing Decisions on that run calls `POST /v1/decisions` in `fast` mode instead, and only for that run.

A local checklist still files page evidence beside those scores. It is shown only when neither OpenAI nor Parallel has scored the list. The worked example is in that state.

The worked example (Serra Alta, specialty coffee, Minas Gerais) is on the desk with no API keys. Its companies and citations are sample material.

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
```

Or open [Sources](http://127.0.0.1:3847/sources) from the top bar (**Sources 0/4** means nothing is connected yet). Those values are written to `data/secrets.json` (mode 0600, gitignored) and are sent only to those four APIs. An environment variable wins over a saved key. The key routes return connection flags, never the key values.

Live runs are stored in `data/runs.json`. Exa Agent and Parallel can each take several minutes. Leave the run open. If Parallel is still going after eight minutes, the desk keeps OpenAI’s score and attaches Parallel’s final best fit when you reopen the run.

Each live run spends one Exa Agent search per country (a second search only if that country returned fewer than 10 companies), one Firecrawl Agent read per lead, one OpenAI score, and one Parallel task. Ten countries means about 100 company reads. The qualification form shows the prompts and the page count before you start.

## Deploy on Netlify

This is a Next.js 16 app. Netlify runs it with its OpenNext adapter. `netlify.toml` sets the build to `npm run build` and the publish directory to `.next`. Leave `@netlify/plugin-nextjs` unpinned so Netlify updates the adapter on each build.

Upload this repository as it is. Do not paste files out of a text dump. Those dumps start each file with a line like `===== tsconfig.json =====`, and Netlify stops on that line. `tsconfig.json` has to start with `{`. `app/globals.css` has to be in the repository next to `app/layout.tsx`. The config file is `next.config.mjs`.

1. Create a new empty Git repository and push this whole project to `main`.
2. In Netlify, add a site from that repository. The build command is `npm run build` and the publish directory is `.next`. Node 22 is set in `netlify.toml`.
3. Deploy. The API keys already live in the Netlify site environment. The desk is `/`. `/qualify` starts a search. `/sources` shows whether those keys are connected.

A live qualification writes `data/runs.json` on the server and keeps working after the HTTP response returns. On Netlify those files do not survive the next function call, and the pipeline stops when that call ends. The worked example still opens. For searches that run for several minutes, keep the desk on a long-lived Node process (`npm run start`) and put the four keys in the environment.
