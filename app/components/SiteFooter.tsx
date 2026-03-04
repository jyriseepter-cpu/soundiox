import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 pt-10">
      {/* This is the "black strip" feeling: small spacing below footer */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-5 py-5 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-white/70">
            © {new Date().getFullYear()} SoundioX Labs OÜ • Reg. 17444586
          </div>

          <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Link className="text-white/70 hover:text-white" href="/legal/terms">
              Terms
            </Link>
            <span className="text-white/25">•</span>
            <Link className="text-white/70 hover:text-white" href="/legal/privacy">
              Privacy
            </Link>
            <span className="text-white/25">•</span>
            <Link className="text-white/70 hover:text-white" href="/legal/cookies">
              Cookies
            </Link>
            <span className="text-white/25">•</span>
            <Link className="text-white/70 hover:text-white" href="/about/pulse">
              About Pulse
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}