export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Download</p>
      <h1 className="mt-2 font-serif text-3xl">Baixar o zip da due diligence</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Este é um arquivo .zip, não um texto. No Windows: clique com o botão direito → Extrair tudo. Não abra com o
        Bloco de notas. Depois copie as pastas <code>lib</code> e <code>components</code> para o GitHub{" "}
        <strong>exportsales2</strong>, no mesmo lugar.
      </p>
      <a
        href="/api/desk-rag.zip"
        download="desk-rag.zip"
        className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
      >
        Baixar desk-rag.zip
      </a>
      <p className="mt-4 text-sm text-muted-foreground">
        Dentro: <code>lib/diligence.ts</code>, <code>lib/fit-probability.ts</code>, <code>lib/qualify.ts</code>,{" "}
        <code>components/run-desk.tsx</code>.
      </p>
    </main>
  )
}
