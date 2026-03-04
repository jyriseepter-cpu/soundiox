"use client";

import { useEffect, useRef } from "react";
import AboutPulseContent from "@/app/components/AboutPulseContent";

export default function AboutPulseModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // lock scroll behind modal
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus panel
    setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90]">
      {/* backdrop */}
      <button
        aria-label="Close About Pulse"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        type="button"
      />

      {/* panel */}
      <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
        <div
          ref={panelRef}
          tabIndex={-1}
          className="w-full max-w-3xl rounded-3xl border border-white/10 bg-black/60 ring-1 ring-white/10 backdrop-blur outline-none"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold text-white/90">
              About Pulse
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
              type="button"
            >
              Close
            </button>
          </div>

          {/* scrollable content */}
          <div className="max-h-[70vh] overflow-auto px-6 py-6">
            <AboutPulseContent />
          </div>
        </div>
      </div>
    </div>
  );
}