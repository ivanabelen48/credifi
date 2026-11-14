import type { Metadata, Viewport } from "next";
import PwaServiceWorker from "@/components/pwa-service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credifi",
  description: "Tu billetera del barrio para compras al fiado sin comisiones",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Credifi",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/credifi.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/credifi-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/credifi-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/credifi-192x192.png", type: "image/png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090B",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaServiceWorker />
      </body>
    </html>
  );
}
