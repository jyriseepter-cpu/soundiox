"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function JoinWaveModal() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    // lock scroll behind modal
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus panel
    setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-6 py-3 font-semibold text-white ring-1 ring-white/10 hover:opacity-95"
      >
        Join the Wave
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]">
          {/* BACKDROP */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* PANEL */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/15 backdrop-blur focus:outline-none"
            >
              {/* HEADER */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
                <div className="min-w-0">
                  <div className="text-xs text-white/60">SoundioX • About</div>
                  <h2 className="truncate text-xl font-semibold text-white">
                    The Wave Has Started.
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                >
                  Close
                </button>
              </div>

              {/* CONTENT */}
              <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
                <p className="text-white/80">
                  AI music is at the very beginning of its journey. No one truly
                  knows where this road leads. But one thing is certain — it is
                  here to stay. And it will explode.
                </p>

                <p className="mt-4 text-white/80">
                  SoundioX exists to launch that explosion — as an{" "}
                  <span className="font-semibold text-white">AI Artist Launchpad</span>.
                </p>

                <h3 className="mt-8 text-lg font-semibold text-white">
                  What is Pulse?
                </h3>

                <p className="mt-2 text-white/80">
                  Pulse is not a chart. Pulse is not a competition.
                </p>

                <p className="mt-3 text-white/80">
                  Pulse is a{" "}
                  <span className="font-semibold text-white">community signal</span>.
                  Every like is your support for an artist. Every like is belief.
                  Every like is momentum.
                </p>

                <p className="mt-3 text-white/80">
                  The more likes an artist receives, the stronger their “starter
                  pack” becomes — the first audience, the first energy, the first
                  lift.
                </p>

                <div className="mt-6 rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
                  <div className="text-sm font-semibold text-white">
                    A note on rewards
                  </div>
                  <div className="mt-2 text-sm text-white/75">
                    Reward systems may evolve with community growth —
                    harmoniously, over time. We don’t lock the details too early.
                  </div>
                </div>

                <h3 className="mt-8 text-lg font-semibold text-white">
                  For artists
                </h3>
                <p className="mt-2 text-white/80">
                  Focus on{" "}
                  <span className="font-semibold text-white">quality</span>, not
                  quantity. Build identity. Build culture. Let the community
                  signal do its work.
                </p>

                <h3 className="mt-8 text-lg font-semibold text-white">
                  AI music is just getting started
                </h3>
                <p className="mt-2 text-white/80">
                  We’re witnessing the birth of a new creative era. AI artists are
                  not replacing music — they’re expanding what music can be.
                </p>
              </div>

              {/* ACTIONS */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
                <div className="text-xs text-white/60">
                  Tip: press <span className="text-white/80">Esc</span> to close.
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/about/pulse"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Read full About Pulse
                  </Link>

                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Become a Founding Artist
                  </Link>

                  <Link
                    href="/discover"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:opacity-95"
                  >
                    Go to Discover
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}