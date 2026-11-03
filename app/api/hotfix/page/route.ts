import { fileDownloadHandlers } from "@/lib/serve-file"

export const { GET, HEAD } = fileDownloadHandlers(
  "app/leads/page.tsx",
  "page.tsx",
  "text/plain; charset=utf-8",
)
