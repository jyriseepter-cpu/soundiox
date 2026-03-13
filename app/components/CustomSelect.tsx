"use client";

import { useEffect, useRef, useState } from "react";

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
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) || options[0] || null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(103,232,249,0.88),rgba(34,211,238,0.82),rgba(56,189,248,0.76))] px-4 text-left text-sm font-medium text-white shadow-[0_8px_24px_rgba(34,211,238,0.18)] ring-1 ring-white/12 backdrop-blur-md transition hover:border-cyan-100/45 hover:bg-[linear-gradient(135deg,rgba(125,240,255,0.95),rgba(45,220,240,0.88),rgba(72,196,255,0.82))]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? ""}</span>

        <span
          className={`ml-3 text-[11px] text-white/95 transition duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-cyan-200/35 bg-[linear-gradient(180deg,rgba(103,232,249,0.82),rgba(34,211,238,0.72),rgba(56,189,248,0.68))] shadow-[0_18px_50px_rgba(0,0,0,0.34)] ring-1 ring-white/12 backdrop-blur-2xl">
          <div role="listbox" className="max-h-72 overflow-y-auto p-2">
            {options.map((option) => {
              const active = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    active
                      ? "bg-white/22 text-white ring-1 ring-white/20"
                      : "text-white/95 hover:bg-white/12 hover:text-white"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active ? <span className="ml-3 text-white">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}