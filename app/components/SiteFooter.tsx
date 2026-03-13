"use client";

import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 py-10 text-sm text-white/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center md:flex-row md:justify-between md:text-left">

        {/* Left */}
        <div>
          <p className="font-semibold text-white">SoundioX</p>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} SoundioX Labs OÜ
          </p>
        </div>

        {/* Middle */}
        <div className="flex gap-6">
          <Link href="/legal/terms" className="hover:text-white">
            Terms
          </Link>

          <Link href="/legal/privacy" className="hover:text-white">
            Privacy
          </Link>

          <Link href="/legal/cookies" className="hover:text-white">
            Cookies
          </Link>
        </div>

        {/* Right */}
        <div>
          <a
            href="mailto:support@soundiox.io"
            className="hover:text-white"
          >
            support@soundiox.io
          </a>
        </div>

      </div>
    </footer>
  );
}