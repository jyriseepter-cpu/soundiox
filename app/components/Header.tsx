"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <header className="w-full pt-8 px-6">
      <div className="mx-auto max-w-6xl">
        <div
          className="
            rounded-2xl
            border border-white/10
            backdrop-blur-xl
            shadow-[0_10px_40px_rgba(0,0,0,0.35)]
            bg-gradient-to-r
            from-[#22d3ee]/50
            via-[#6366f1]/40
            to-[#d946ef]/50
          "
        >
          <div className="flex items-center justify-between px-6 py-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <img
                src="/logo-new.png"
                alt="SoundioX"
                className="h-13 w-13 rounded-xl"
              />
              <div className="leading-tight">
                <div className="text-white font-semibold">
                  SoundioX
                </div>
                <div className="text-xs text-white/70 -mt-0.5">
                  AI Music Only
                </div>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-8 text-sm">
              <Link
                href="/discover"
                className={`transition ${
                  isActive("/discover")
                    ? "text-white"
                    : "text-white/80 hover:text-white"
                }`}
              >
                Discover
              </Link>

              <Link
                href="/pulse"
                className={`relative flex items-center gap-2 transition ${
                  isActive("/pulse")
                    ? "text-white"
                    : "text-white/80 hover:text-white"
                }`}
              >
                <span>Pulse</span>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 rounded-full bg-fuchsia-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-400 opacity-90" />
                </span>
              </Link>

              <Link
                href="/artists"
                className={`transition ${
                  isActive("/artists")
                    ? "text-white"
                    : "text-white/80 hover:text-white"
                }`}
              >
                Artists
              </Link>
            </nav>

            {/* CTA */}
            <Link
              href="/login"
              className="
                rounded-xl px-5 py-2.5 font-semibold text-white transition
                bg-gradient-to-r from-cyan-400 via-sky-500 to-fuchsia-500
                hover:brightness-110 active:brightness-95
              "
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}