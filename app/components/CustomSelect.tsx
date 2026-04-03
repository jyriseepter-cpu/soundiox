"use client";

import { useState, useRef, useEffect } from "react";

type Option = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
};

export default function CustomSelect({
  value,
  onChange,
  options,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="
          flex h-10 w-full cursor-pointer items-center justify-between rounded-xl
          bg-gradient-to-r from-cyan-400 to-sky-400
          px-4 text-sm font-semibold text-white
          ring-1 ring-cyan-200/40
          backdrop-blur
          transition hover:opacity-95
        "
      >
        <span className="truncate">{selected ? selected.label : "Select"}</span>
        <span className="ml-2 text-xs text-white/90">▼</span>
      </button>

      {open ? (
        <div
          className="
            absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl
            border border-cyan-200/20
            bg-gradient-to-b from-cyan-400/85 to-sky-500/75
            p-2
            shadow-2xl
            backdrop-blur-xl
          "
        >
          {options.length === 0 ? (
            <div className="rounded-xl border border-white/15 bg-white/18 px-3 py-2 text-sm font-medium text-white/90">
              No playlists yet.
            </div>
          ) : (
            options.map((option) => {
              const isActive = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                    isActive
                      ? "bg-white/30 text-white"
                      : "bg-white/10 text-white/95 hover:bg-white/18"
                  }`}
                >
                  {option.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
