export default function BaixarPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Deploy</p>
      <h1 className="mt-2 font-serif text-3xl">Uma chave. Eu mando o GitHub.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        O upload pelo site do GitHub já falhou várias vezes (pasta aberta, commits com 0 linhas).
        Não vamos repetir. Você cola <strong>uma chave pública</strong> nas configurações do repo.
        Eu faço o <code>git push</code> da árvore certa. O Render pega esse commit.
      </p>

      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          Abra{" "}
          <a
            href="https://github.com/flavioperim304-byte/exportsales2/settings/keys"
            className="underline-offset-2 hover:underline"
          >
            github.com/flavioperim304-byte/exportsales2/settings/keys
          </a>
          . Tem de estar logado na conta dona do repo.
        </li>
        <li>
          Add deploy key. Title: <code>cursor-export-desk</code>. Marque{" "}
          <strong>Allow write access</strong>. Sem write eu não consigo enviar.
        </li>
        <li>
          Cole a chave abaixo (uma linha, começa com <code>ssh-ed25519</code>). Add key.
        </li>
        <li>
          Volte aqui e escreva <strong>chave ok</strong>. Eu envio o desk inteiro e o Node no
          Render pode implantar. Não apague o disco. Não mexa no Python.
        </li>
      </ol>

      <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed break-all whitespace-pre-wrap">
        {`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEK57AUOSSJIA9fQxQkKk3iFzlamwHBwwSDznLpy82mM cursor-export-desk-render`}
      </pre>
      <a
        href="/cursor-deploy.pub"
        download="cursor-deploy.pub"
        className="mt-3 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
      >
        Baixar a chave pública
      </a>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Isso não abre o Desktop e não arrasta pasta. É um único clique nas settings. Se o GitHub
        pedir senha da conta, é normal. Não crie outro repositório. Não suba lote-1 nem lote-2.
      </p>
    </main>
  )
}
