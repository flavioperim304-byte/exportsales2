<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Never invent

This desk forbids invention. The same rule binds every agent editing this repo and every model call (Exa, Firecrawl, OpenAI, Parallel).

- Use only published evidence in the candidate cards, cited URLs, page extracts, and the RAG line.
- If a contact, volume, brand in the book, last purchase, stock, sales figure, exclusivity, import, employee count, or intent to buy is not in that evidence, leave it empty or write unpublished.
- Do not fill gaps from training memory, typical distributors, similar countries, or what a company like this would usually do.
- Absence is not the opposite fact.
- A trade dump, Atlas customs line, or RAG neighbor is never a Kanechom or LQ purchase.
- A RAG neighbor is a different company. Do not copy its contacts, brands, or purchases onto this lead.

`evidenceRule()` in `lib/prompts.ts` must stay the first sentence of every Exa, Firecrawl, dump-similar, and diligence instruction. OpenAI and Parallel start with a ROLE heading and must still include `EVIDENCE RULE (mandatory): Never invent.` in a dedicated evidence section. `ragLine()` in `lib/rag.ts` must stay on every OpenAI and Parallel candidate card.

