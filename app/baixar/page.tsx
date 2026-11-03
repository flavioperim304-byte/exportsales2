export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Download</p>
      <h1 className="mt-2 font-serif text-3xl">Reconstruir o projeto</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Este zip é o repositório inteiro. No Windows: botão direito → Extrair tudo. Não abra com o Bloco de notas. Suba
        a pasta extraída na raiz do GitHub <strong>exportsales2</strong> — um único commit, não arquivo por arquivo.
      </p>
      <a
        href="/api/export-desk.zip"
        download="export-desk.zip"
        className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
      >
        Baixar export-desk.zip
      </a>
      <p className="mt-4 text-sm text-muted-foreground">
        Na raiz: <code>package.json</code>, <code>main.py</code>, <code>requirements.txt</code>, <code>app/</code>,{" "}
        <code>lib/</code>, <code>components/</code>. O mesmo repo alimenta o dashboard Node (
        <code>exportsales</code>) e o FastAPI (<code>exportsales2</code>).
      </p>
    </main>
  )
}
