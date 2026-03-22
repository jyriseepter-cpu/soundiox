"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "cookies";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function handleChoice(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}

    setVisible(false);
  }

  if (!visible) return null;

  const topOffset = "calc(env(safe-area-inset-top) + 120px)";

  return (
    <div className="fixed left-0 right-0 z-[55] px-4" style={{ top: topOffset }}>
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-white/85">
            We use essential cookies to make SoundioX work (login, security).
            Optional cookies may be used later (e.g. analytics) only with your
            consent.{" "}
            <Link
              href="/legal/cookies"
              className="underline text-white/90 hover:text-white"
            >
              Learn more
            </Link>
            .
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleChoice("rejected")}
              className="rounded-2xl bg-white/10 px-5 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
            >
              Reject
            </button>

            <button
              type="button"
              onClick={() => handleChoice("accepted")}
              className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:opacity-95"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
