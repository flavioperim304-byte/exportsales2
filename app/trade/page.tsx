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
          No plano barato o TradeInData mostra a ficha Product/Company Data, não o Bill of Lading.
          Nome, país, last trade date, DESCRIPTION no HS filtrado, totais e barras dos meses vêm
          abertos. TOP TRADE PARTNERS, origem, porto e contato ficam em ***. View details é o
          gráfico mensal da empresa, ainda sem BL. Cole austsham, jap, hk, uz, ger, UAE ou o dump
          do Panamá. Na Nova busca, Dump + API: Exa confirma o nome, Firecrawl lê a página, depois
          similares.
        </p>
      </div>
      <TradeForm />
    </main>
  )
}
