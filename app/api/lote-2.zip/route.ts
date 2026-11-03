import { zipResponseHandlers } from "@/lib/serve-zip"

export const { GET, HEAD } = zipResponseHandlers("lote-2.zip")
