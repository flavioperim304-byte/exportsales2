"use client"

import Link from "next/link"

export default function Error({ error }: { error: Error }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="font-serif text-3xl">O Painel não carregou</h1>
      <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
      <p className="mt-4 text-sm">
        <Link href="/leads" className="underline-offset-2 hover:underline">
          Abrir Leads
        </Link>
        {" · "}
        <Link href="/qualify" className="underline-offset-2 hover:underline">
          Nova busca
        </Link>
      </p>
    </main>
  )
}
