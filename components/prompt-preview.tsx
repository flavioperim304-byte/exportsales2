import {
  exaQuery,
  exaSystemPrompt,
  firecrawlPrompt,
  LEADS_PER_COUNTRY,
  openaiInstructions,
  parallelInstructions,
  targetCountries,
} from "@/lib/prompts"
import type { Brief } from "@/lib/types"

export function PromptPreview({ brief, bare = false }: { brief: Brief; bare?: boolean }) {
  const countries = targetCountries(brief)
  const reads = countries.length * LEADS_PER_COUNTRY
  return (
    <section className={bare ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-xl border border-border bg-card p-4"}>
      <div>
        <h2 className="font-serif text-2xl">Prompts</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          These are rebuilt from the brief as you type. Exa Agent stays in search mode,{" "}
          {LEADS_PER_COUNTRY} companies per country. Firecrawl Agent then collects ICP fields and contacts.
          {countries.length > 0
            ? ` This run would read ${reads} ${reads === 1 ? "page" : "pages"}.`
            : ""}
        </p>
      </div>
      {countries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add at least one target market. A prompt appears here for each country.
        </p>
      ) : (
        countries.map((country) => (
          <article key={country} className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="font-serif text-xl">{country}</h3>
            <PromptBlock label="Exa Agent · search" text={`${exaSystemPrompt()}\n\n${exaQuery(brief, country)}`} />
            <PromptBlock label="Firecrawl Agent" text={firecrawlPrompt(brief, country)} />
          </article>
        ))
      )}
      <article className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-serif text-xl">All countries</h3>
        <PromptBlock label="OpenAI" text={openaiInstructions(brief)} />
        <PromptBlock label="Parallel · deep research" text={parallelInstructions(brief)} />
      </article>
    </section>
  )
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 font-sans text-sm leading-relaxed text-foreground">
        {text}
      </pre>
    </div>
  )
}
