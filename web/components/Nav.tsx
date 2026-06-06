"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { REPO_URL } from "@/lib/links";

const SECTIONS = [
  { id: "hero", label: "00 // INDEX" },
  { id: "explainer", label: "01 // CIRCUIT" },
  { id: "architecture", label: "02 // PIPELINE" },
  { id: "demo", label: "03 // DEMO" },
  { id: "benchmarks", label: "04 // BENCH" },
  { id: "chain", label: "05 // CHAIN" },
  { id: "methodology", label: "06 // METHOD" },
];

export function Nav() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-30% 0% -50% 0%", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-0 z-30 border-b border-ink-600/70 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] flex items-center justify-between px-4 sm:px-6 py-3 gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-2 w-2 bg-signal animate-pulse-signal" aria-hidden />
          <span className="font-mono text-sm tracking-widest text-mute-50">
            ATLAS<span className="text-mute-300/70 ml-2">::</span>
            <span className="text-mute-200 ml-2">DISTRIBUTED ZK PROVING</span>
          </span>
        </div>
        <ul className="hidden md:flex items-center gap-1 text-[10px] font-mono tracking-widest">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={clsx(
                  "px-2 py-1 transition-colors",
                  active === s.id
                    ? "text-signal bg-signal/10 border border-signal/30"
                    : "text-mute-300 hover:text-mute-100 border border-transparent",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-2 border border-signal/40 px-2.5 py-1 font-mono text-[10px] tracking-widest text-signal hover:bg-signal/10 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            CLONE & RUN
          </a>
          <div className="font-mono text-[10px] tracking-widest text-mute-300 hidden md:block">
            REV/0.1 // BUILD <span className="text-mute-100">2026.06.06</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
