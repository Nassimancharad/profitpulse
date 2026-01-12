"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DropdownOption = {
  value: string;
  label: string;
};

type DropdownSelectProps = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  menuClassName?: string;
  buttonLabel?: string;
};

export function DropdownSelect({
  value,
  options,
  onChange,
  className,
  menuClassName,
  buttonLabel,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLabel = useMemo(() => {
    const match = options.find((option) => option.value === value);
    return match?.label ?? options[0]?.label ?? "";
  }, [options, value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className={`relative ${className ?? ""}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="pp-btn pp-btn-secondary glass-inset h-10 w-full max-w-full min-w-0 justify-between px-3 text-sm font-semibold sm:w-auto"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={buttonLabel ?? "Select option"}
      >
        <span className="truncate">{currentLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4 text-[color:var(--pp-muted)]"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          className={`pp-card glass-surface--strong absolute right-0 z-50 mt-2 w-64 p-2 shadow-2xl shadow-black/15 ${menuClassName ?? ""}`}
          role="menu"
        >
          <div className="space-y-1 py-1">
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
                  role="menuitem"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm leading-tight transition ${
                    active
                      ? "glass-inset border border-[color:var(--pp-border)] bg-white/60 text-[color:var(--pp-foreground)]"
                      : "text-[color:var(--pp-muted)] hover:border hover:border-[color:var(--pp-border)] hover:bg-white/50"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active ? (
                    <span
                      aria-hidden
                      className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[color:var(--pp-accent)]"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
