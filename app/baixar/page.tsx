export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Deploy</p>
      <h1 className="mt-2 font-serif text-3xl">Baixe os arquivos. Não cole.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Os commits <code>Update tsconfig.json</code> e <code>Update page.tsx</code> no GitHub não
        mudaram nenhuma linha. O Render repetiu o erro antigo: o <code>tsconfig</code> ainda
        compila os <code>.ts</code> da raiz, e o <code>/leads</code> ainda quebra o{" "}
        <code>next build</code>. Não cole código. Não suba lote. Baixe cada arquivo e arraste no
        link certo.
      </p>

      <h2 className="mt-8 font-serif text-xl">1. tsconfig.json</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Vai na <strong>raiz</strong> do repositório (ao lado de <code>package.json</code>).
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href="/api/hotfix/tsconfig"
          download="tsconfig.json"
          className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Baixar tsconfig.json
        </a>
        <a
          href="https://github.com/flavioperim304-byte/exportsales2/upload/main"
          className="inline-flex rounded-lg border border-border px-5 py-3 text-sm"
        >
          Abrir upload da raiz no GitHub
        </a>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Arraste só esse arquivo. Commit. No GitHub, abra o arquivo: tem de aparecer{" "}
        <code>app/**/*.ts</code>. Se ainda aparecer <code>**/*.ts</code>, o upload não substituiu.
      </p>

      <h2 className="mt-8 font-serif text-xl">2. page.tsx das leads</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Vai em <code>app/leads/</code>. Não solte na raiz.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href="/api/hotfix/page"
          download="page.tsx"
          className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Baixar page.tsx
        </a>
        <a
          href="https://github.com/flavioperim304-byte/exportsales2/upload/main/app/leads"
          className="inline-flex rounded-lg border border-border px-5 py-3 text-sm"
        >
          Abrir upload de app/leads no GitHub
        </a>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Arraste só esse arquivo. Commit. No GitHub, a primeira linha tem de ter a palavra{" "}
        <code>Suspense</code>.
      </p>

      <h2 className="mt-8 font-serif text-xl">3. Render</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          Serviço Node <strong>exportsales</strong> → Manual Deploy → Deploy latest commit. Não
          apague o disco.
        </li>
        <li>
          Python (exportsales2) já está ok. Não mexa. Não reenvie o CSV do Panamá.
        </li>
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Pronto quando https://exportsales.onrender.com/trade abrir.
      </p>
    </main>
  )
}
