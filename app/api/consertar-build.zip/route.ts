import { zipResponseHandlers } from "@/lib/serve-zip"

export const { GET, HEAD } = zipResponseHandlers("consertar-build.zip")
