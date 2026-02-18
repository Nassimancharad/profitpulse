"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDaysToDateKey, parseDateKey, toTimeZoneDateKey } from "@/lib/timezone";

type Preset = "today" | "7d" | "30d" | "custom";

type Props = {
  startDate: string;
  endDate: string;
  timezone: string;
};

export function TimeRangeSelector({ startDate, endDate, timezone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("30d");
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const containerRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery("(max-width: 640px)");

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setDialogOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (dialogOpen && startInputRef.current) {
      startInputRef.current.focus();
    }
  }, [dialogOpen]);

  const label = useMemo(() => {
    const startObj = dateKeyToDate(startDate);
    const endObj = dateKeyToDate(endDate);
    if (!startObj || !endObj) return `${startDate} – ${endDate}`;
    const sameDay =
      startObj.getUTCFullYear() === endObj.getUTCFullYear() &&
      startObj.getUTCMonth() === endObj.getUTCMonth() &&
      startObj.getUTCDate() === endObj.getUTCDate();
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    if (sameDay) return fmt(startObj);
    return `${fmt(startObj)} – ${fmt(endObj)}`;
  }, [startDate, endDate]);

  const updateRange = (nextStart: string, nextEnd: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("start", nextStart);
    params.set("end", nextEnd);
    router.push(`${pathname}?${params.toString()}`);
    setMenuOpen(false);
    setDialogOpen(false);
  };

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") {
      setMenuOpen(false);
      setDialogOpen(true);
      return;
    }
    const todayDateKey = toTimeZoneDateKey(new Date(), timezone);
    const end = todayDateKey;
    let start = end;
    if (next === "7d") {
      start = addDaysToDateKey(end, -6);
    }
    if (next === "30d") {
      start = addDaysToDateKey(end, -29);
    }
    if (next === "today") {
      start = end;
    }
    updateRange(start, end);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    updateRange(customStart, customEnd);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="pp-btn pp-btn-primary h-10 w-full min-w-0 max-w-full overflow-hidden px-4 text-sm font-medium leading-tight sm:w-auto sm:max-w-[260px] md:max-w-[340px]"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="h-3.5 w-3.5 text-[color:var(--pp-muted)]"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {menuOpen ? (
        <div
          className="pp-card glass-surface--strong absolute right-0 z-50 mt-2 w-64 p-2 shadow-2xl shadow-black/15"
          role="menu"
        >
          <div className="space-y-1 py-1">
            <PresetButton label="Today" active={preset === "today"} onClick={() => applyPreset("today")} />
            <PresetButton label="Last 7 days" active={preset === "7d"} onClick={() => applyPreset("7d")} />
            <PresetButton label="Last 30 days" active={preset === "30d"} onClick={() => applyPreset("30d")} />
            <PresetButton
              label="Custom range…"
              active={preset === "custom"}
              onClick={() => applyPreset("custom")}
            />
          </div>
        </div>
      ) : null}

      {dialogOpen ? (
        <Dialog onClose={() => setDialogOpen(false)} isMobile={isMobile}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Custom date range</h2>
              <p className="text-sm text-[color:var(--pp-muted)]">Choose a start and end date.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-[color:var(--pp-muted)]">
                From
                <input
                  ref={startInputRef}
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="pp-input mt-1"
                />
              </label>
              <label className="text-xs text-[color:var(--pp-muted)]">
                To
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="pp-input mt-1"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="pp-btn pp-btn-secondary glass-inset px-3.5 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustom}
                className="pp-btn pp-btn-primary px-3.5 py-2 text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function dateKeyToDate(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm leading-tight transition ${
        active
          ? "glass-inset border border-[color:var(--pp-border)] bg-white/60 text-[color:var(--pp-foreground)]"
          : "text-[color:var(--pp-muted)] hover:border hover:border-[color:var(--pp-border)] hover:bg-white/50"
      }`}
      role="menuitem"
    >
      <span>{label}</span>
      {active ? (
        <span
          aria-hidden
          className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-white"
        />
      ) : null}
    </button>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);
  return matches;
}

type DialogProps = {
  children: React.ReactNode;
  onClose: () => void;
  isMobile: boolean;
};

function Dialog({ children, onClose, isMobile }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="pp-modal-overlay absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        className={`pp-modal glass-inset relative w-full max-w-lg p-6 shadow-2xl shadow-black/15 ${
          isMobile ? "mx-4 self-end pb-8" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
