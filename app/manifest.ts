import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "USMLE Step 1 — Plan 12 semaines",
    short_name: "USMLE Step 1",
    description: "Séquences AnKing Step 1 sur 12 semaines, avec cours First Aid en local.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2F4F1",
    theme_color: "#131B2E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
}
