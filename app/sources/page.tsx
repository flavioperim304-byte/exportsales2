import Link from "next/link"
import { SourcesForm } from "@/components/sources-form"

export default function SourcesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-4xl">Sources</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The desk stays disconnected until these keys are saved. The same values can go in the file api-keys.env at the top of the project, next to API-KEYS.txt. The worked example on the desk does not need them.
        </p>
      </div>
      <SourcesForm />
    </main>
  )
}
