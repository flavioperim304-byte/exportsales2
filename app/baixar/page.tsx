export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Deploy</p>
      <h1 className="mt-2 font-serif text-3xl">Implantar no Render</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        https://exportsales.onrender.com/trade ainda dá 404. Este zip é o repositório inteiro (Dump+API, Aduana,
        Company Atlas). No Windows: botão direito → Extrair tudo. Não abra com o Bloco de notas.
      </p>
      <a
        href="/api/export-desk.zip"
        download="export-desk.zip"
        className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
      >
        Baixar export-desk.zip
      </a>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          Extraia na raiz do GitHub <strong>exportsales2</strong>. Se o Windows criar uma pasta, copie o conteúdo. Um
          único commit em <code>main</code> — não use Upload files no site.
        </li>
        <li>
          Render → serviço Node <strong>exportsales</strong> → Manual Deploy → Deploy latest commit. Não apague o disco.
        </li>
        <li>
          Pronto quando <code>/trade</code> abrir. Fontes → Connect with Google liga o Atlas em{" "}
          <code>https://exportsales.onrender.com/api/atlas/callback</code>.
        </li>
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Na raiz: <code>package.json</code>, <code>main.py</code>, <code>requirements.txt</code>,{" "}
        <code>app/trade/page.tsx</code>, <code>lib/dump-search.ts</code>, <code>lib/company-atlas.ts</code>. O mesmo
        repo alimenta o dashboard Node (<code>exportsales</code>) e o FastAPI (<code>exportsales2</code>).
      </p>
    </main>
  )
}
