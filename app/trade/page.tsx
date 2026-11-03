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
          A página de Company Data do TradeInData não é Bill of Lading. O cartão mostra nome, país,
          last trade date, um recorte de PRODUCTS, HSCODE(S) com totais, barras dos últimos meses e
          TOTAL SHIPMENT da empresa inteira. TOP TRADING COUNTRIES e TOP 5 PORTS vêm quase sempre
          mascarados (*** ) sem assinatura. Contatos ficam atrás de Subscribe. Cole austsham, jap,
          hk, uz, ger, UAE ou o dump do Panamá — o desk só lê essa ficha. Na Nova busca, Dump + API:
          Exa confirma ou descarta o nome, Firecrawl lê a página, depois busca similares.
        </p>
      </div>
      <TradeForm />
    </main>
  )
}
