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
          Ainda não há plataforma assinada. Cole um CSV ou dump de qualquer fornecedor — o desk só
          normaliza nomes e marca ruído (logística, Amazon, marcas globais, amostra). Isso é
          indicação, com falsos, e não sobe Fit nem confirma importação. A API é que confirma ou
          descarta.
        </p>
      </div>
      <TradeForm />
    </main>
  )
}
