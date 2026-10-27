import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-serif text-3xl">This qualification is not on the desk.</h1>
      <p className="text-sm text-muted-foreground">
        It may have been started on another machine. The worked example is always available.
      </p>
      <Button className="h-10 w-fit px-4" render={<Link href="/" />}>
        Back to the desk
      </Button>
    </main>
  )
}
