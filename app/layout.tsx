import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { PlayerProvider } from "@/app/components/PlayerContext";
import PlayerBar from "@/app/components/PlayerBar";
import Header from "@/app/components/Header";
import SiteFooter from "@/app/components/SiteFooter";
import CookieBanner from "@/app/components/CookieBanner";

export const metadata: Metadata = {
  title: "SoundioX",
  description: "The AI Artist Launchpad",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-b from-black via-neutral-900 to-black text-white">
        <PlayerProvider>
          <div className="min-h-screen flex flex-col">
            {/* HEADER */}
            <Header />

            {/* COOKIE BANNER (fixed, headeri alt) */}
            <CookieBanner />

            {/* PAGE CONTENT */}
            <main className="flex-1 player-safe-area">{children}</main>

            {/* FOOTER */}
            <div className="player-safe-area">
              <SiteFooter />
            </div>
          </div>

          {/* PLAYER BAR */}
          <PlayerBar />
        </PlayerProvider>
        <Analytics />
      </body>
    </html>
  );
}
