import type { MetadataRoute } from "next"

import { BRAND_GREEN } from "@/lib/app-icon"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LazyChef",
    short_name: "LazyChef",
    description: "One shared pantry, shopping list and recipe finder for your household.",
    start_url: "/pantry",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRAND_GREEN,
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  }
}
