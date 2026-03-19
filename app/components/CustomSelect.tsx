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
      {/* SELECT BUTTON */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="
          h-10 w-full rounded-xl px-4 text-sm font-semibold
          text-white
          bg-gradient-to-r from-cyan-400 to-sky-400
          ring-1 ring-cyan-200/40
          backdrop-blur
          flex items-center justify-between
          hover:opacity-95
        "
      >
        <span className="truncate">
          {selected ? selected.label : "Select"}
        </span>
        <span className="ml-2 text-xs">▼</span>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div
          className="
            absolute z-50 mt-2 w-full
            rounded-2xl
            bg-[#89d7ff]/95
            backdrop-blur
            ring-1 ring-white/20
            shadow-2xl
            p-2
          "
        >
          {options.map((option) => {
            const isActive = option.value === value;

            return (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`
                  w-full text-left px-3 py-2 rounded-xl
                  text-sm font-semibold
                  transition
                  ${
                    isActive
                      ? "bg-white/30 text-white"
                      : "text-white/95 hover:bg-white/20"
                  }
                `}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}