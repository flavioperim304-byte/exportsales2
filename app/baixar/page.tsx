export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Deploy</p>
      <h1 className="mt-2 font-serif text-3xl">Dois lotes para o GitHub</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        O site do GitHub aceita no máximo 100 arquivos por upload. O desk tem 134, por isso um zip
        só corta o <code>/trade</code>. São dois arrastos, cada um abaixo de 100. Windows: botão
        direito → Extrair tudo. Não abra com o Bloco de notas.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href="/api/lote-1.zip"
          download="lote-1.zip"
          className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Lote 1 — app e tela
        </a>
        <a
          href="/api/lote-2.zip"
          download="lote-2.zip"
          className="inline-flex rounded-lg border border-border px-5 py-3 text-sm"
        >
          Lote 2 — lib e testes
        </a>
      </div>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          Abra{" "}
          <a
            href="https://github.com/flavioperim304-byte/exportsales2/upload/main"
            className="underline-offset-2 hover:underline"
          >
            github.com/flavioperim304-byte/exportsales2/upload/main
          </a>
          .
        </li>
        <li>
          Extraia o lote 1. Entre na pasta. Ctrl+A nos itens (<code>app</code>,{" "}
          <code>components</code>, <code>package.json</code>). Arraste para a página. Não arraste a
          pasta lote-1 inteira. Commit em <code>main</code>.
        </li>
        <li>
          Extraia o lote 2. Ctrl+A (<code>lib</code>, <code>tests</code>). Arraste de novo. Commit.
        </li>
        <li>
          Confira no GitHub se existem <code>app/trade/page.tsx</code> e{" "}
          <code>lib/anchors.ts</code>. Sem isso o Render continua 404.
        </li>
        <li>
          Render → serviço Node <strong>exportsales</strong> → Manual Deploy → Deploy latest commit.
          Não apague o disco.
        </li>
      </ol>
    </main>
  )
}
