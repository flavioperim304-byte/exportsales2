import Link from "next/link"
import { TradeForm } from "@/components/trade-form"

export default function TradePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            Desk
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Aduana</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Outras plataformas entram igual: cola o dump, o recorte diz se o lixo visível vale o
          preço. No Panamá que já temos, metade cai antes da API (Unilever, Avon, amostra, zona
          livre). O que sobra ainda pode ser falso — só Exa, Firecrawl ou quem já comprou de você
          fecha isso. Cole austsham, jap, hk, uz, ger, UAE ou outro xlsx. Dump + API na Nova busca.
        </p>
      </div>
      <TradeForm />
    </main>
  )
}
