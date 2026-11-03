export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Deploy</p>
      <h1 className="mt-2 font-serif text-3xl">Dois arquivos para o Render voltar</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Pare de subir lote-1 e lote-2. O GitHub já tem o overlay, mas o último arrasto abriu a pasta{" "}
        <code>lib</code> e jogou os <code>.ts</code> na raiz. Por isso o Node quebra no{" "}
        <code>next build</code> e o live fica no deploy antigo (<code>/trade</code> 404). Este zip
        tem só o <code>tsconfig.json</code> e a página <code>/leads</code>. Windows: botão direito →
        Extrair tudo. Não abra com o Bloco de notas.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <a
          href="/api/consertar-build.zip"
          download="consertar-build.zip"
          className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          consertar-build.zip — só 2 arquivos
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
          Extraia o zip. Entre na pasta. Arraste os dois itens: o arquivo{" "}
          <code>tsconfig.json</code> e a pasta <code>app</code>. Não abra <code>app</code> nem{" "}
          <code>leads</code>. Não arraste a pasta consertar-build inteira.
        </li>
        <li>
          Commit em <code>main</code>. Confira no GitHub se{" "}
          <code>app/leads/page.tsx</code> ainda está dentro de <code>app/leads</code> (não na raiz).
        </li>
        <li>
          Render → serviço Node <strong>exportsales</strong> → Manual Deploy → Deploy latest commit.
          Não apague o disco.
        </li>
        <li>
          Se https://exportsales2.onrender.com mostrar <code>status: ok</code>, não mexa no Python.
          Não reenvie o CSV do Panamá.
        </li>
      </ol>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Pronto quando https://exportsales.onrender.com/trade abrir. Os arquivos soltos na raiz do
        GitHub podem ficar: o tsconfig novo ignora eles. Não arraste de novo o conteúdo de{" "}
        <code>lib</code>.
      </p>
    </main>
  )
}
