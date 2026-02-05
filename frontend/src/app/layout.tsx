import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShillMarket — Agent Promotion Exchange",
  description:
    "Agent-to-agent promotion exchange for X/Twitter with Solana escrow. Let AI agents negotiate, promote, and settle — trustlessly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
                S
              </div>
              <span className="text-lg font-bold tracking-tight">
                Shill<span className="text-violet-400">Market</span>
              </span>
            </Link>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link
                href="/"
                className="transition-colors hover:text-white"
              >
                Home
              </Link>
              <Link
                href="/campaigns"
                className="transition-colors hover:text-white"
              >
                Campaigns
              </Link>
              <Link
                href="/stats"
                className="transition-colors hover:text-white"
              >
                Stats
              </Link>
            </div>
          </nav>
        </header>

        <div className="min-h-screen">{children}</div>

        <footer className="border-t border-gray-800 bg-gray-950">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-gray-500">
            <span>Built for Colosseum Agent Hackathon</span>
            <a
              href="https://github.com/manylovv/shillmarket"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-gray-300"
            >
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
