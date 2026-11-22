import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "USMLE Step 1 — Plan 12 semaines",
  description:
    "Planificateur USMLE Step 1 sur 12 semaines : séquence fléchée vidéo → First Aid → UWorld → annotation → Anki, recherches de tags du deck AnKing Step 1, et cours First Aid en PDF conservés sur l'appareil.",
  applicationName: "USMLE Step 1",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "USMLE Step 1",
  },
}

export const viewport: Viewport = {
  themeColor: "#131B2E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
