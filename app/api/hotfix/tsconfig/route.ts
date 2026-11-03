import { fileDownloadHandlers } from "@/lib/serve-file"

export const { GET, HEAD } = fileDownloadHandlers(
  "tsconfig.json",
  "tsconfig.json",
  "application/json",
)
