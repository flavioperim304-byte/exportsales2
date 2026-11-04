import Link from "next/link"
import { SourcesForm } from "@/components/sources-form"
import { WebhookLine } from "@/components/webhook-line"

export default function SourcesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Fontes</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The desk stays disconnected until these keys are saved. The same values can go in the file
          api-keys.env at the top of the project, next to API-KEYS.txt. Company Atlas is optional:
          Connect with Google here, or add the remote MCP URL in Cursor. O Postgres do Supabase
          cola nesta página (URI Session pooler, porta 5432) — o desk testa na hora e grava no
          disco. Não use a URL https do projeto nem a anon key. Fontes também pinga o RAG Python.
          Inventar contato, volume, marca ou compra é proibido. The worked example on the desk does
          not need them.
        </p>
      </div>
      <WebhookLine />
      <SourcesForm />
    </main>
  )
}
