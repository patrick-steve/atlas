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
  openGraph: {
    title: "ATLAS / Distributed ZK Proving",
    description: "Proving is the bottleneck. Verifying is cheap. So we distribute proving.",
    type: "website",
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
