import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#05070A",
};

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

const sans = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ATLAS / Distributed ZK Proving",
  description:
    "A research pipeline that parallelizes Groth16 proof generation across a Kafka-coordinated worker pool. Real benchmarks, live demo, methodology.",
  metadataBase: new URL("https://atlas.example"),
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "ATLAS / Distributed ZK Proving",
    description: "Proving is the bottleneck. Verifying is cheap. So we distribute proving.",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ATLAS — distributed ZK proving pipeline",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ATLAS / Distributed ZK Proving",
    description: "Proving is the bottleneck. Verifying is cheap. So we distribute proving.",
    images: ["/twitter-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
